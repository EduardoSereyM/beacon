"""
BEACON PROTOCOL — Entities Router (El Catálogo del Búnker)
=============================================================
Endpoints públicos para consultar las entidades registradas.

El contrato de datos devuelve los nombres de columna EXACTOS
de la tabla 'entities' de Supabase, sin transformación.

Endpoints:
  GET /entities/filters  → Valores DISTINCT para filtros del frontend
  GET /entities          → Lista paginada de entidades activas
  GET /entities/{id}     → Detalle de una entidad por UUID

"Lo que existe en el Búnker, existe para ser juzgado."
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.core.database import get_async_supabase_client

router = APIRouter()


@router.get("/entities/filters", summary="Filtros dinámicos (DISTINCT)")
async def get_entity_filters():
    """
    Retorna valores DISTINCT de región y partido para los selectores del frontend.
    Lee directamente desde las columnas 'region' y 'party' de la tabla entities.
    Se auto-actualiza sin tocar código al cargar nuevas entidades.
    """
    supabase = get_async_supabase_client()

    result = await (
        supabase.table("entities")
        .select("region, party")
        .eq("is_active", True)
        .is_("deleted_at", "null")
        .execute()
    )

    regions = set()
    parties = set()

    for row in (result.data or []):
        r = row.get("region")
        if r:
            regions.add(r)

        p = row.get("party")
        if p and p != "Sin partido":
            parties.add(p)

    return {
        "regions": sorted(regions),
        "parties": sorted(parties),
    }


@router.get("/entities", summary="Listar entidades activas")
async def list_entities(
    category: Optional[str] = Query(None, description="Filtrar por categoría: politico, periodista, empresario"),
    region: Optional[str] = Query(None, description="Filtrar por región"),
    party: Optional[str] = Query(None, description="Filtrar por partido político"),
    search: Optional[str] = Query(None, description="Búsqueda por nombre"),
    limit: int = Query(50, ge=1, le=200, description="Máximo de resultados"),
    offset: int = Query(0, ge=0, description="Offset para paginación"),
):
    """
    Retorna las entidades activas del Búnker.
    El filtro por partido se ejecuta en SQL usando la columna 'party'
    (migración 005) — no más parseo de bio en Python.
    """
    supabase = get_async_supabase_client()

    query = (
        supabase.table("entities")
        .select("*", count="exact")
        .eq("is_active", True)
        .is_("deleted_at", "null")
        .order("reputation_score", desc=True)
        .range(offset, offset + limit - 1)
    )

    if category:
        query = query.eq("category", category.lower())

    if region:
        query = query.ilike("region", f"%{region}%")

    if party:
        query = query.ilike("party", f"%{party}%")

    if search:
        query = query.or_(
            f"first_name.ilike.%{search}%,last_name.ilike.%{search}%"
        )

    result = await query.execute()

    entities = []
    for row in (result.data or []):
        links = row.get("official_links") or {}

        entities.append({
            # ─── Campos directos de la tabla entities ───
            "id": row["id"],
            "first_name": row.get("first_name", ""),
            "last_name": row.get("last_name", ""),
            "second_last_name": row.get("second_last_name", ""),
            "category": row.get("category", "politico"),
            "position": row.get("position", ""),
            "region": row.get("region", ""),
            "district": row.get("district", ""),
            "bio": row.get("bio", ""),
            "party": row.get("party", ""),
            "photo_path": row.get("photo_path"),
            "official_links": links,
            "is_active": row.get("is_active", True),
            # ─── Campos derivados para el frontend ───
            "email": links.get("email", ""),
            "reputation_score": round(float(row.get("reputation_score") or 0.0), 2),
            "total_reviews": int(row.get("total_reviews") or 0),
            "integrity_index": int(round(float(row.get("reputation_score") or 0.0) / 5.0 * 100)),
        })

    return {
        "entities": entities,
        "total": result.count if result.count is not None else len(entities),
        "offset": offset,
        "limit": limit,
    }


@router.get("/entities/{entity_id}", summary="Detalle de una entidad")
async def get_entity(entity_id: str):
    """Retorna el detalle completo de una entidad por su UUID."""
    supabase = get_async_supabase_client()

    result = await (
        supabase.table("entities")
        .select("*")
        .eq("id", entity_id)
        .eq("is_active", True)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")

    row = result.data[0]
    links = row.get("official_links") or {}

    return {
        "id": row["id"],
        "first_name": row.get("first_name", ""),
        "last_name": row.get("last_name", ""),
        "second_last_name": row.get("second_last_name", ""),
        "category": row.get("category", "politico"),
        "position": row.get("position", ""),
        "region": row.get("region", ""),
        "district": row.get("district", ""),
        "bio": row.get("bio", ""),
        "party": row.get("party", ""),
        "photo_path": row.get("photo_path"),
        "official_links": links,
        "is_active": row.get("is_active", True),
        "email": links.get("email", ""),
        "reputation_score": round(float(row.get("reputation_score") or 0.0), 2),
        "total_reviews": int(row.get("total_reviews") or 0),
        "integrity_index": int(round(float(row.get("reputation_score") or 0.0) / 5.0 * 100)),
    }
