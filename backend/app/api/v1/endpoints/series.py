"""
BEACON PROTOCOL — Series de encuestas (público)
================================================
Endpoints:
  GET /series                 → Series activas
  GET /series/{slug}/trend    → Resultados edición por edición + eventos anotados

Sin autenticación: son datos agregados. Un grupo con menos de `min_n` respuestas no
publica resultados (ver app/core/polls_series/series_trend.py).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Response

from app.core.database import get_async_supabase_client
from app.core.polls_series.series_trend import DEFAULT_LIMIT, MAX_LIMIT, load_series_trend

router = APIRouter(prefix="/series", tags=["Series"])

# La tendencia cambia como mucho al ritmo de los votos; un minuto de caché alivia la base.
CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300"


@router.get("", summary="Series de encuestas activas")
async def list_series(response: Response):
    supabase = get_async_supabase_client()
    result = await (
        supabase.table("poll_series")
        .select("slug, title, cadence, context, category, tags, last_published_at")
        .eq("is_active", True)
        .order("created_at", desc=False)
        .execute()
    )
    response.headers["Cache-Control"] = CACHE_CONTROL
    return {"items": result.data or []}


@router.get("/{slug}/trend", summary="Tendencia de una serie: resultados por edición y eventos")
async def get_series_trend(
    slug: str,
    response: Response,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT, description="Últimas N ediciones"),
):
    supabase = get_async_supabase_client()
    found = await supabase.table("poll_series").select("*").eq("slug", slug).limit(1).execute()
    if not found.data:
        raise HTTPException(status_code=404, detail="Serie no encontrada.")
    trend = await load_series_trend(supabase, found.data[0], limit, datetime.now(timezone.utc))
    response.headers["Cache-Control"] = CACHE_CONTROL
    return trend
