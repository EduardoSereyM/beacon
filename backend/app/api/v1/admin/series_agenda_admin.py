"""
BEACON PROTOCOL — Opciones de las series «agenda» (Admin)
===========================================================
Una serie agenda (p. ej. «noticia más importante de la semana») repite la pregunta pero las opciones
las define una persona cada edición. Ver migración 030.

Endpoints:
  GET /admin/polls/series/{id}/upcoming                   → Edición en curso y siguiente, con sus opciones
  PUT /admin/polls/series/{id}/editions/{edition}/options → Define las opciones (hasta que la edición se publica)
Cada cambio deja audit_log.
"""

import logging
from datetime import datetime, timezone
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.api.v1.admin.require_admin import require_admin_role
from app.core.audit_logger import audit_bus
from app.core.database import get_async_supabase_client
from app.core.polls_series.series_agenda import (
    MAX_OPTIONS,
    MIN_OPTIONS,
    OPTION_MAX_LEN,
    OPTION_MIN_LEN,
    load_edition_options,
)
from app.core.polls_series.series_window import (
    current_edition,
    edition_label,
    is_valid_edition,
    next_edition,
)

logger = logging.getLogger("beacon.series_agenda_admin")

router = APIRouter(prefix="/admin/polls/series", tags=["Admin — Series Agenda"])


class EditionOptionsIn(BaseModel):
    options: List[str] = Field(..., min_length=MIN_OPTIONS, max_length=MAX_OPTIONS)

    @field_validator("options")
    @classmethod
    def _clean(cls, options: List[str]) -> List[str]:
        cleaned = [o.strip() for o in options]
        if any(not (OPTION_MIN_LEN <= len(o) <= OPTION_MAX_LEN) for o in cleaned):
            raise ValueError(f"Cada opción debe tener entre {OPTION_MIN_LEN} y {OPTION_MAX_LEN} caracteres.")
        if len({o.lower() for o in cleaned}) != len(cleaned):
            raise ValueError("Las opciones no pueden repetirse.")
        return cleaned


async def _agenda_series(supabase, series_id: str) -> dict[str, Any]:
    found = await supabase.table("poll_series").select("*").eq("id", series_id).limit(1).execute()
    if not found.data:
        raise HTTPException(status_code=404, detail="Serie no encontrada.")
    series = found.data[0]
    if series.get("kind") != "agenda":
        raise HTTPException(status_code=400, detail="Solo las series de tipo agenda tienen opciones por edición.")
    return series


async def _published(supabase, series_id: str, edition: str) -> bool:
    found = await (
        supabase.table("polls").select("id").eq("series_id", series_id).eq("edition", edition).limit(1).execute()
    )
    return bool(found.data)


@router.get("/{series_id}/upcoming", summary="[ADMIN] Edición en curso y siguiente de una serie agenda")
async def admin_upcoming(series_id: str, admin: dict = Depends(require_admin_role)):
    supabase = get_async_supabase_client()
    series = await _agenda_series(supabase, series_id)
    current = current_edition(datetime.now(timezone.utc), series["cadence"])
    editions = []
    for edition in (current, next_edition(current, series["cadence"])):
        editions.append({
            "edition": edition,
            "label": edition_label(edition),
            "published": await _published(supabase, series_id, edition),
            "options": await load_edition_options(supabase, series_id, edition),
        })
    return {"series": {"id": series["id"], "slug": series["slug"], "title": series["title"], "cadence": series["cadence"]},
            "editions": editions}


@router.put("/{series_id}/editions/{edition}/options", summary="[ADMIN] Definir las opciones de una edición agenda")
async def admin_set_options(
    series_id: str,
    edition: str,
    body: EditionOptionsIn,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    series = await _agenda_series(supabase, series_id)
    cadence = series["cadence"]
    if not is_valid_edition(edition, cadence):
        raise HTTPException(status_code=400, detail=f"Edición inválida para una serie {cadence}.")
    if edition < current_edition(datetime.now(timezone.utc), cadence):
        raise HTTPException(status_code=400, detail="No se pueden definir opciones de una edición pasada.")
    if await _published(supabase, series_id, edition):
        raise HTTPException(status_code=409, detail="La edición ya se publicó: sus opciones ya no se pueden cambiar.")

    now = datetime.now(timezone.utc).isoformat()
    existing = await load_edition_options(supabase, series_id, edition)
    if existing is None:
        await supabase.table("series_edition_options").insert({
            "series_id": series_id, "edition": edition, "options": body.options, "created_by": admin["user_id"],
        }).execute()
    else:
        await (
            supabase.table("series_edition_options")
            .update({"options": body.options, "updated_at": now})
            .eq("series_id", series_id)
            .eq("edition", edition)
            .execute()
        )

    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_SET_SERIES_EDITION_OPTIONS",
        entity_type="POLL_SERIES",
        entity_id=series_id,
        details={"slug": series["slug"], "edition": edition, "options": len(body.options), "replaced": existing is not None},
    )
    return {"series_id": series_id, "edition": edition, "options": body.options}
