"""
BEACON PROTOCOL — Events Router
================================
Endpoints públicos para eventos con entidades participantes.

GET  /events              → lista eventos activos (dentro de fecha)
GET  /events/{id}         → detalle evento + participantes + scores
POST /events/{id}/vote    → votar (score 1–5) por una entidad en el evento
                            (1 voto por usuario por entidad por evento)
"""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import logging

from app.core.database import get_async_supabase_client
from app.api.v1.user.auth import get_current_user

logger = logging.getLogger("beacon.events")
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class EventVotePayload(BaseModel):
    entity_id: str
    score: float          # 1.0 – 5.0 (una decimal aceptada)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_open(e: dict) -> bool:
    now = datetime.now(timezone.utc)
    try:
        start = datetime.fromisoformat(str(e["starts_at"]).replace("Z", "+00:00"))
        end   = datetime.fromisoformat(str(e["ends_at"]).replace("Z", "+00:00"))
        return start <= now <= end
    except Exception:
        return False


async def _enrich_event(event: dict, supabase, user_id: str | None = None) -> dict:
    """Añade participantes con sus scores promedio al dict del evento."""
    try:
        parts_res = await (
            supabase.table("event_participants")
            .select(
                "entity_id, "
                "entities(id, first_name, last_name, photo_path, category, reputation_score)"
            )
            .eq("event_id", event["id"])
            .execute()
        )

        participants = []
        for p in (parts_res.data or []):
            entity = p.get("entities") or {}
            eid = entity.get("id", "")

            # Aggregate scores
            votes_res = await (
                supabase.table("event_votes")
                .select("score")
                .eq("event_id", event["id"])
                .eq("entity_id", eid)
                .execute()
            )
            votes = votes_res.data or []
            scores = [float(v["score"]) for v in votes if v.get("score") is not None]
            avg = round(sum(scores) / len(scores), 2) if scores else None

            # User's own vote for this entity
            user_score = None
            if user_id:
                my_vote = await (
                    supabase.table("event_votes")
                    .select("score")
                    .eq("event_id", event["id"])
                    .eq("entity_id", eid)
                    .eq("user_id", user_id)
                    .execute()
                )
                if my_vote.data:
                    user_score = float(my_vote.data[0]["score"])

            participants.append({
                **entity,
                "event_score_avg": avg,
                "event_vote_count": len(scores),
                "user_score": user_score,
            })

        # Sort by avg score descending
        participants.sort(
            key=lambda x: (x["event_score_avg"] or 0),
            reverse=True,
        )

        return {
            **event,
            "participants": participants,
            "participant_count": len(participants),
            "is_open": _is_open(event),
        }
    except Exception as e:
        logger.warning(f"Error enriqueciendo evento {event.get('id')}: {e}")
        return {
            **event,
            "participants": [],
            "participant_count": 0,
            "is_open": _is_open(event),
        }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/events", summary="Listar eventos activos")
async def list_events():
    """Retorna eventos activos y dentro de fecha, con participantes y scores."""
    supabase = get_async_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        res = await (
            supabase.table("events")
            .select("id, title, description, location, starts_at, ends_at")
            .eq("is_active", True)
            .lte("starts_at", now_iso)
            .gte("ends_at", now_iso)
            .order("starts_at", desc=True)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error listando eventos: {e}")
        raise HTTPException(status_code=503, detail="Error al obtener eventos")

    items = res.data or []
    enriched = []
    for ev in items:
        enriched.append(await _enrich_event(ev, supabase))

    return {"items": enriched, "total": len(enriched)}


@router.get("/events/{event_id}", summary="Detalle evento con participantes")
async def get_event(event_id: str):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("events")
            .select("id, title, description, location, starts_at, ends_at")
            .eq("id", event_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    return await _enrich_event(res.data, supabase)


@router.post("/events/{event_id}/vote", summary="Votar (score) por entidad en evento")
async def vote_event(
    event_id: str,
    payload: EventVotePayload,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_async_supabase_client()
    user_id = current_user["id"]

    # Validar score
    if not (1.0 <= payload.score <= 5.0):
        raise HTTPException(status_code=400, detail="score debe estar entre 1 y 5")

    # Verificar evento
    try:
        ev_res = await (
            supabase.table("events")
            .select("id, starts_at, ends_at, is_active")
            .eq("id", event_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Evento no encontrado")

    ev = ev_res.data
    if not ev["is_active"]:
        raise HTTPException(status_code=409, detail="Este evento no está activo")
    if not _is_open(ev):
        raise HTTPException(status_code=409, detail="Este evento no está abierto para votación")

    # Verificar que la entidad participa
    part_res = await (
        supabase.table("event_participants")
        .select("id")
        .eq("event_id", event_id)
        .eq("entity_id", payload.entity_id)
        .execute()
    )
    if not part_res.data:
        raise HTTPException(status_code=400, detail="Esta entidad no participa en el evento")

    # 1 voto por usuario por entidad por evento
    existing = await (
        supabase.table("event_votes")
        .select("id")
        .eq("event_id", event_id)
        .eq("entity_id", payload.entity_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Ya votaste por esta entidad en este evento")

    await (
        supabase.table("event_votes")
        .insert({
            "event_id":  event_id,
            "entity_id": payload.entity_id,
            "user_id":   user_id,
            "score":     payload.score,
        })
        .execute()
    )

    logger.info(
        f"Event voto | event={event_id} | entity={payload.entity_id} | "
        f"user={user_id} | score={payload.score}"
    )
    return {"success": True, "entity_id": payload.entity_id, "score": payload.score}
