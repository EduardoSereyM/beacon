"""
BEACON PROTOCOL — Admin Versus (CRUD)
======================================
POST   /admin/versus           → crear VS
GET    /admin/versus           → listar todos (incluye inactivos)
PATCH  /admin/versus/{id}      → editar (title, descripción, fechas, is_active, affects_reputation)
DELETE /admin/versus/{id}      → desactivar (soft)
"""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging

from app.core.database import get_async_supabase_client
from app.api.v1.admin.require_admin import require_admin_role
from fastapi import Depends

logger = logging.getLogger("beacon.admin.versus")
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class VersusCreate(BaseModel):
    title: str
    description: Optional[str] = None
    entity_a_id: str
    entity_b_id: str
    starts_at: str   # ISO 8601
    ends_at: str     # ISO 8601
    affects_reputation: bool = False


class VersusUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    is_active: Optional[bool] = None
    affects_reputation: Optional[bool] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/admin/versus", summary="Crear enfrentamiento VS")
async def create_versus(
    body: VersusCreate,
    admin: dict = Depends(require_admin_role),
):
    if body.entity_a_id == body.entity_b_id:
        raise HTTPException(status_code=400, detail="Las entidades A y B deben ser distintas")

    supabase = get_async_supabase_client()

    # Verificar que ambas entidades existen
    for eid in (body.entity_a_id, body.entity_b_id):
        try:
            await (
                supabase.table("entities")
                .select("id")
                .eq("id", eid)
                .single()
                .execute()
            )
        except Exception:
            raise HTTPException(status_code=404, detail=f"Entidad {eid} no encontrada")

    try:
        res = await (
            supabase.table("versus")
            .insert({
                "title": body.title,
                "description": body.description,
                "entity_a_id": body.entity_a_id,
                "entity_b_id": body.entity_b_id,
                "starts_at": body.starts_at,
                "ends_at": body.ends_at,
                "affects_reputation": body.affects_reputation,
                "created_by": admin["user_id"],
            })
            .execute()
        )
    except Exception as e:
        logger.error(f"Error creando versus: {e}")
        raise HTTPException(status_code=503, detail="Error al crear VS")

    logger.info(f"VS creado | id={res.data[0]['id']} | admin={admin['user_id']}")
    return res.data[0]


@router.get("/admin/versus", summary="Listar todos los VS")
async def list_versus_admin(
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("versus")
            .select(
                "id, title, description, starts_at, ends_at, is_active, affects_reputation, created_at, "
                "entity_a:entities!entity_a_id(id, first_name, last_name, photo_path, category), "
                "entity_b:entities!entity_b_id(id, first_name, last_name, photo_path, category)"
            )
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    items = res.data or []

    # Añadir conteo de votos
    enriched = []
    for v in items:
        try:
            vote_res = await (
                supabase.table("versus_votes")
                .select("voted_for")
                .eq("versus_id", v["id"])
                .execute()
            )
            votes = vote_res.data or []
            v["votes_a"] = sum(1 for vv in votes if vv["voted_for"] == "A")
            v["votes_b"] = sum(1 for vv in votes if vv["voted_for"] == "B")
            v["total_votes"] = len(votes)
        except Exception:
            v["votes_a"] = v["votes_b"] = v["total_votes"] = 0
        enriched.append(v)

    return {"items": enriched, "total": len(enriched)}


@router.patch("/admin/versus/{versus_id}", summary="Editar VS")
async def update_versus(
    versus_id: str,
    body: VersusUpdate,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    try:
        res = await (
            supabase.table("versus")
            .update(patch)
            .eq("id", versus_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail="VS no encontrado")

    return res.data[0]


@router.delete("/admin/versus/{versus_id}", summary="Desactivar VS")
async def delete_versus(
    versus_id: str,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        await (
            supabase.table("versus")
            .update({"is_active": False})
            .eq("id", versus_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    return {"success": True, "versus_id": versus_id}
