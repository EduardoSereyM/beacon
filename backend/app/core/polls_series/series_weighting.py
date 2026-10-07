"""
BEACON PROTOCOL — Ponderación de una edición de serie
======================================================
Une los votos verificados de una edición con la demografía de sus votantes, calcula los pesos
(app/core/weighting) y devuelve los resultados ponderados y los metadatos publicables.

Privacidad: la demografía individual se lee y se descarta dentro de esta función; solo salen
resultados agregados y metadatos sin pesos.
"""

from datetime import datetime
from typing import Any

from app.core.polls.aggregation import aggregate_by_question
from app.core.weighting.demographics import respondent_from_user
from app.core.weighting.engine import compute_weights
from app.core.weighting.targets_loader import load_targets

# `in_` viaja en la URL de PostgREST: se trocea para no pasar su largo máximo.
IN_CHUNK = 100


async def _load_user_demographics(supabase, user_ids: list[str]) -> dict[str, dict[str, Any]]:
    users: dict[str, dict[str, Any]] = {}
    for start in range(0, len(user_ids), IN_CHUNK):
        found = await (
            supabase.table("users")
            .select("id, region, gender, birth_year")
            .in_("id", user_ids[start:start + IN_CHUNK])
            .execute()
        )
        users.update({row["id"]: row for row in found.data or []})
    return users


def _reference_year(poll: dict[str, Any]) -> int:
    return datetime.fromisoformat(str(poll["starts_at"]).replace("Z", "+00:00")).year


async def weight_edition(
    supabase, poll: dict[str, Any], votes: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]] | None, dict[str, Any]]:
    """(resultados ponderados o None, metadatos) para los votos VERIFIED de una edición."""
    verified = [v for v in votes if v.get("voter_rank") == "VERIFIED"]
    user_ids = sorted({v["user_id"] for v in verified if v.get("user_id")})
    users = await _load_user_demographics(supabase, user_ids) if user_ids else {}

    year = _reference_year(poll)
    respondents = [
        respondent_from_user(users.get(v.get("user_id"), {}), year) for v in verified
    ]
    result = compute_weights(respondents, load_targets())
    if result.status != "ok":
        return None, result.meta()

    kept = [(vote, weight) for vote, weight in zip(verified, result.weights, strict=True) if weight is not None]
    results = aggregate_by_question(poll, [vote for vote, _ in kept], [weight for _, weight in kept])
    return results, result.meta()
