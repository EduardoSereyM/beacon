"""
BEACON PROTOCOL — Reconciliación del audit de ediciones publicadas
===================================================================
Si una edición se publica pero falla su escritura en `audit_logs`, queda una poll
de serie sin fila `SERIES_EDITION_PUBLISHED`. Este paso la detecta y la reescribe
(append-only: nunca modifica ni borra filas). Idempotente: una vez escrita la fila,
la edición deja de aparecer como pendiente.
"""

import logging
from typing import Any

from app.core.audit_logger import audit_bus
from app.core.polls_series.series_snapshot import _chunks

logger = logging.getLogger("beacon.polls_series")

ACTION = "SERIES_EDITION_PUBLISHED"


async def _unaudited_editions(supabase) -> list[dict[str, Any]]:
    polls = await (
        supabase.table("polls")
        .select("id, series_id, edition, template_version, created_by, created_at")
        .not_.is_("series_id", "null")
        .execute()
    )
    rows = polls.data or []
    audited: set[str] = set()
    for chunk in _chunks([row["id"] for row in rows]):
        found = await (
            supabase.table("audit_logs")
            .select("entity_id")
            .eq("action", ACTION)
            .in_("entity_id", chunk)
            .execute()
        )
        audited.update(str(row["entity_id"]) for row in found.data or [])
    return [row for row in rows if str(row["id"]) not in audited]


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
