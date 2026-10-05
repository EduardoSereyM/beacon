"""
BEACON PROTOCOL — Series de encuestas mensuales (Admin)
========================================================
Plantillas de encuestas que se republican cada mes (ver migración 024).

Endpoints:
  GET   /admin/polls/series              → Lista series
  POST  /admin/polls/series              → Crear serie
  PATCH /admin/polls/series/{id}         → Editar / pausar (si cambia el contenido de las preguntas sube template_version)
  POST  /admin/polls/series/publish-due  → Cron: publica la edición del mes (PIPELINE_API_KEY)
"""

import logging
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.v1.admin.polls_admin import (
    QuestionDef,
    VALID_CATEGORIES,
    _generate_slug,
    require_pipeline_key,
)
from app.api.v1.admin.require_admin import require_admin_role
from app.core.audit_logger import audit_bus
from app.core.database import get_async_supabase_client
from app.core.polls_series.series_publisher import is_duplicate_error, publish_due_series
from app.core.polls_series.series_questions import (
    questions_content_changed,
    resolve_question_ids,
)

logger = logging.getLogger("beacon.polls_series_admin")

router = APIRouter(prefix="/admin/polls/series", tags=["Admin — Poll Series"])

SERIES_TITLE_MAX = 280
SERIES_SLUG_MAX = 100


class SeriesCreateIn(BaseModel):
    # Límites con margen para la edición: título + " — Septiembre 2026" (≤300 en polls)
    # y slug + "-YYYY-MM" (≤120 en polls).
    title: str = Field(..., min_length=1, max_length=SERIES_TITLE_MAX)
    slug: Optional[str] = Field(None, min_length=2, max_length=SERIES_SLUG_MAX, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    context: Optional[str] = None
    category: str = "general"
    tags: List[str] = []
    questions: List[QuestionDef] = Field(..., min_length=1)
    requires_auth: bool = True


class SeriesUpdateIn(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=SERIES_TITLE_MAX)
    context: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    questions: Optional[List[QuestionDef]] = Field(None, min_length=1)
    requires_auth: Optional[bool] = None
    is_active: Optional[bool] = None


def _validate_questions(questions: List[QuestionDef]) -> None:
    for q in questions:
        if q.type == "multiple_choice" and (not q.options or len(q.options) < 2):
            raise HTTPException(status_code=400, detail=f"Pregunta '{q.text}' requiere al menos 2 opciones.")
        if q.type == "scale" and q.scale_points is not None and q.scale_labels \
                and len(q.scale_labels) != q.scale_points:
            raise HTTPException(
                status_code=400,
                detail=f"Pregunta '{q.text}': scale_labels debe tener exactamente {q.scale_points} etiquetas.",
            )


@router.get("", summary="[ADMIN] Lista series de encuestas")
async def admin_list_series(admin: dict = Depends(require_admin_role)):
    supabase = get_async_supabase_client()
    result = await supabase.table("poll_series").select("*").order("created_at", desc=True).execute()
    return {"items": result.data, "total": len(result.data)}


@router.post("", summary="[ADMIN] Crear serie de encuestas", status_code=201)
async def admin_create_series(body: SeriesCreateIn, admin: dict = Depends(require_admin_role)):
    _validate_questions(body.questions)
    supabase = get_async_supabase_client()

    slug = body.slug or _generate_slug(body.title)
    taken = await supabase.table("poll_series").select("id").eq("slug", slug).limit(1).execute()
    if taken.data:
        raise HTTPException(status_code=409, detail=f"Ya existe una serie con slug '{slug}'.")

    payload = {
        "slug": slug,
        "title": body.title,
        "context": body.context,
        "category": body.category if body.category in VALID_CATEGORIES else "general",
        "tags": body.tags,
        "questions": resolve_question_ids([q.model_dump() for q in body.questions], []),
        "requires_auth": body.requires_auth,
        "created_by": admin["user_id"],
    }
    try:
        result = await supabase.table("poll_series").insert(payload).execute()
    except Exception as exc:
        # Dos creaciones simultáneas: el UNIQUE de la base decide, el SELECT previo no basta.
        # OJO: hoy poll_series solo tiene UNIQUE sobre slug, por eso todo 23505 es "slug duplicado".
        # Si se agrega otro UNIQUE (p.ej. título), distinguir por nombre de constraint.
        if is_duplicate_error(exc):
            raise HTTPException(status_code=409, detail=f"Ya existe una serie con slug '{slug}'.")
        raise
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creando la serie.")
    series = result.data[0]

    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_CREATE_POLL_SERIES",
        entity_type="POLL_SERIES",
        entity_id=series["id"],
        details={"slug": slug, "title": body.title, "questions": len(body.questions)},
    )
    return {"series": series}


@router.patch("/{series_id}", summary="[ADMIN] Editar o pausar una serie")
async def admin_update_series(
    series_id: str,
    body: SeriesUpdateIn,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    existing = await (
        supabase.table("poll_series").select("*").eq("id", series_id).maybe_single().execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Serie no encontrada.")
    current = existing.data

    patch: dict[str, Any] = {}
    if body.title is not None:
        patch["title"] = body.title
    if body.context is not None:
        patch["context"] = body.context
    if body.category is not None:
        patch["category"] = body.category if body.category in VALID_CATEGORIES else "general"
    if body.tags is not None:
        patch["tags"] = body.tags
    if body.requires_auth is not None:
        patch["requires_auth"] = body.requires_auth
    if body.is_active is not None:
        patch["is_active"] = body.is_active
    if body.questions is not None:
        _validate_questions(body.questions)
        new_questions = [q.model_dump() for q in body.questions]
        if questions_content_changed(new_questions, current["questions"]):
            # Contenido distinto → serie no comparable: nueva versión de plantilla.
            # Los ids se conservan por posición; los que mande el cliente se ignoran.
            patch["questions"] = resolve_question_ids(new_questions, current["questions"])
            patch["template_version"] = current["template_version"] + 1

    if all(value is None for value in body.model_dump().values()):
        raise HTTPException(status_code=400, detail="No hay campos para actualizar.")
    if not patch:
        # Preguntas reenviadas sin cambios reales: no-op (no sube versión ni audita).
        return {"series": current}

    patch["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await supabase.table("poll_series").update(patch).eq("id", series_id).execute()

    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_UPDATE_POLL_SERIES",
        entity_type="POLL_SERIES",
        entity_id=series_id,
        details={"changes": [k for k in patch if k != "updated_at"], "slug": current["slug"]},
    )
    return {"series": result.data[0] if result.data else None}


@router.post("/publish-due", summary="[PIPELINE] Publicar la edición del mes de cada serie activa")
async def publish_due(pipeline: dict = Depends(require_pipeline_key)):
    """Disparado por el cron diario. No recibe parámetros: publica el mes en curso
    (hora de Chile) para cada serie activa y es idempotente."""
    supabase = get_async_supabase_client()
    summary = await publish_due_series(supabase, actor_id=pipeline["user_id"])
    if summary["failed"] or summary["audit_failed"]:
        logger.error(f"publish-due: failed={summary['failed']} audit_failed={summary['audit_failed']}")
        # 5xx para que el job de GitHub Actions (curl --fail) falle y avise;
        # el resumen va en el cuerpo y el reintento diario es idempotente.
        return JSONResponse(status_code=500, content=summary)
    return summary
