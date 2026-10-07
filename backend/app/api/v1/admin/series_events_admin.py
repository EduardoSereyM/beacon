"""
BEACON PROTOCOL — Eventos anotados de series (Admin)
=====================================================
Hitos que se dibujan sobre el gráfico de tendencia ("Cambio de gabinete"). Ver migración 026.

Endpoints:
  GET    /admin/series-events?series_id=   → Lista (sin filtro: todos)
  POST   /admin/series-events              → Crea (series_id vacío = evento general, todas las series)
  DELETE /admin/series-events/{id}         → Elimina (un hito mal cargado)
Cada alta y baja deja audit_log.
"""

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.v1.admin.require_admin import require_admin_role
from app.core.audit_logger import audit_bus
from app.core.database import get_async_supabase_client

logger = logging.getLogger("beacon.series_events_admin")

router = APIRouter(prefix="/admin/series-events", tags=["Admin — Series Events"])


class SeriesEventIn(BaseModel):
    series_id: Optional[str] = None
    event_date: date
    label: str = Field(..., min_length=1, max_length=120)


@router.get("", summary="[ADMIN] Lista eventos anotados")
async def admin_list_events(series_id: Optional[str] = None, admin: dict = Depends(require_admin_role)):
    supabase = get_async_supabase_client()
    query = supabase.table("series_events").select("*")
    if series_id:
        query = query.eq("series_id", series_id)
    result = await query.order("event_date", desc=True).execute()
    return {"items": result.data or []}


@router.post("", summary="[ADMIN] Crear evento anotado", status_code=201)
async def admin_create_event(body: SeriesEventIn, admin: dict = Depends(require_admin_role)):
    supabase = get_async_supabase_client()
    if body.series_id:
        series = await supabase.table("poll_series").select("id").eq("id", body.series_id).limit(1).execute()
        if not series.data:
            raise HTTPException(status_code=404, detail="Serie no encontrada.")

    payload = {
        "series_id": body.series_id,
        "event_date": body.event_date.isoformat(),
        "label": body.label.strip(),
        "created_by": admin["user_id"],
    }
    result = await supabase.table("series_events").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creando el evento.")
    event = result.data[0]

    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_CREATE_SERIES_EVENT",
        entity_type="SERIES_EVENT",
        entity_id=event["id"],
        details={"series_id": body.series_id, "event_date": payload["event_date"], "label": payload["label"]},
    )
    return {"event": event}


@router.delete("/{event_id}", summary="[ADMIN] Eliminar evento anotado")
async def admin_delete_event(event_id: str, admin: dict = Depends(require_admin_role)):
    supabase = get_async_supabase_client()
    found = await supabase.table("series_events").select("*").eq("id", event_id).limit(1).execute()
    if not found.data:
        raise HTTPException(status_code=404, detail="Evento no encontrado.")
    existing = found.data[0]

    await supabase.table("series_events").delete().eq("id", event_id).execute()
    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_DELETE_SERIES_EVENT",
        entity_type="SERIES_EVENT",
        entity_id=event_id,
        details={"series_id": existing["series_id"], "label": existing["label"]},
    )
    return {"deleted": event_id}
