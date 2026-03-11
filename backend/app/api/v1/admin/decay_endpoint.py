"""
BEACON PROTOCOL — Admin Decay Endpoint
========================================
Permite al Overlord disparar el decay job manualmente desde el panel
o ejecutar un dry-run para previsualizar qué entidades serían afectadas.

GET /admin/decay/preview  → Dry-run: muestra cambios sin aplicarlos
POST /admin/decay/run     → Aplica el decay (requiere confirmación)
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_async_supabase_client
from app.core.decay.reputation_decay import ReputationDecayJob, MIN_DAYS_FOR_DECAY
from app.api.v1.admin.require_admin import require_admin_role

logger = logging.getLogger("beacon.admin.decay")

router = APIRouter(prefix="/admin/decay", tags=["Admin — Decay"])


@router.get("/preview", summary="[ADMIN] Preview del decay (dry-run)")
async def decay_preview(
    min_days: int = MIN_DAYS_FOR_DECAY,
    admin: dict = Depends(require_admin_role),
):
    """
    Calcula qué entidades serían afectadas por el decay job
    sin modificar nada en la BBDD.

    Útil para decidir si ejecutar el decay o ajustar los parámetros.
    """
    supabase = get_async_supabase_client()
    job = ReputationDecayJob(supabase)

    try:
        summary = await job.run(dry_run=True, min_days=min_days)
    except Exception as e:
        logger.error(f"Error en decay preview: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Error ejecutando preview: {e}")

    return summary


@router.post("/run", summary="[ADMIN] Ejecutar decay job")
async def decay_run(
    min_days: int = MIN_DAYS_FOR_DECAY,
    admin: dict = Depends(require_admin_role),
):
    """
    Aplica el decaimiento temporal de reputation_score.

    Cada entidad inactiva (sin votos > min_days) retrocede
    exponencialmente hacia el prior Bayesiano (3.0).

    Cada modificación queda registrada en audit_logs (REPUTATION_DECAY_APPLIED).
    """
    supabase = get_async_supabase_client()
    job = ReputationDecayJob(supabase)

    try:
        summary = await job.run(dry_run=False, min_days=min_days)
    except Exception as e:
        logger.error(f"Error en decay run: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Error ejecutando decay: {e}")

    if summary.get("total_errors", 0) > 0:
        logger.warning(
            f"Decay completado con {summary['total_errors']} errores parciales. "
            f"Modificadas: {summary['total_modified']}"
        )

    return summary
