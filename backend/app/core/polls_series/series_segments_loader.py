"""
BEACON PROTOCOL — Carga de los segmentos de una edición
========================================================
Una edición cerrada lee sus segmentos del snapshot (inmutables); la abierta, o un snapshot anterior a
la migración 029, los calcula en vivo. La posición política solo se entrega si el interruptor
SERIES_POLITICAL_SEGMENT_ENABLED está encendido, aunque el snapshot la haya guardado.
"""

from datetime import datetime
from typing import Any

from app.core.config import settings
from app.core.polls_series.privacy import MIN_N
from app.core.polls_series.series_analysis import analyze_edition
from app.core.polls_series.series_trend import is_open
from app.core.polls_series.series_window import edition_label


async def load_edition_segments(
    supabase, series: dict[str, Any], edition: str | None, now: datetime
) -> dict[str, Any] | None:
    """Segmentos de `edition` (o de la más reciente si es None). None si la edición no existe."""
    query = supabase.table("polls").select("*").eq("series_id", series["id"])
    if edition:
        query = query.eq("edition", edition)
    found = await query.order("edition", desc=True).limit(1).execute()
    if not found.data:
        return None
    poll = found.data[0]

    snapshot = await (
        supabase.table("poll_results_snapshot").select("results_segments").eq("poll_id", poll["id"]).limit(1).execute()
    )
    segments = snapshot.data[0].get("results_segments") if snapshot.data else None
    if segments is None:
        votes = await (
            supabase.table("poll_votes").select("user_id, option_value, voter_rank").eq("poll_id", poll["id"]).execute()
        )
        segments = (await analyze_edition(supabase, poll, votes.data or [])).segments

    if not settings.SERIES_POLITICAL_SEGMENT_ENABLED:
        segments = [s for s in segments if s["variable"] != "political"]

    return {
        "series": {"slug": series["slug"], "title": series["title"], "cadence": series["cadence"]},
        "edition": poll["edition"],
        "label": edition_label(poll["edition"]),
        "is_open": is_open(poll, now),
        "starts_at": poll["starts_at"],
        "ends_at": poll["ends_at"],
        "min_n": MIN_N,
        "segments": segments,
    }
