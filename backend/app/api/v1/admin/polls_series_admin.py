"""
BEACON PROTOCOL — Series de encuestas recurrentes (Admin)
========================================================
Plantillas de encuestas que se republican cada mes o cada semana (migraciones 024 y 025).

Endpoints:
  GET   /admin/polls/series              → Lista series
  POST  /admin/polls/series              → Crear serie
  PATCH /admin/polls/series/{id}         → Editar / pausar (si cambia el contenido de las preguntas sube template_version)
  POST  /admin/polls/series/publish-due  → Cron: publica la edición en curso de cada serie (PIPELINE_API_KEY)
"""

import logging
from datetime import datetime, timezone
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.v1.admin.polls_admin import (
    QuestionDef,
    VALID_CATEGORIES,
    _generate_slug,
    _validate_legacy_scale,
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
    # Límites con margen para la edición: título + " — Semana 41 · 28 dic 2026 – 3 ene 2027"
    # (≤300 en polls) y slug + "-YYYY-wWW" (≤120 en polls).
    title: str = Field(..., min_length=1, max_length=SERIES_TITLE_MAX)
    slug: Optional[str] = Field(None, min_length=2, max_length=SERIES_SLUG_MAX, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    context: Optional[str] = None
    category: str = "general"
    tags: List[str] = []
    questions: List[QuestionDef] = Field(..., min_length=1)
    requires_auth: bool = True
    # Inmutable tras crear: cambiarla dejaría ediciones con formato de otra cadencia.
    cadence: Literal["monthly", "weekly"] = "monthly"
    # tracker: mismas preguntas y opciones cada edición. agenda: misma pregunta, opciones curadas por edición.
    # Inmutable tras crear, por la misma razón que la cadencia.
    kind: Literal["tracker", "agenda"] = "tracker"


class SeriesUpdateIn(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=SERIES_TITLE_MAX)
    context: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    questions: Optional[List[QuestionDef]] = Field(None, min_length=1)
    requires_auth: Optional[bool] = None
    is_active: Optional[bool] = None


def _validate_agenda_template(questions: List[QuestionDef]) -> None:
    """Una serie agenda tiene una sola pregunta de opción única: sus opciones fijas (p. ej. «Otra noticia»)
    quedan al final y las de cada semana se agregan antes."""
    only = questions[0]
    if len(questions) != 1 or only.type != "multiple_choice" or only.allow_multiple:
        raise HTTPException(
            status_code=400,
            detail="Una serie agenda requiere exactamente una pregunta de opción única.",
        )


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
        # Escala legacy por extremos: sin esta regla una serie con min >= max generaría
        # cada mes una encuesta imposible de votar.
        if q.type == "scale" and q.scale_points is None:
            _validate_legacy_scale(q)


@router.get("", summary="[ADMIN] Lista series de encuestas")
async def admin_list_series(admin: dict = Depends(require_admin_role)):
    supabase = get_async_supabase_client()
    result = await supabase.table("poll_series").select("*").order("created_at", desc=True).execute()
    return {"items": result.data, "total": len(result.data)}


@router.post("", summary="[ADMIN] Crear serie de encuestas", status_code=201)
async def admin_create_series(body: SeriesCreateIn, admin: dict = Depends(require_admin_role)):
    _validate_questions(body.questions)
    if body.kind == "agenda":
        _validate_agenda_template(body.questions)
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
        "cadence": body.cadence,
        "kind": body.kind,
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
        details={"slug": slug, "title": body.title, "cadence": body.cadence, "kind": body.kind, "questions": len(body.questions)},
    )
    return {"series": series}


@router.patch("/{series_id}", summary="[ADMIN] Editar o pausar una serie")
async def admin_update_series(
    series_id: str,
    body: SeriesUpdateIn,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    existing = await supabase.table("poll_series").select("*").eq("id", series_id).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Serie no encontrada.")
    current = existing.data[0]

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


@router.post("/publish-due", summary="[PIPELINE] Publicar la edición en curso de cada serie activa")
async def publish_due(pipeline: dict = Depends(require_pipeline_key)):
    """Disparado por el cron. No recibe parámetros: publica la edición en curso (mes o
    semana según la cadencia de cada serie, hora de Chile) y es idempotente."""
    supabase = get_async_supabase_client()
    summary = await publish_due_series(supabase, actor_id=pipeline["user_id"])
    if summary["failed"] or summary["audit_failed"] or summary["snapshot_failed"]:
        logger.error(
            f"publish-due: failed={summary['failed']} audit_failed={summary['audit_failed']} "
            f"snapshot_failed={summary['snapshot_failed']}"
        )
        # 5xx para que el job de GitHub Actions (curl --fail) falle y avise;
        # el resumen va en el cuerpo y el reintento diario es idempotente.
        return JSONResponse(status_code=500, content=summary)
    return summary
