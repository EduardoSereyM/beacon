"""
BEACON PROTOCOL — Dimensions Router (Criterios de Evaluación)
=============================================================
Endpoint público: GET /dimensions?category=politico
Retorna las dimensiones activas para mostrar los sliders de evaluación.

"El ciudadano evalúa con los criterios que el Overlord define."
"""

from fastapi import APIRouter, Query
from app.core.database import get_async_supabase_client

router = APIRouter()


@router.get("/dimensions", summary="Dimensiones de evaluación por categoría")
async def get_dimensions(
    category: str = Query(..., description="Categoría: politico, periodista, empresario, empresa, evento"),
):
    """
    Retorna las dimensiones activas (sliders) para una categoría dada.
    Usado por el perfil de entidad para renderizar la evaluación multidimensional.
    """
    supabase = get_async_supabase_client()
    result = await (
        supabase.table("evaluation_dimensions")
        .select("id, key, label, icon, display_order")
        .eq("category", category.lower())
        .eq("is_active", True)
        .order("display_order")
        .execute()
    )
    return {"dimensions": result.data or [], "category": category}
