"""
BEACON PROTOCOL — Admin Polls (CRUD)
======================================
POST   /admin/polls        → crear encuesta
GET    /admin/polls        → listar todas
PATCH  /admin/polls/{id}   → editar
DELETE /admin/polls/{id}   → desactivar (soft)
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import logging

from app.core.database import get_async_supabase_client
from app.api.v1.admin.require_admin import require_admin_role

logger = logging.getLogger("beacon.admin.polls")
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PollCreate(BaseModel):
    title: str
    description: Optional[str] = None
    poll_type: str          # "multiple_choice" | "scale"
    options: Optional[List[str]] = None   # solo para multiple_choice
    scale_min: Optional[int] = 1
    scale_max: Optional[int] = 5
    starts_at: str          # ISO 8601
    ends_at: str            # ISO 8601


class PollUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    options: Optional[List[str]] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    is_active: Optional[bool] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/admin/polls", summary="Crear encuesta")
async def create_poll(
    body: PollCreate,
    admin: dict = Depends(require_admin_role),
):
    if body.poll_type not in ("multiple_choice", "scale"):
        raise HTTPException(status_code=400, detail="poll_type debe ser 'multiple_choice' o 'scale'")

    if body.poll_type == "multiple_choice":
        if not body.options or len(body.options) < 2:
            raise HTTPException(status_code=400, detail="Se requieren al menos 2 opciones para multiple_choice")

    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("polls")
            .insert({
                "title": body.title,
                "description": body.description,
                "poll_type": body.poll_type,
                "options": body.options,
                "scale_min": body.scale_min,
                "scale_max": body.scale_max,
                "starts_at": body.starts_at,
                "ends_at": body.ends_at,
                "created_by": admin["user_id"],
            })
            .execute()
        )
    except Exception as e:
        logger.error(f"Error creando poll: {e}")
        raise HTTPException(status_code=503, detail="Error al crear encuesta")

    logger.info(f"Poll creada | id={res.data[0]['id']} | admin={admin['user_id']}")
    return res.data[0]


@router.get("/admin/polls", summary="Listar todas las encuestas")
async def list_polls_admin(
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("polls")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    items = res.data or []

    # Añadir conteo de votos
    for p in items:
        try:
            vote_res = await (
                supabase.table("poll_votes")
                .select("id", count="exact")
                .eq("poll_id", p["id"])
                .execute()
            )
            p["total_votes"] = vote_res.count or 0
        except Exception:
            p["total_votes"] = 0

    return {"items": items, "total": len(items)}


@router.patch("/admin/polls/{poll_id}", summary="Editar encuesta")
async def update_poll(
    poll_id: str,
    body: PollUpdate,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    try:
        res = await (
            supabase.table("polls")
            .update(patch)
            .eq("id", poll_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")

    return res.data[0]


@router.delete("/admin/polls/{poll_id}", summary="Desactivar encuesta")
async def delete_poll(
    poll_id: str,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        await (
            supabase.table("polls")
            .update({"is_active": False})
            .eq("id", poll_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    return {"success": True, "poll_id": poll_id}
