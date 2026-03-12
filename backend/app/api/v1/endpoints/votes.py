"""
BEACON PROTOCOL — Votes Router (El Veredicto del Búnker)
=========================================================
POST /entities/{entity_id}/vote → Emitir o modificar veredicto multidimensional

Sistema de pesos v1 (2 rangos):
  BASIC    → rank_weight = 0.5   (solo email verificado)
  VERIFIED → rank_weight = 1.0   (identidad completa)
  vote_penalty (columna en users) → multiplicador adicional Overlord-controlable
  peso_efectivo = rank_weight × vote_penalty

Fórmula de score (weighted running average, sin prior bayesiano para v1):
  Nuevo voto:
    new_score = (old_score × old_n + vote_avg × effective_weight) / (old_n + effective_weight)
    new_n     = old_n + 1

  Modificación de voto (después de VOTE_EDIT_LOCK_DAYS):
    new_score = (old_score × old_n − old_vote_avg × old_eff_weight + vote_avg × effective_weight) / old_n
    new_n     = old_n (sin cambio)

Time-lock:
  entity_reviews.updated_at controla la fecha del último voto.
  Si updated_at + VOTE_EDIT_LOCK_DAYS > now → HTTP 423 Locked con unlock_date.

Mínimo para aparecer en ranking:
  total_reviews >= 3 (filtrado en GET /entities, no aquí)

v4.0: Fórmula bayesiana (m=30, C=3.0), Decaimiento temporal, Anti-brigada profundo.

"El peso de tu voto depende del peso de tu integridad."
"""

from datetime import datetime, timezone, timedelta

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


@router.post("/entities/{entity_id}/vote", summary="Emitir o modificar veredicto")
async def submit_vote(
    entity_id: str,
    payload: VotePayload,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    Emite un veredicto multidimensional sobre una entidad.
    Si ya votó y el time-lock expiró → modifica el voto anterior.
    Si el time-lock no expiró → HTTP 423 con fecha de desbloqueo.
    """
    supabase = get_async_supabase_client()
    user_id = current_user.get("id")
    user_rank = current_user.get("rank", "BASIC")

    # ─── 1. Verificar entidad existe y está activa ────────────────────────
    try:
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

    # ─── 2. Promedio de los sliders (vote_avg) ───────────────────────────
    vote_avg = sum(payload.scores.values()) / len(payload.scores)

    # ─── 3. Peso efectivo del voto ────────────────────────────────────────
    # rank_weight: leído de config_params (VOTE_WEIGHT_BASIC / VOTE_WEIGHT_VERIFIED)
    # vote_penalty: campo numérico en users (1.0 por defecto, ajustable por Overlord)
    weight_key = f"VOTE_WEIGHT_{user_rank}"
    rank_weight = 0.5  # default BASIC
    try:
        weight_row = await (
            supabase.table("config_params")
            .select("value")
            .eq("key", weight_key)
            .single()
            .execute()
        )
        if weight_row.data:
            rank_weight = float(weight_row.data["value"])
    except Exception:
        logger.warning(f"No se pudo leer {weight_key} de config_params, usando 0.5")

    vote_penalty = float(current_user.get("vote_penalty", 1.0))
    effective_weight = round(rank_weight * vote_penalty, 4)

    # ─── 4. Time-lock: ¿ya votó? ¿puede modificar? ───────────────────────
    is_update = False
    old_review_data: dict = {}
    try:
        existing = await (
            supabase.table("entity_reviews")
            .select("id, vote_avg, effective_weight, updated_at, created_at")
            .eq("entity_id", entity_id)
            .eq("user_id", user_id)
            .execute()
        )
        if existing.data:
            old_review_data = existing.data[0]

            # Fetch VOTE_EDIT_LOCK_DAYS desde config_params
            lock_days = 30  # default
            try:
                lock_row = await (
                    supabase.table("config_params")
                    .select("value")
                    .eq("key", "VOTE_EDIT_LOCK_DAYS")
                    .single()
                    .execute()
                )
                if lock_row.data:
                    lock_days = int(lock_row.data["value"])
            except Exception:
                logger.warning("No se pudo leer VOTE_EDIT_LOCK_DAYS, usando 30 días")

            # Fecha de referencia: updated_at si existe, sino created_at
            last_vote_str = old_review_data.get("updated_at") or old_review_data.get("created_at")
            last_dt = datetime.fromisoformat(str(last_vote_str).replace("Z", "+00:00"))
            unlock_dt = last_dt + timedelta(days=lock_days)

            if datetime.now(timezone.utc) < unlock_dt:
                raise HTTPException(
                    status_code=423,
                    detail={
                        "code": "VOTE_LOCKED",
                        "unlock_date": unlock_dt.isoformat(),
                        "message": (
                            f"Tu voto está bloqueado hasta el "
                            f"{unlock_dt.strftime('%d/%m/%Y')}. "
                            f"Podrás modificarlo después de {lock_days} días."
                        ),
                    },
                )
            is_update = True
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Time-lock check fallido (no bloquea): entity={entity_id} | {e}")

    # ─── 5. Calcular nuevo score (weighted running average) ───────────────
    if is_update:
        # Modificación: reemplazar contribución del voto anterior
        old_vote_avg_stored = float(old_review_data.get("vote_avg", 0.0))
        old_eff_weight = float(old_review_data.get("effective_weight", 1.0))
        # Reconstruir suma ponderada y reemplazar
        old_weighted_sum = old_score * old_n
        new_weighted_sum = old_weighted_sum - (old_vote_avg_stored * old_eff_weight) + (vote_avg * effective_weight)
        new_score = new_weighted_sum / old_n if old_n > 0 else vote_avg
        new_n = old_n  # la cantidad de votantes no cambia en modificación
    else:
        # Voto nuevo
        if old_n == 0:
            new_score = vote_avg
        else:
            new_score = (old_score * old_n + vote_avg * effective_weight) / (old_n + effective_weight)
        new_n = old_n + 1

    new_score = max(0.0, min(5.0, round(new_score, 4)))

    # ─── 6. Persistir score en entities ──────────────────────────────────
    try:
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

    # ─── 7. Propagar actualización a WebSocket via Redis Pub/Sub ─────────
    background_tasks.add_task(
        publish_verdict_pulse,
        entity_id=entity_id,
        new_score=new_score,
        total_votes=new_n,
        integrity_index=round(new_score / 5.0, 4),
        is_gold_verdict=user_rank == "VERIFIED",
        voter_rank=user_rank,
    )

    # ─── 8. Upsert en entity_reviews (UNIQUE se mantiene) ────────────────
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        if is_update:
            await (
                supabase.table("entity_reviews")
                .update({
                    "vote_avg": round(vote_avg, 4),
                    "effective_weight": effective_weight,
                    "updated_at": now_iso,
                })
                .eq("entity_id", entity_id)
                .eq("user_id", user_id)
                .execute()
            )
        else:
            await (
                supabase.table("entity_reviews")
                .insert({
                    "entity_id": entity_id,
                    "user_id": user_id,
                    "vote_avg": round(vote_avg, 4),
                    "effective_weight": effective_weight,
                })
                .execute()
            )
    except Exception as e:
        logger.warning(f"No se pudo registrar entity_review: entity={entity_id} | {e}")

    logger.info(
        f"{'MOD' if is_update else 'NEW'} Voto | entity={entity_id} | user={user_id} "
        f"| rank={user_rank} | penalty={vote_penalty} | eff_weight={effective_weight} "
        f"| avg={vote_avg:.2f} | new_score={new_score:.4f} | total={new_n}"
    )

    # ─── 9. Audit log (background para no bloquear la respuesta) ─────────
    background_tasks.add_task(
        audit_bus.log_event,
        actor_id=user_id,
        action="VOTE_SUBMITTED",
        entity_type="ENTITY",
        entity_id=entity_id,
        details={
            "is_update": is_update,
            "vote_avg": round(vote_avg, 4),
            "rank_weight": rank_weight,
            "vote_penalty": vote_penalty,
            "effective_weight": effective_weight,
            "voter_rank": user_rank,
            "scores": payload.scores,
            "new_score": round(new_score, 4),
            "total_reviews": new_n,
        },
    )

    return {
        "success": True,
        "is_update": is_update,
        "new_score": round(new_score, 2),
        "total_reviews": new_n,
        "your_vote": round(vote_avg, 2),
        "effective_weight": effective_weight,
        "voter_rank": user_rank,
    }
