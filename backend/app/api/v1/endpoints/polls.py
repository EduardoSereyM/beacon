"""
BEACON PROTOCOL — Encuestas (Endpoints Públicos)
==================================================
Lectura pública + respuestas autenticadas.

Endpoints:
  GET  /encuestas            → Lista encuestas activas
  GET  /encuestas/{id}       → Detalle + preguntas
  POST /encuestas/{id}/respond → Responder (JWT requerido)
  GET  /encuestas/{id}/results → Resultados ponderados
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from collections import defaultdict

from app.core.database import get_async_supabase_client
from app.api.v1.user.auth import get_current_user

router = APIRouter(prefix="/encuestas", tags=["Encuestas"])


# ── Schemas ────────────────────────────────────────────────────

class QuestionAnswer(BaseModel):
    question_id: str
    answer: dict   # MC: {"option": "X"} | scale: {"value": 7}


class PollRespondIn(BaseModel):
    answers: List[QuestionAnswer]


# ── Endpoints ──────────────────────────────────────────────────

@router.get("", summary="Lista encuestas activas")
async def list_polls(limit: int = 20, offset: int = 0):
    supabase = get_async_supabase_client()
    result = await (
        supabase.table("polls")
        .select("id, title, description, cover_image_url, start_at, end_at, created_at")
        .eq("is_active", True)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"polls": result.data, "total": len(result.data)}


@router.get("/{poll_id}", summary="Detalle de encuesta con preguntas")
async def get_poll(poll_id: str):
    supabase = get_async_supabase_client()
    result = await (
        supabase.table("polls")
        .select("*, poll_questions(*)")
        .eq("id", poll_id)
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada.")

    # Ordenar preguntas por order_index
    poll = result.data
    if poll.get("poll_questions"):
        poll["poll_questions"].sort(key=lambda q: q.get("order_index", 0))

    return poll


@router.post("/{poll_id}/respond", summary="Responder encuesta (requiere JWT)")
async def respond_poll(
    poll_id: str,
    body: PollRespondIn,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_async_supabase_client()

    # Verificar que la encuesta existe y está activa
    poll = await (
        supabase.table("polls")
        .select("id, start_at, end_at, is_active")
        .eq("id", poll_id)
        .maybe_single()
        .execute()
    )
    if not poll.data or not poll.data["is_active"]:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada o inactiva.")

    # Peso del voto según rango del usuario
    user_rank = current_user.get("rank", "BASIC")
    weight = 1.0 if user_rank == "VERIFIED" else 0.5

    # Verificar que no haya respondido ya (check por primera pregunta)
    if body.answers:
        already = await (
            supabase.table("poll_responses")
            .select("id")
            .eq("poll_id", poll_id)
            .eq("user_id", current_user["id"])
            .limit(1)
            .execute()
        )
        if already.data:
            raise HTTPException(status_code=409, detail="Ya has respondido esta encuesta.")

    # Insertar respuestas
    payload = [
        {
            "poll_id": poll_id,
            "question_id": a.question_id,
            "user_id": current_user["id"],
            "answer": a.answer,
            "weight": weight,
        }
        for a in body.answers
    ]
    await supabase.table("poll_responses").insert(payload).execute()

    return {"ok": True, "weight_applied": weight, "answers_saved": len(payload)}


@router.get("/{poll_id}/results", summary="Resultados ponderados de la encuesta")
async def poll_results(poll_id: str):
    supabase = get_async_supabase_client()

    # Traer encuesta + preguntas
    poll = await (
        supabase.table("polls")
        .select("id, title, poll_questions(*)")
        .eq("id", poll_id)
        .maybe_single()
        .execute()
    )
    if not poll.data:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada.")

    questions = {q["id"]: q for q in (poll.data.get("poll_questions") or [])}

    # Traer todas las respuestas
    responses = await (
        supabase.table("poll_responses")
        .select("question_id, answer, weight")
        .eq("poll_id", poll_id)
        .execute()
    )

    # Agregar resultados ponderados por pregunta
    results = {}
    for r in responses.data:
        qid = r["question_id"]
        q = questions.get(qid)
        if not q:
            continue

        if qid not in results:
            results[qid] = {
                "question_id": qid,
                "question_text": q["question_text"],
                "question_type": q["question_type"],
                "total_responses": 0,
                "total_weight": 0.0,
            }
            if q["question_type"] == "multiple_choice":
                results[qid]["option_counts"] = defaultdict(float)
            else:
                results[qid]["weighted_sum"] = 0.0
                results[qid]["weighted_avg"] = 0.0

        w = float(r["weight"])
        results[qid]["total_responses"] += 1
        results[qid]["total_weight"] += w

        if q["question_type"] == "multiple_choice":
            opt = r["answer"].get("option", "")
            results[qid]["option_counts"][opt] += w
        else:
            val = r["answer"].get("value", 0)
            results[qid]["weighted_sum"] += val * w

    # Calcular promedios finales
    for qid, res in results.items():
        if res["question_type"] == "numeric_scale" and res["total_weight"] > 0:
            res["weighted_avg"] = round(res["weighted_sum"] / res["total_weight"], 2)
        if "option_counts" in res:
            res["option_counts"] = dict(res["option_counts"])

    return {
        "poll_id": poll_id,
        "title": poll.data["title"],
        "total_respondents": len(set(
            r["question_id"] for r in responses.data
        )) and len(responses.data),
        "results": list(results.values()),
    }
