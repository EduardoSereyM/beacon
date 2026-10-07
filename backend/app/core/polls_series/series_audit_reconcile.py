"""
BEACON PROTOCOL — Reconciliación del audit de ediciones de series
==================================================================
Si una edición se publica (o se fotografía) pero falla su escritura en `audit_logs`,
queda sin su fila `SERIES_EDITION_PUBLISHED` (o `SERIES_EDITION_SNAPSHOT`). Estos pasos
la detectan y la reescriben. Solo insertan: `audit_logs` es inmutable (no admite UPDATE,
DELETE ni TRUNCATE). Idempotentes: una vez escrita la fila, la edición deja de aparecer
como pendiente.
"""

import logging
from typing import Any

from app.core.audit_logger import audit_bus
from app.core.polls_series.series_snapshot import _chunks

logger = logging.getLogger("beacon.polls_series")

ACTION = "SERIES_EDITION_PUBLISHED"
SNAPSHOT_ACTION = "SERIES_EDITION_SNAPSHOT"


async def _without_audit(supabase, rows: list[dict[str, Any]], id_key: str, action: str) -> list[dict[str, Any]]:
    """Filas de `rows` cuyo `id_key` no tiene una fila `action` en audit_logs (entity_id = id_key)."""
    audited: set[str] = set()
    for chunk in _chunks([row[id_key] for row in rows]):
        found = await (
            supabase.table("audit_logs")
            .select("entity_id")
            .eq("action", action)
            .in_("entity_id", chunk)
            .execute()
        )
        audited.update(str(row["entity_id"]) for row in found.data or [])
    return [row for row in rows if str(row[id_key]) not in audited]


async def _unaudited_editions(supabase) -> list[dict[str, Any]]:
    polls = await (
        supabase.table("polls")
        .select("id, series_id, edition, template_version, created_by, created_at")
        .not_.is_("series_id", "null")
        .execute()
    )
    return await _without_audit(supabase, polls.data or [], "id", ACTION)


async def _unaudited_snapshots(supabase) -> list[dict[str, Any]]:
    snapshots = await (
        supabase.table("poll_results_snapshot")
        .select("poll_id, series_id, edition, total_votes, verified_votes, weighting_meta, created_at")
        .execute()
    )
    return await _without_audit(supabase, snapshots.data or [], "poll_id", SNAPSHOT_ACTION)


async def reconcile_edition_audit(supabase, actor_id: str) -> dict[str, list[str]]:
    """Reescribe el audit de las ediciones publicadas sin fila `SERIES_EDITION_PUBLISHED`.
    Un error en una edición no impide las demás."""
    reconciled: list[str] = []
    failed: list[str] = []
    for poll in await _unaudited_editions(supabase):
        try:
            await audit_bus.alog_event(
                actor_id=poll.get("created_by") or actor_id,
                action=ACTION,
                entity_type="POLL",
                entity_id=poll["id"],
                details={
                    "series_id": poll["series_id"],
                    "edition": poll["edition"],
                    "template_version": poll["template_version"],
                    "reconciled": True,
                    "published_at": str(poll["created_at"]),
                },
                raise_on_error=True,
            )
        except Exception:
            logger.exception(f"series: reconciliación de audit falló | poll={poll['id']}")
            failed.append(poll["id"])
            continue
        logger.warning(f"series: audit reconciliado | poll={poll['id']} | edition={poll['edition']}")
        reconciled.append(poll["id"])
    return {"audit_reconciled": reconciled, "audit_reconcile_failed": failed}


async def reconcile_snapshot_audit(supabase, actor_id: str) -> dict[str, list[str]]:
    """Reescribe el audit de los snapshots sin fila `SERIES_EDITION_SNAPSHOT`.
    Un error en un snapshot no impide los demás."""
    reconciled: list[str] = []
    failed: list[str] = []
    for snapshot in await _unaudited_snapshots(supabase):
        try:
            await audit_bus.alog_event(
                actor_id=actor_id,
                action=SNAPSHOT_ACTION,
                entity_type="POLL",
                entity_id=snapshot["poll_id"],
                details={
                    "series_id": snapshot["series_id"],
                    "edition": snapshot["edition"],
                    "total_votes": snapshot["total_votes"],
                    "verified_votes": snapshot["verified_votes"],
                    "weighting_status": (snapshot.get("weighting_meta") or {}).get("status"),
                    "reconciled": True,
                    "snapshot_at": str(snapshot["created_at"]),
                },
                raise_on_error=True,
            )
        except Exception:
            logger.exception(f"series: reconciliación de audit de snapshot falló | poll={snapshot['poll_id']}")
            failed.append(snapshot["poll_id"])
            continue
        logger.warning(f"series: audit de snapshot reconciliado | poll={snapshot['poll_id']} | edition={snapshot['edition']}")
        reconciled.append(snapshot["poll_id"])
    return {"snapshot_audit_reconciled": reconciled, "snapshot_audit_reconcile_failed": failed}
