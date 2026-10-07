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


async def load_user_demographics(
    supabase, user_ids: list[str], include_political: bool = False
) -> dict[str, dict[str, Any]]:
    """Demografía de los votantes por id. La posición política solo se lee si el segmento está habilitado."""
    columns = "id, region, gender, birth_year" + (", political_position" if include_political else "")
    users: dict[str, dict[str, Any]] = {}
    for start in range(0, len(user_ids), IN_CHUNK):
        found = await (
            supabase.table("users")
            .select(columns)
            .in_("id", user_ids[start:start + IN_CHUNK])
            .execute()
        )
        users.update({row["id"]: row for row in found.data or []})
    return users


def reference_year(poll: dict[str, Any]) -> int:
    return datetime.fromisoformat(str(poll["starts_at"]).replace("Z", "+00:00")).year


def weight_from_users(
    users: dict[str, dict[str, Any]], poll: dict[str, Any], verified: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]] | None, dict[str, Any]]:
    """(resultados ponderados o None, metadatos) a partir de la demografía ya cargada. Función pura."""
    year = reference_year(poll)
    respondents = [
        respondent_from_user(users.get(v.get("user_id"), {}), year) for v in verified
    ]
    result = compute_weights(respondents, load_targets())
    if result.status != "ok":
        return None, result.meta()

    kept = [(vote, weight) for vote, weight in zip(verified, result.weights, strict=True) if weight is not None]
    results = aggregate_by_question(poll, [vote for vote, _ in kept], [weight for _, weight in kept])
    return results, result.meta()


async def weight_edition(
    supabase, poll: dict[str, Any], votes: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]] | None, dict[str, Any]]:
    """Como `weight_from_users`, cargando la demografía de los votantes verificados de `votes`."""
    verified = [v for v in votes if v.get("voter_rank") == "VERIFIED"]
    user_ids = sorted({v["user_id"] for v in verified if v.get("user_id")})
    users = await load_user_demographics(supabase, user_ids) if user_ids else {}
    return weight_from_users(users, poll, verified)
