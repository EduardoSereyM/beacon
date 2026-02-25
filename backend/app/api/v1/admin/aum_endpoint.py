"""
BEACON PROTOCOL — Admin Endpoints (Panel del Overlord)
=======================================================
Endpoints exclusivos para el administrador del sistema.

/admin/aum → Valor total de la red (Assets Under Management)
"""

from fastapi import APIRouter

from app.core.valuation.user_asset_calculator import asset_calculator

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/aum")
async def get_total_aum():
    """
    Assets Under Management — Valor total de la red Beacon.

    Lee todos los usuarios de Supabase y calcula el valor
    total de la plataforma usando el UserAssetCalculator.

    Para el MVP, usa datos de demostración.
    En producción, se conectará a la tabla 'users' de Supabase.
    """
    try:
        from app.core.database import get_supabase_client
        supabase = get_supabase_client()

        result = supabase.table("users").select(
            "id, rank, integrity_score, commune, age_range, region, rut_hash"
        ).execute()

        if result.data:
            aum = asset_calculator.calculate_total_platform_value(result.data)
            return {
                "status": "success",
                "data": aum,
                "source": "SUPABASE_LIVE",
            }

    except Exception:
        pass

    # Fallback: datos de demostración para el MVP
    demo_users = [
        {"rank": "BRONZE", "integrity_score": 0.6},
        {"rank": "SILVER", "integrity_score": 0.8, "commune": "Valparaíso", "rut_hash": "abc123"},
        {"rank": "GOLD", "integrity_score": 0.95, "commune": "Santiago", "age_range": "30-40", "rut_hash": "def456"},
        {"rank": "DIAMOND", "integrity_score": 1.0, "commune": "Viña del Mar", "age_range": "40-50", "region": "Valparaíso", "rut_hash": "ghi789"},
    ]

    aum = asset_calculator.calculate_total_platform_value(demo_users)
    return {
        "status": "success",
        "data": aum,
        "source": "DEMO_DATA",
    }
