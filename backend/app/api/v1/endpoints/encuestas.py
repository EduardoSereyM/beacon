"""
BEACON PROTOCOL — Encuestas Públicas (multi-pregunta)
======================================================
Endpoints para el flujo de detalle y respuesta de encuestas ciudadanas.

GET  /encuestas/{id}         → detalle con preguntas (questions JSONB)
POST /encuestas/{id}/respond → enviar respuestas (multi-pregunta)
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Any

from app.core.database import get_async_supabase_client
from app.api.v1.user.auth import get_current_user

logger = logging.getLogger("beacon.encuestas")
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class QuestionAnswer(BaseModel):
    question_id: str
    answer: dict[str, Any]  # {"option": "Sí"} o {"value": 7}


class RespondPayload(BaseModel):
    answers: list[QuestionAnswer]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _map_poll(p: dict) -> dict:
    """Convierte un registro `polls` al formato que espera encuestas/[id]."""
    questions_raw = p.get("questions") or []

    # questions puede venir como string JSON o lista
    if isinstance(questions_raw, str):
        try:
            questions_raw = json.loads(questions_raw)
        except Exception:
            questions_raw = []

    poll_questions = []
    for q in questions_raw:
        q_type = q.get("type", "multiple_choice")
        # Normalizar tipo al formato que espera el frontend
        frontend_type = "numeric_scale" if q_type == "scale" else "multiple_choice"

        # scale_points es sinónimo de scale_max (admin legacy)
        scale_max = q.get("scale_max") or q.get("scale_points") or 5
        scale_min = q.get("scale_min") or 1

        poll_questions.append({
            "id": q.get("id", ""),
            "question_text": q.get("text", ""),
            "question_type": frontend_type,
            "options": q.get("options"),
            "scale_min": scale_min,
            "scale_max": scale_max,
            "order_index": q.get("order_index", 0),
        })

    poll_questions.sort(key=lambda x: x["order_index"])

    return {
        "id": p["id"],
        "title": p.get("title", ""),
        "description": p.get("description"),
        "cover_image_url": p.get("header_image"),
        "end_at": p.get("ends_at"),
        "poll_questions": poll_questions,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/encuestas/{poll_id}", summary="Detalle de encuesta (multi-pregunta)")
async def get_encuesta(poll_id: str):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("polls")
            .select("id, title, description, header_image, ends_at, questions, is_active, starts_at")
            .eq("id", poll_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")

    p = res.data
    if not p:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")
    if not p.get("is_active"):
        raise HTTPException(status_code=404, detail="Encuesta inactiva")

    return _map_poll(p)


@router.post("/encuestas/{poll_id}/respond", summary="Responder encuesta (multi-pregunta)")
async def respond_encuesta(
    poll_id: str,
    payload: RespondPayload,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_async_supabase_client()
    user_id = current_user["id"]

    # Verificar encuesta activa y abierta
    try:
        poll_res = await (
            supabase.table("polls")
            .select("id, is_active, starts_at, ends_at, questions")
            .eq("id", poll_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")

    poll = poll_res.data
    if not poll["is_active"]:
        raise HTTPException(status_code=409, detail="Encuesta inactiva")

    now = datetime.now(timezone.utc)
    try:
        start = datetime.fromisoformat(str(poll["starts_at"]).replace("Z", "+00:00"))
        end = datetime.fromisoformat(str(poll["ends_at"]).replace("Z", "+00:00"))
        if not (start <= now <= end):
            raise HTTPException(status_code=409, detail="Esta encuesta no está abierta para votar")
    except HTTPException:
        raise
    except Exception:
        pass

    # 1 respuesta por usuario (verificar por poll_id + user_id)
    existing = await (
        supabase.table("poll_votes")
        .select("id")
        .eq("poll_id", poll_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Ya respondiste esta encuesta")

    # Guardar respuestas — una fila por pregunta en poll_votes
    # option_value = valor elegido (opción o número)
    rows = []
    for ans in payload.answers:
        option_value = ans.answer.get("option") or str(ans.answer.get("value", ""))
        if option_value:
            rows.append({
                "poll_id": poll_id,
                "user_id": user_id,
                "option_value": option_value,
            })

    if rows:
        await supabase.table("poll_votes").insert(rows).execute()

    logger.info(f"Encuesta respondida | poll={poll_id} | user={user_id} | preguntas={len(rows)}")
    return {"success": True, "answers_stored": len(rows)}
