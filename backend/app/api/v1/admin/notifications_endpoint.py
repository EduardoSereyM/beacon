"""
BEACON PROTOCOL — Notifications Admin Endpoint
===============================================
GET /admin/notifications → últimas 50 notificaciones del sistema.

Lee desde audit_logs donde entity_type='notification'.
No hay tabla nueva: el audit_logs es la fuente de verdad.

"El Overlord ve todo lo que el Heraldo anunció."
"""

import logging

from fastapi import APIRouter, Depends, Query

from app.api.v1.admin.require_admin import require_admin_role
from app.core.database import get_async_supabase_client

logger = logging.getLogger("beacon.notifications_endpoint")

router = APIRouter(prefix="/admin/notifications", tags=["Admin — Notifications"])


@router.get("", summary="[ADMIN] Últimas notificaciones del sistema")
async def list_admin_notifications(
    limit: int = Query(50, ge=1, le=200, description="Máximo de notificaciones a retornar"),
    admin: dict = Depends(require_admin_role),
):
    """
    Retorna las últimas notificaciones del sistema ordenadas por fecha DESC.

    Fuente: audit_logs con entity_type='notification'.
    Campos retornados: id, action, entity_id, details (subject/message/label),
                       created_at.

    El frontend usa created_at + id para calcular el badge de no-leídas
    (estado de lectura persiste en localStorage del cliente).
    """
    supabase = get_async_supabase_client()

    result = await (
        supabase.table("audit_logs")
        .select("id, action, entity_id, details, created_at")
        .eq("entity_type", "notification")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    items = result.data or []

    # Normalizar: extraer subject/message/label a nivel raíz para el frontend
    normalized = []
    for row in items:
        d = row.get("details") or {}
        normalized.append({
            "id":         row["id"],
            "action":     row["action"],
            "entity_id":  row.get("entity_id", ""),
            "subject":    d.get("subject", ""),
            "message":    d.get("message", ""),
            "label":      d.get("label", row["action"]),
            "details":    d,
            "created_at": row["created_at"],
        })

    return {
        "items": normalized,
        "total": len(normalized),
    }
