"""
BEACON PROTOCOL — Polls Router (Encuestas)
==========================================
Endpoints públicos para encuestas ciudadanas.

GET  /polls              → lista encuestas activas
GET  /polls/{id}         → detalle + resultados parciales
POST /polls/{id}/vote    → emitir voto (JWT, 1 por usuario por encuesta)
"""

import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import logging

from app.core.database import get_async_supabase_client
from app.api.v1.user.auth import get_current_user
from app.api.v1.endpoints.realtime import publish_poll_pulse

logger = logging.getLogger("beacon.polls")
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PollVotePayload(BaseModel):
    option_value: str  # opción elegida ("Sí", "No") o valor numérico en scale ("4")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_open(p: dict) -> bool:
    now = datetime.now(timezone.utc)
    try:
        start = datetime.fromisoformat(str(p["starts_at"]).replace("Z", "+00:00"))
        end   = datetime.fromisoformat(str(p["ends_at"]).replace("Z", "+00:00"))
        return start <= now <= end
    except Exception:
        return False


def _compute_results(poll: dict, votes: list) -> dict:
    """Agrega resultados según tipo de encuesta."""
    poll_type = poll.get("poll_type", "multiple_choice")
    total = len(votes)

    if poll_type == "multiple_choice":
        options = poll.get("options") or []
        counts = {opt: 0 for opt in options}
        for v in votes:
            val = v.get("option_value", "")
            if val in counts:
                counts[val] += 1
        results = [
            {"option": opt, "count": cnt, "pct": round(cnt / total * 100, 1) if total else 0}
            for opt, cnt in counts.items()
        ]
    else:  # scale
        values = []
        for v in votes:
            try:
                values.append(float(v["option_value"]))
            except (ValueError, TypeError):
                pass
        avg = round(sum(values) / len(values), 2) if values else 0
        results = [{"average": avg, "count": len(values)}]

    return {
        **poll,
        "total_votes": total,
        "results": results,
        "is_open": _is_open(poll),
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/polls", summary="Listar encuestas activas")
async def list_polls():
    supabase = get_async_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        result = await (
            supabase.table("polls")
            .select("id, title, description, header_image, poll_type, options, scale_min, scale_max, starts_at, ends_at, questions")
            .eq("is_active", True)
            .lte("starts_at", now_iso)
            .gte("ends_at", now_iso)
            .order("starts_at", desc=True)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error listando polls: {e}")
        raise HTTPException(status_code=503, detail="Error al obtener encuestas")

    items = result.data or []
    enriched = []
    for p in items:
        try:
            vote_res = await (
                supabase.table("poll_votes")
                .select("option_value")
                .eq("poll_id", p["id"])
                .execute()
            )
            enriched.append(_compute_results(p, vote_res.data or []))
        except Exception:
            enriched.append(_compute_results(p, []))

    return {"items": enriched, "total": len(enriched)}


@router.get("/polls/{poll_id}", summary="Detalle encuesta con resultados")
async def get_poll(poll_id: str):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("polls")
            .select("*")
            .eq("id", poll_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")

    vote_res = await (
        supabase.table("poll_votes")
        .select("option_value")
        .eq("poll_id", poll_id)
        .execute()
    )
    return _compute_results(res.data, vote_res.data or [])


@router.post("/polls/{poll_id}/vote", summary="Votar en encuesta")
async def vote_poll(
    poll_id: str,
    payload: PollVotePayload,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_async_supabase_client()
    user_id = current_user["id"]

    # Verificar encuesta
    try:
        poll_res = await (
            supabase.table("polls")
            .select("id, poll_type, options, scale_min, scale_max, starts_at, ends_at, is_active")
            .eq("id", poll_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")

    poll = poll_res.data
    if not poll["is_active"]:
        raise HTTPException(status_code=409, detail="Esta encuesta no está activa")
    if not _is_open(poll):
        raise HTTPException(status_code=409, detail="Esta encuesta no está abierta para votar")

    # Validar opción
    if poll["poll_type"] == "multiple_choice":
        options = poll.get("options") or []
        if payload.option_value not in options:
            raise HTTPException(status_code=400, detail=f"Opción inválida. Opciones: {options}")
    else:  # scale
        try:
            val = float(payload.option_value)
            if not (poll["scale_min"] <= val <= poll["scale_max"]):
                raise ValueError
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=400,
                detail=f"Valor fuera de rango [{poll['scale_min']}-{poll['scale_max']}]"
            )

    # 1 voto por usuario
    existing = await (
        supabase.table("poll_votes")
        .select("id")
        .eq("poll_id", poll_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Ya votaste en esta encuesta")

    await (
        supabase.table("poll_votes")
        .insert({"poll_id": poll_id, "user_id": user_id, "option_value": payload.option_value})
        .execute()
    )

    # Publicar pulso en tiempo real (Efecto Kahoot)
    try:
        all_votes = await (
            supabase.table("poll_votes")
            .select("option_value")
            .eq("poll_id", poll_id)
            .execute()
        )
        updated_results = _compute_results(poll, all_votes.data or [])
        asyncio.create_task(publish_poll_pulse(
            poll_id=poll_id,
            results=updated_results["results"],
            total_votes=updated_results["total_votes"],
        ))
    except Exception as e:
        logger.warning(f"Pulse Poll falló (no crítico): {e}")

    logger.info(f"Poll voto | poll={poll_id} | user={user_id} | value={payload.option_value}")
    return {"success": True, "option_value": payload.option_value}
