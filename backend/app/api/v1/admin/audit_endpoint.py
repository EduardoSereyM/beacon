"""
BEACON PROTOCOL — Admin Audit Log Endpoint (El Escriba)
=========================================================
Endpoint dedicado para el visor de audit logs del Overlord.
Paginación real, filtros por action y entity_type.

"Lo que entró al log, nunca sale. El Escriba no olvida."
"""

import logging
from fastapi import APIRouter, Depends, Query
from app.core.database import get_async_supabase_client
from app.api.v1.admin.require_admin import require_admin_role

logger = logging.getLogger("beacon.audit_endpoint")
router = APIRouter(prefix="/admin", tags=["Admin — Audit"])


@router.get("/audit-logs", summary="[ADMIN] Visor de audit logs con paginación")
async def admin_get_audit_logs(
    limit:       int  = Query(50,  ge=1, le=200),
    offset:      int  = Query(0,   ge=0),
    action:      str  = Query(None, description="Filtrar por tipo de acción"),
    entity_type: str  = Query(None, description="Filtrar por tipo de entidad"),
    admin: dict = Depends(require_admin_role),
):
    """
    Retorna audit logs con paginación y filtros opcionales.
    Cada entrada incluye todos los campos de la tabla para el visor.
    """
    supabase = get_async_supabase_client()

    query = (
        supabase.table("audit_logs")
        .select("*", count="exact")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if action:
        query = query.eq("action", action)
    if entity_type:
        query = query.eq("entity_type", entity_type)

    try:
        result = await query.execute()
    except Exception as e:
        logger.error("❌ audit_logs SELECT failed: %s", e, exc_info=True)
        return {"logs": [], "total": 0, "limit": limit, "offset": offset, "error": str(e)}

    logs  = result.data  or []
    total = result.count or 0
    logger.info("📜 audit_logs query → total=%s rows=%s", total, len(logs))

    # Enriquecer cada entrada con un label legible
    enriched = []
    for log in logs:
        details  = log.get("details") or {}
        new_data = details.get("new_data") or {}
        label = (
            (new_data.get("first_name", "") + " " + new_data.get("last_name", "")).strip()
            or details.get("email", "")
            or log.get("entity_id", "")
            or "—"
        )
        enriched.append({
            **log,
            "_label": label,
        })

    return {
        "logs":   enriched,
        "total":  total,
        "limit":  limit,
        "offset": offset,
    }


@router.get("/audit-logs/actions", summary="[ADMIN] Lista de tipos de acción distintos")
async def admin_get_audit_actions(admin: dict = Depends(require_admin_role)):
    """Lista los tipos de acción únicos para el filtro del visor."""
    supabase = get_async_supabase_client()
    result = await (
        supabase.table("audit_logs")
        .select("action")
        .execute()
    )
    actions = sorted({r["action"] for r in (result.data or []) if r.get("action")})
    return {"actions": actions}
