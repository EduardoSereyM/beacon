"""
BEACON PROTOCOL — Análisis de una edición (ponderación + segmentos)
====================================================================
Carga la demografía de los votantes verificados UNA vez y calcula con ella la ponderación y los
segmentos. Lo usan el snapshot de ediciones cerradas y el cálculo en vivo de la edición abierta.
"""

from dataclasses import dataclass
from typing import Any

from app.core.config import settings
from app.core.polls_series.series_segments import compute_segments
from app.core.polls_series.series_weighting import load_user_demographics, reference_year, weight_from_users


@dataclass(frozen=True)
class EditionAnalysis:
    weighted: list[dict[str, Any]] | None
    weighting_meta: dict[str, Any]
    segments: list[dict[str, Any]]


async def analyze_edition(supabase, poll: dict[str, Any], votes: list[dict[str, Any]]) -> EditionAnalysis:
    include_political = settings.SERIES_POLITICAL_SEGMENT_ENABLED
    verified = [v for v in votes if v.get("voter_rank") == "VERIFIED"]
    user_ids = sorted({v["user_id"] for v in verified if v.get("user_id")})
    users = await load_user_demographics(supabase, user_ids, include_political) if user_ids else {}

    weighted, meta = weight_from_users(users, poll, verified)
    segments = compute_segments(users, poll, verified, reference_year(poll), include_political)
    return EditionAnalysis(weighted, meta, segments)
