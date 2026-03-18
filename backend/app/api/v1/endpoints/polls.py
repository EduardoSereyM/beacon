"""
BEACON PROTOCOL — Polls Router (Encuestas)
==========================================
Endpoints públicos para encuestas ciudadanas.

GET  /polls              → lista encuestas activas
GET  /polls/{id}         → detalle + resultados parciales
POST /polls/{id}/vote    → emitir voto (JWT requerido o anónimo si requires_auth=False)
"""

import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional
import logging

from app.core.database import get_async_supabase_client
from app.api.v1.user.auth import get_current_user
from app.api.v1.endpoints.realtime import publish_poll_pulse

logger = logging.getLogger("beacon.polls")
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PollVotePayload(BaseModel):
    option_value: str  # opción elegida ("Sí", "No") o valor numérico en scale ("4")
    anon_session_id: Optional[str] = None  # UUID del browser, solo para encuestas sin auth
    access_code: Optional[str] = None      # código de encuesta privada


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
async def list_polls(category: Optional[str] = None):
    supabase = get_async_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        query = (
            supabase.table("polls")
            .select("id, title, description, header_image, poll_type, options, scale_min, scale_max, starts_at, ends_at, questions, category, requires_auth")
            .eq("is_active", True)
            .is_("access_code", "null")   # solo encuestas públicas
            .lte("starts_at", now_iso)
            .gte("ends_at", now_iso)
            .order("starts_at", desc=True)
        )
        if category:
            query = query.eq("category", category)
        result = await query.execute()
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


@router.get("/polls/my", summary="Encuestas donde el usuario ya participó (incluye privadas)")
async def my_polls(current_user: dict = Depends(get_current_user)):
    """Devuelve encuestas donde el usuario autenticado ya votó."""
    supabase = get_async_supabase_client()
    user_id = current_user["id"]

    # Obtener poll_ids donde votó este usuario
    votes_res = await (
        supabase.table("poll_votes")
        .select("poll_id")
        .eq("user_id", user_id)
        .execute()
    )
    poll_ids = list({v["poll_id"] for v in (votes_res.data or [])})
    if not poll_ids:
        return {"items": [], "total": 0}

    result = await (
        supabase.table("polls")
        .select("id, title, description, header_image, poll_type, options, scale_min, scale_max, starts_at, ends_at, category, requires_auth, is_active")
        .in_("id", poll_ids)
        .order("created_at", desc=True)
        .execute()
    )
    items = result.data or []
    enriched = []
    for p in items:
        try:
            vote_res = await (
                supabase.table("poll_votes").select("option_value").eq("poll_id", p["id"]).execute()
            )
            enriched.append(_compute_results(p, vote_res.data or []))
        except Exception:
            enriched.append(_compute_results(p, []))
    return {"items": enriched, "total": len(enriched)}


@router.get("/polls/{poll_id}", summary="Detalle encuesta con resultados")
async def get_poll(poll_id: str, access_code: Optional[str] = None):
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

    poll = res.data
    stored_code = poll.get("access_code")

    # Si tiene código y no se proporcionó o es incorrecto → respuesta parcial
    if stored_code:
        if not access_code or access_code != stored_code:
            return {
                "id": poll["id"],
                "title": poll["title"],
                "description": poll.get("description"),
                "header_image": poll.get("header_image"),
                "is_open": _is_open(poll),
                "is_private": True,
                "requires_auth": poll.get("requires_auth", True),
                "category": poll.get("category", "general"),
                "total_votes": 0,
                "results": [],
                "questions": None,
                "options": None,
                "poll_type": poll.get("poll_type"),
                "scale_min": poll.get("scale_min", 1),
                "scale_max": poll.get("scale_max", 5),
                "starts_at": poll.get("starts_at"),
                "ends_at": poll.get("ends_at"),
            }

    vote_res = await (
        supabase.table("poll_votes")
        .select("option_value")
        .eq("poll_id", poll_id)
        .execute()
    )
    result = _compute_results(poll, vote_res.data or [])
    result["is_private"] = bool(stored_code)
    # Nunca exponer el código al cliente
    result.pop("access_code", None)
    return result


@router.post("/polls/{poll_id}/vote", summary="Votar en encuesta")
async def vote_poll(
    poll_id: str,
    payload: PollVotePayload,
    authorization: Optional[str] = Header(None),
):
    supabase = get_async_supabase_client()

    # Verificar encuesta
    try:
        poll_res = await (
            supabase.table("polls")
            .select("id, poll_type, options, scale_min, scale_max, starts_at, ends_at, is_active, requires_auth, access_code")
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

    # Validar access_code si la encuesta es privada
    stored_code = poll.get("access_code")
    if stored_code and payload.access_code != stored_code:
        raise HTTPException(status_code=403, detail="Código de acceso incorrecto")

    requires_auth = poll.get("requires_auth", True)

    # Resolver identidad del votante
    user_id: Optional[str] = None
    anon_id: Optional[str] = None

    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        try:
            user_res = await supabase.auth.get_user(token)
            if user_res and user_res.user:
                user_id = user_res.user.id
        except Exception:
            pass

    if requires_auth and not user_id:
        raise HTTPException(status_code=401, detail="Debes iniciar sesión para votar en esta encuesta")

    if not user_id:
        # Encuesta anónima: usar anon_session_id del payload
        anon_id = payload.anon_session_id
        if not anon_id:
            raise HTTPException(status_code=400, detail="Se requiere anon_session_id para votar en esta encuesta")

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

    # Anti-brigada: 1 voto por usuario/sesión por encuesta
    if user_id:
        existing = await (
            supabase.table("poll_votes")
            .select("id")
            .eq("poll_id", poll_id)
            .eq("user_id", user_id)
            .execute()
        )
    else:
        existing = await (
            supabase.table("poll_votes")
            .select("id")
            .eq("poll_id", poll_id)
            .eq("anon_session_id", anon_id)
            .execute()
        )
    if existing.data:
        raise HTTPException(status_code=409, detail="Ya votaste en esta encuesta")

    # Insertar voto
    vote_row: dict = {"poll_id": poll_id, "option_value": payload.option_value}
    if user_id:
        vote_row["user_id"] = user_id
    else:
        vote_row["anon_session_id"] = anon_id

    await supabase.table("poll_votes").insert(vote_row).execute()

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

    logger.info(f"Poll voto | poll={poll_id} | user={user_id or 'anon'} | value={payload.option_value}")
    return {"success": True, "option_value": payload.option_value}
