"""
BEACON PROTOCOL — Entities Router (El Catálogo del Búnker)
=============================================================
Endpoints públicos para consultar las entidades registradas.

El contrato de datos devuelve los nombres de columna EXACTOS
de la tabla 'entities' de Supabase, sin transformación.

Endpoints:
  GET /entities          → Lista paginada de entidades activas
  GET /entities/{id}     → Detalle de una entidad por UUID

"Lo que existe en el Búnker, existe para ser juzgado."
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.core.database import get_supabase_client

router = APIRouter()


@router.get("/entities/filters", summary="Filtros dinámicos (DISTINCT)")
async def get_entity_filters():
    """
    Retorna valores DISTINCT de región y partido para los selectores del frontend.
    Se auto-actualiza: si mañana se cargan empresas o periodistas, los filtros
    reflejan la realidad sin tocar código.
    """
    supabase = get_supabase_client()

    # Obtener todas las entidades activas (solo campos necesarios)
    result = (
        supabase.table("entities")
        .select("region, bio")
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

        bio = row.get("bio") or ""
        if "Partido:" in bio:
            party = bio.split("Partido:")[-1].strip().rstrip(".")
            if party and party != "Sin partido":
                parties.add(party)

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
    Devuelve los campos EXACTOS de la tabla 'entities' de Supabase.
    """
    supabase = get_supabase_client()

    query = (
        supabase.table("entities")
        .select("*")
        .eq("is_active", True)
        .is_("deleted_at", "null")
        .order("updated_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if category:
        query = query.eq("category", category.lower())

    if region:
        query = query.ilike("region", f"%{region}%")

    if search:
        query = query.or_(
            f"first_name.ilike.%{search}%,last_name.ilike.%{search}%"
        )

    result = query.execute()

    # Mapear datos con campos directos de la BBDD + campos derivados para el frontend
    entities = []
    for row in (result.data or []):
        links = row.get("official_links") or {}

        # Extraer partido desde official_links o bio
        entity_party = ""
        bio = row.get("bio") or ""
        if "Partido:" in bio:
            entity_party = bio.split("Partido:")[-1].strip().rstrip(".")
        
        # Filtrar por partido si se pidió
        if party and party.lower() not in entity_party.lower():
            continue

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
            "bio": bio,
            "photo_path": row.get("photo_path"),
            "official_links": links,
            "is_active": row.get("is_active", True),
            # ─── Campos derivados para el frontend ───
            "party": entity_party,
            "email": links.get("email", ""),
            "reputation_score": 0.0,
            "total_reviews": 0,
            "is_verified": True,
            "rank": "BRONZE",
            "integrity_index": 50,
        })

    return {
        "entities": entities,
        "total": len(entities),
        "offset": offset,
        "limit": limit,
    }


@router.get("/entities/{entity_id}", summary="Detalle de una entidad")
async def get_entity(entity_id: str):
    """Retorna el detalle completo de una entidad por su UUID."""
    supabase = get_supabase_client()

    result = (
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
    bio = row.get("bio") or ""
    entity_party = ""
    if "Partido:" in bio:
        entity_party = bio.split("Partido:")[-1].strip().rstrip(".")

    return {
        "id": row["id"],
        "first_name": row.get("first_name", ""),
        "last_name": row.get("last_name", ""),
        "second_last_name": row.get("second_last_name", ""),
        "category": row.get("category", "politico"),
        "position": row.get("position", ""),
        "region": row.get("region", ""),
        "district": row.get("district", ""),
        "bio": bio,
        "photo_path": row.get("photo_path"),
        "official_links": links,
        "is_active": row.get("is_active", True),
        "party": entity_party,
        "email": links.get("email", ""),
        "reputation_score": 0.0,
        "total_reviews": 0,
        "is_verified": True,
        "rank": "BRONZE",
        "integrity_index": 50,
    }
