"""
BEACON PROTOCOL — Snapshot de ediciones cerradas
=================================================
El resultado de una edición cerrada ya no cambia, así que se calcula una vez y se
guarda en `poll_results_snapshot`; la tendencia lee el snapshot en vez de releer
todos los votos de cada edición. Idempotente: el cron puede reintentarse sin duplicar.
"""

import logging
from datetime import datetime, timedelta
from typing import Any

from app.core.audit_logger import audit_bus
from app.core.polls.aggregation import aggregate_by_question

logger = logging.getLogger("beacon.polls_series")

# Margen tras el cierre para no fotografiar con un voto todavía en vuelo.
SNAPSHOT_GRACE = timedelta(minutes=10)

# `in_` viaja en la URL de PostgREST: se trocea para no pasar su largo máximo.
IN_CHUNK = 100


def _chunks(items: list[str]):
    for start in range(0, len(items), IN_CHUNK):
        yield items[start:start + IN_CHUNK]


def build_snapshot_row(poll: dict[str, Any], votes: list[dict[str, Any]]) -> dict[str, Any]:
    """Fila de `poll_results_snapshot` para una edición cerrada (función pura)."""
    verified = [v for v in votes if v.get("voter_rank") == "VERIFIED"]
    return {
        "poll_id": poll["id"],
        "series_id": poll["series_id"],
        "edition": poll["edition"],
        "template_version": poll["template_version"],
        "total_votes": len(votes),
        "verified_votes": len(verified),
        "results_total": aggregate_by_question(poll, votes),
        "results_verified": aggregate_by_question(poll, verified),
        "closed_at": str(poll["ends_at"]),
    }


async def _pending_poll_ids(supabase, cutoff: str) -> list[str]:
    closed = await (
        supabase.table("polls")
        .select("id")
        .not_.is_("series_id", "null")
        .lt("ends_at", cutoff)
        .execute()
    )
    closed_ids = [row["id"] for row in closed.data or []]
    if not closed_ids:
        return []
    done_ids: set[str] = set()
    for chunk in _chunks(closed_ids):
        done = await supabase.table("poll_results_snapshot").select("poll_id").in_("poll_id", chunk).execute()
        done_ids.update(row["poll_id"] for row in done.data or [])
    return [poll_id for poll_id in closed_ids if poll_id not in done_ids]


async def _snapshot_one(supabase, poll: dict[str, Any], actor_id: str) -> None:
    votes = await (
        supabase.table("poll_votes").select("option_value, voter_rank").eq("poll_id", poll["id"]).execute()
    )
    row = build_snapshot_row(poll, votes.data or [])
    await supabase.table("poll_results_snapshot").insert(row).execute()
    logger.info(f"series: snapshot | poll={poll['id']} | edition={poll['edition']} | votes={row['total_votes']}")
    # El snapshot ya existe y no se borra: si el audit falla se reporta, no se oculta.
    await audit_bus.alog_event(
        actor_id=actor_id,
        action="SERIES_EDITION_SNAPSHOT",
        entity_type="POLL",
        entity_id=poll["id"],
        details={
            "series_id": poll["series_id"],
            "edition": poll["edition"],
            "total_votes": row["total_votes"],
            "verified_votes": row["verified_votes"],
        },
        raise_on_error=True,
    )


async def snapshot_closed_editions(supabase, actor_id: str, now: datetime) -> dict[str, list[str]]:
    """Fotografía las ediciones cerradas hace más de SNAPSHOT_GRACE que no tienen snapshot.
    Un error en una edición no impide las demás."""
    pending = await _pending_poll_ids(supabase, (now - SNAPSHOT_GRACE).isoformat())
    snapshotted: list[str] = []
    failed: list[str] = []
    if not pending:
        return {"snapshotted": snapshotted, "snapshot_failed": failed}

    for chunk in _chunks(pending):
        polls = await supabase.table("polls").select("*").in_("id", chunk).execute()
        for poll in polls.data or []:
            label = poll.get("slug") or poll["id"]
            try:
                await _snapshot_one(supabase, poll, actor_id)
            except Exception:
                logger.exception(f"series: error en snapshot | poll={poll['id']}")
                failed.append(label)
                continue
            snapshotted.append(label)
    return {"snapshotted": snapshotted, "snapshot_failed": failed}
