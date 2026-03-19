"""
BEACON PROTOCOL — Admin Events (CRUD + Participantes)
======================================================
POST   /admin/events                         → crear evento
GET    /admin/events                         → listar todos (activos e inactivos)
PATCH  /admin/events/{id}                    → editar (título, descripción, fechas, is_active)
DELETE /admin/events/{id}                    → desactivar (soft)

POST   /admin/events/{id}/participants       → agregar entidad participante
DELETE /admin/events/{id}/participants/{eid} → quitar entidad participante
GET    /admin/events/{id}/participants       → listar participantes con scores
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import logging

from app.core.database import get_async_supabase_client
from app.api.v1.admin.require_admin import require_admin_role

logger = logging.getLogger("beacon.admin.events")
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    title:       str
    description: Optional[str] = None
    location:    Optional[str] = None
    starts_at:   str            # ISO 8601
    ends_at:     str            # ISO 8601


class EventUpdate(BaseModel):
    title:       Optional[str]  = None
    description: Optional[str]  = None
    location:    Optional[str]  = None
    starts_at:   Optional[str]  = None
    ends_at:     Optional[str]  = None
    is_active:   Optional[bool] = None


class ParticipantAdd(BaseModel):
    entity_id: str


# ─── Endpoints de Evento ──────────────────────────────────────────────────────

@router.post("/admin/events", summary="Crear evento")
async def create_event(
    body: EventCreate,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("events")
            .insert({
                "title":       body.title,
                "description": body.description,
                "location":    body.location,
                "starts_at":   body.starts_at,
                "ends_at":     body.ends_at,
                "created_by":  admin["user_id"],
            })
            .execute()
        )
    except Exception as e:
        logger.error(f"Error creando evento: {e}")
        raise HTTPException(status_code=503, detail="Error al crear evento")

    event = res.data[0]
    logger.info(f"Evento creado | id={event['id']} | admin={admin['user_id']}")
    return event


@router.get("/admin/events", summary="Listar todos los eventos")
async def list_events_admin(
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("events")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    items = res.data or []

    # Añadir conteos
    for ev in items:
        try:
            # Participantes
            p_res = await (
                supabase.table("event_participants")
                .select("id", count="exact")
                .eq("event_id", ev["id"])
                .execute()
            )
            ev["participant_count"] = p_res.count or 0

            # Votos totales
            v_res = await (
                supabase.table("event_votes")
                .select("id", count="exact")
                .eq("event_id", ev["id"])
                .execute()
            )
            ev["total_votes"] = v_res.count or 0
        except Exception:
            ev["participant_count"] = 0
            ev["total_votes"] = 0

    return {"items": items, "total": len(items)}


@router.patch("/admin/events/{event_id}", summary="Editar evento")
async def update_event(
    event_id: str,
    body: EventUpdate,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    try:
        res = await (
            supabase.table("events")
            .update(patch)
            .eq("id", event_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    return res.data[0]


@router.delete("/admin/events/{event_id}", summary="Desactivar evento")
async def delete_event(
    event_id: str,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        await (
            supabase.table("events")
            .update({"is_active": False})
            .eq("id", event_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    return {"success": True, "event_id": event_id}


# ─── Endpoints de Participantes ───────────────────────────────────────────────

@router.get("/admin/events/{event_id}/participants", summary="Listar participantes con scores")
async def list_participants(
    event_id: str,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("event_participants")
            .select(
                "entity_id, "
                "entities(id, first_name, last_name, photo_path, category, reputation_score)"
            )
            .eq("event_id", event_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    participants = []
    for p in (res.data or []):
        entity = p.get("entities") or {}
        eid = entity.get("id", "")

        try:
            votes_res = await (
                supabase.table("event_votes")
                .select("score")
                .eq("event_id", event_id)
                .eq("entity_id", eid)
                .execute()
            )
            scores = [float(v["score"]) for v in (votes_res.data or []) if v.get("score")]
            avg = round(sum(scores) / len(scores), 2) if scores else None
            participants.append({
                **entity,
                "event_score_avg": avg,
                "event_vote_count": len(scores),
            })
        except Exception:
            participants.append({**entity, "event_score_avg": None, "event_vote_count": 0})

    return {"items": participants, "total": len(participants)}


@router.post("/admin/events/{event_id}/participants", summary="Agregar entidad al evento")
async def add_participant(
    event_id: str,
    body: ParticipantAdd,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()

    # Verificar que la entidad existe
    try:
        await (
            supabase.table("entities")
            .select("id")
            .eq("id", body.entity_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")

    # Verificar duplicado
    existing = await (
        supabase.table("event_participants")
        .select("id")
        .eq("event_id", event_id)
        .eq("entity_id", body.entity_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Esta entidad ya participa en el evento")

    try:
        res = await (
            supabase.table("event_participants")
            .insert({"event_id": event_id, "entity_id": body.entity_id})
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    logger.info(f"Participante añadido | event={event_id} | entity={body.entity_id}")
    return res.data[0]


@router.delete(
    "/admin/events/{event_id}/participants/{entity_id}",
    summary="Quitar entidad del evento",
)
async def remove_participant(
    event_id: str,
    entity_id: str,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        await (
            supabase.table("event_participants")
            .delete()
            .eq("event_id", event_id)
            .eq("entity_id", entity_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    return {"success": True, "event_id": event_id, "entity_id": entity_id}
