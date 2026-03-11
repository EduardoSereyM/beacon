"""
BEACON PROTOCOL — Admin Endpoints (Panel del Overlord)
=======================================================
Endpoints exclusivos para el administrador del sistema.

/admin/aum → Valor total de la red (Assets Under Management)
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_async_supabase_client
from app.core.valuation.user_asset_calculator import asset_calculator
from app.api.v1.admin.require_admin import require_admin_role

logger = logging.getLogger("beacon.admin.aum")

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/aum")
async def get_total_aum(admin: dict = Depends(require_admin_role)):
    """
    Assets Under Management — Valor total de la red Beacon.

    Lee los usuarios de Supabase y calcula el valor total de la plataforma
    usando el UserAssetCalculator. Retorna 503 si la BBDD no está disponible.
    """
    try:
        supabase = get_async_supabase_client()
        result = await supabase.table("users").select(
            "id, rank, integrity_score, commune, age_range, region, rut_hash"
        ).execute()
    except Exception as e:
        logger.error(f"Error consultando users para AUM: {e}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Servicio de valuación temporalmente no disponible. Intenta nuevamente.",
        )

    if not result.data:
        return {
            "status": "success",
            "data": asset_calculator.calculate_total_platform_value([]),
            "source": "SUPABASE_LIVE",
            "total_users": 0,
        }

    aum = asset_calculator.calculate_total_platform_value(result.data)
    return {
        "status": "success",
        "data": aum,
        "source": "SUPABASE_LIVE",
        "total_users": len(result.data),
    }
