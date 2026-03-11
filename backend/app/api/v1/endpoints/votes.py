"""
BEACON PROTOCOL — Votes Router (El Veredicto del Búnker)
=========================================================
POST /entities/{entity_id}/vote → Emitir veredicto multidimensional

Fórmula Bayesiana: score = (m·C + Σ_votos) / (m + n)
  m = 30 (peso del prior)
  C = 3.0 (media neutral del prior)

"El peso de tu voto depende del peso de tu integridad."
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, field_validator
from typing import Dict
import logging

from app.core.database import get_async_supabase_client
from app.api.v1.user.auth import get_current_user
from app.api.v1.endpoints.realtime import publish_verdict_pulse
from app.core.audit_logger import audit_bus

logger = logging.getLogger("beacon.votes")

router = APIRouter()

# ─── Parámetros Bayesianos (espejo del frontend) ───
BAYESIAN_M = 30    # peso del prior
BAYESIAN_C = 3.0   # media neutral del prior


class VotePayload(BaseModel):
    scores: Dict[str, float]

    @field_validator("scores")
    @classmethod
    def validate_scores(cls, v: Dict[str, float]) -> Dict[str, float]:
        if not v:
            raise ValueError("Se requiere al menos un criterio de evaluación")
        for key, val in v.items():
            if not (0.0 <= val <= 5.0):
                raise ValueError(f"Score '{key}' fuera de rango [0, 5]: {val}")
        return v


@router.post("/entities/{entity_id}/vote", summary="Emitir veredicto multidimensional")
async def submit_vote(
    entity_id: str,
    payload: VotePayload,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    Emite un veredicto multidimensional sobre una entidad.
    Actualiza reputation_score con fórmula Bayesiana incremental (m=30, C=3.0).
    Requiere autenticación mínima BRONZE.
    """
    supabase = get_async_supabase_client()
    user_id = current_user.get("id")

    # 0. Anti-brigada: un voto por usuario por entidad
    try:
        existing = await (
            supabase.table("entity_reviews")
            .select("id")
            .eq("entity_id", entity_id)
            .eq("user_id", user_id)
            .execute()
        )
        if existing.data:
            raise HTTPException(
                status_code=409,
                detail="Ya emitiste tu veredicto sobre esta entidad. Solo se permite un voto por ciudadano.",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Anti-brigada check fallido (no bloquea): entity={entity_id} | {e}")

    try:
        # 1. Verificar que la entidad existe y está activa
        entity_result = await (
            supabase.table("entities")
            .select("id, reputation_score, total_reviews")
            .eq("id", entity_id)
            .eq("is_active", True)
            .single()
            .execute()
        )
    except Exception as e:
        logger.warning(f"Entidad no encontrada o inactiva: entity={entity_id} | {e}")
        raise HTTPException(status_code=404, detail="Entidad no encontrada o no disponible")

    if not entity_result.data:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")

    entity = entity_result.data
    old_score: float = float(entity.get("reputation_score") or 0.0)
    old_n: int = int(entity.get("total_reviews") or 0)

    # 2. Promedio del veredicto multidimensional
    vote_avg = sum(payload.scores.values()) / len(payload.scores)

    # 2b. Peso del voto según rango del ciudadano (Meritocracia)
    user_rank = current_user.get("rank", "BRONZE")
    weight_key = f"VOTE_WEIGHT_{user_rank}"
    vote_weight = 1.0
    try:
        weight_row = await (
            supabase.table("config_params")
            .select("value")
            .eq("key", weight_key)
            .single()
            .execute()
        )
        if weight_row.data:
            vote_weight = float(weight_row.data["value"])
    except Exception:
        # Si config_params no está disponible, el voto tiene peso BRONZE (1.0)
        logger.warning(f"No se pudo leer {weight_key} de config_params, usando 1.0")

    # 3. Fórmula Bayesiana incremental con peso por rango
    # El peso amplifica la contribución del voto al raw_sum,
    # equivalente a contar el voto como `vote_weight` votos BRONZE.
    # Revertir bayesian → raw_sum: bayesian = (m·C + raw_sum) / (m + n)
    # ⟹ raw_sum = bayesian · (m + n) - m·C
    if old_n > 0:
        raw_sum = old_score * (BAYESIAN_M + old_n) - BAYESIAN_M * BAYESIAN_C
    else:
        raw_sum = 0.0

    new_n = old_n + 1
    new_raw_sum = raw_sum + (vote_avg * vote_weight)
    new_score = (BAYESIAN_M * BAYESIAN_C + new_raw_sum) / (BAYESIAN_M + new_n)

    # Clamp al rango [0, 5]
    new_score = max(0.0, min(5.0, round(new_score, 4)))

    try:
        # 4. Persistir score en entities
        await (
            supabase.table("entities")
            .update({
                "reputation_score": new_score,
                "total_reviews": new_n,
                "last_reviewed_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", entity_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error persistiendo voto: entity={entity_id} | {e}")
        raise HTTPException(status_code=503, detail="Error al guardar el veredicto. Intenta nuevamente.")

    # 4b. Propagar actualización a WebSocket via Redis Pub/Sub
    background_tasks.add_task(
        publish_verdict_pulse,
        entity_id=entity_id,
        new_score=new_score,
        total_votes=new_n,
        integrity_index=round(new_score / 5.0, 4),
        is_gold_verdict=user_rank in ("GOLD", "DIAMOND"),
        voter_rank=user_rank,
    )

    # 5. Registrar review para anti-brigada (best-effort — no bloquea si falla)
    try:
        await (
            supabase.table("entity_reviews")
            .insert({
                "entity_id": entity_id,
                "user_id": user_id,
                "vote_avg": round(vote_avg, 4),
            })
            .execute()
        )
    except Exception as e:
        logger.warning(f"No se pudo registrar entity_review (anti-brigada): entity={entity_id} | {e}")

    logger.info(
        f"Voto | entity={entity_id} | user={user_id} | rank={user_rank} "
        f"| avg={vote_avg:.2f} | weight={vote_weight} | new_score={new_score:.4f} | total={new_n}"
    )

    background_tasks.add_task(
        audit_bus.log_event,
        actor_id=user_id,
        action="VOTE_SUBMITTED",
        entity_type="ENTITY",
        entity_id=entity_id,
        details={
            "vote_avg": round(vote_avg, 4),
            "vote_weight": vote_weight,
            "voter_rank": user_rank,
            "scores": payload.scores,
            "new_score": round(new_score, 4),
            "total_reviews": new_n,
        },
    )

    return {
        "success": True,
        "new_score": round(new_score, 2),
        "total_reviews": new_n,
        "your_vote": round(vote_avg, 2),
        "vote_weight": vote_weight,
        "voter_rank": user_rank,
    }
