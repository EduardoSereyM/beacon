"""
BEACON PROTOCOL — Tendencia de una serie de encuestas
======================================================
Arma, edición por edición, los resultados que dibuja el gráfico de tendencia.
Una edición cerrada se lee de `poll_results_snapshot`; la abierta (o la recién
cerrada, antes del primer cron) se calcula en vivo.

Privacidad estadística: un grupo con menos de MIN_N respuestas NO publica resultados
(`suppressed: true`, `results: null`). Con pocos votos un punto semanal se mueve
por azar y se leería como una noticia; es la misma lógica de la regla n<5 de los cross-tabs.
"""

from datetime import datetime
from typing import Any

from app.core.polls_series.series_snapshot import build_snapshot_row
from app.core.polls_series.series_weighting import weight_edition
from app.core.polls_series.series_window import edition_label

MIN_N = 30
DEFAULT_LIMIT = 52
MAX_LIMIT = 104


def is_open(poll: dict[str, Any], now: datetime) -> bool:
    try:
        start = datetime.fromisoformat(str(poll["starts_at"]).replace("Z", "+00:00"))
        end = datetime.fromisoformat(str(poll["ends_at"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return False
    return start <= now <= end


def _group(entry: dict[str, Any]) -> dict[str, Any]:
    n = entry["total_votes"]
    suppressed = n < MIN_N
    return {"n": n, "suppressed": suppressed, "results": None if suppressed else entry["results"]}


def _question(verified: dict[str, Any], total: dict[str, Any]) -> dict[str, Any]:
    out = {
        "question_id": total["question_id"],
        "text": total["question_text"],
        "type": total["question_type"],
        "verified": _group(verified),
        "total": _group(total),
    }
    if total["question_type"] == "scale":
        out["scale_min"], out["scale_max"] = total["scale_min"], total["scale_max"]
    return out


UNAVAILABLE_GROUP = {"n": 0, "suppressed": True, "results": None}


def build_trend_point(
    poll: dict[str, Any],
    results_total: list[dict[str, Any]],
    results_verified: list[dict[str, Any]],
    total_votes: int,
    verified_votes: int,
    now: datetime,
    results_weighted: list[dict[str, Any]] | None = None,
    weighting_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    questions = [_question(v, t) for v, t in zip(results_verified, results_total, strict=True)]
    if results_weighted is not None:
        for question, weighted in zip(questions, results_weighted, strict=True):
            question["weighted"] = _group(weighted)
    else:
        for question in questions:
            question["weighted"] = dict(UNAVAILABLE_GROUP)
    return {
        "edition": poll["edition"],
        "label": edition_label(poll["edition"]),
        "poll_slug": poll["slug"],
        "starts_at": poll["starts_at"],
        "ends_at": poll["ends_at"],
        "is_open": is_open(poll, now),
        "template_version": poll["template_version"],
        "total_votes": total_votes,
        "verified_votes": verified_votes,
        "weighting": weighting_meta,
        "questions": questions,
    }


async def _live_point(supabase, poll: dict[str, Any], now: datetime) -> dict[str, Any]:
    votes = await (
        supabase.table("poll_votes").select("user_id, option_value, voter_rank").eq("poll_id", poll["id"]).execute()
    )
    row = build_snapshot_row(poll, votes.data or [], await weight_edition(supabase, poll, votes.data or []))
    return build_trend_point(
        poll, row["results_total"], row["results_verified"], row["total_votes"], row["verified_votes"], now,
        row["results_weighted"], row["weighting_meta"],
    )


async def load_series_trend(supabase, series: dict[str, Any], limit: int, now: datetime) -> dict[str, Any]:
    """Tendencia de `series`: las últimas `limit` ediciones (orden ascendente) y sus eventos."""
    polls = await (
        supabase.table("polls")
        .select("*")
        .eq("series_id", series["id"])
        .order("edition", desc=True)
        .limit(limit)
        .execute()
    )
    editions = sorted(polls.data or [], key=lambda p: p["edition"])

    snapshots: dict[str, dict[str, Any]] = {}
    if editions:
        found = await (
            supabase.table("poll_results_snapshot")
            .select("*")
            .in_("poll_id", [p["id"] for p in editions])
            .execute()
        )
        snapshots = {row["poll_id"]: row for row in found.data or []}

    points = []
    for poll in editions:
        snap = snapshots.get(poll["id"])
        if snap:
            points.append(build_trend_point(
                poll, snap["results_total"], snap["results_verified"],
                snap["total_votes"], snap["verified_votes"], now,
                snap.get("results_weighted"), snap.get("weighting_meta"),
            ))
        else:
            points.append(await _live_point(supabase, poll, now))

    return {
        "series": {
            "slug": series["slug"], "title": series["title"], "cadence": series["cadence"],
            "context": series.get("context"), "category": series.get("category"),
            "is_active": series.get("is_active", True),
        },
        "min_n": MIN_N,
        "points": points,
        "events": await _load_events(supabase, series["id"], editions),
    }


async def _load_events(supabase, series_id: str, editions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Eventos de la serie y generales (series_id NULL) dentro del rango de ediciones mostrado."""
    if not editions:
        return []
    own = await supabase.table("series_events").select("event_date, label").eq("series_id", series_id).execute()
    general = await supabase.table("series_events").select("event_date, label").is_("series_id", "null").execute()
    first_day = str(editions[0]["starts_at"])[:10]
    events = [
        {"date": str(e["event_date"]), "label": e["label"]}
        for e in (own.data or []) + (general.data or [])
        if str(e["event_date"]) >= first_day
    ]
    return sorted(events, key=lambda e: e["date"])
