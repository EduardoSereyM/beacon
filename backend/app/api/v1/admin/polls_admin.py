"""
BEACON PROTOCOL — Polls Admin CRUD
====================================
Endpoints para gestión de encuestas por administradores.
Incluye: crear/editar/eliminar polls, preguntas y upload de imagen de cabecera.

Endpoints:
  GET    /admin/polls              → Lista todas las encuestas
  POST   /admin/polls              → Crear encuesta con preguntas
  PATCH  /admin/polls/{id}         → Editar encuesta
  DELETE /admin/polls/{id}         → Eliminar encuesta (cascade)
  POST   /admin/polls/upload-image → Subir imagen de cabecera al bucket 'encuestas'
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List
import uuid

from app.core.database import get_async_supabase_client
from app.core.audit_logger import audit_bus
from app.api.v1.admin.require_admin import require_admin_role

router = APIRouter(prefix="/admin/polls", tags=["Admin — Polls"])

POLLS_BUCKET = "encuestas"
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB


# ── Schemas ────────────────────────────────────────────────────

class PollQuestionIn(BaseModel):
    question_text: str = Field(..., min_length=1, max_length=500)
    question_type: str = Field(..., pattern="^(multiple_choice|numeric_scale)$")
    options: Optional[List[str]] = None          # Solo para multiple_choice
    scale_min: Optional[int] = Field(1, ge=1, le=10)
    scale_max: Optional[int] = Field(10, ge=2, le=10)
    order_index: int = 0


class PollCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    start_at: Optional[str] = None   # ISO 8601
    end_at: Optional[str] = None     # ISO 8601
    is_active: bool = True
    questions: List[PollQuestionIn] = Field(..., min_length=1)


class PollUpdateIn(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    is_active: Optional[bool] = None


# ── Endpoints ──────────────────────────────────────────────────

@router.post("/upload-image", summary="[ADMIN] Subir imagen de cabecera de encuesta")
async def admin_upload_poll_image(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin_role),
):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo no permitido: {file.content_type}. Use JPEG, PNG o WEBP.",
        )
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Archivo demasiado grande ({len(contents) // 1024} KB). Máximo 5 MB.",
        )

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    filename = f"covers/{uuid.uuid4().hex}.{ext}"

    supabase = get_async_supabase_client()
    try:
        await supabase.storage.from_(POLLS_BUCKET).upload(
            path=filename,
            file=contents,
            file_options={"content-type": file.content_type, "upsert": "false"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error subiendo imagen: {e}")

    public_url = supabase.storage.from_(POLLS_BUCKET).get_public_url(filename)
    return {"url": public_url, "path": filename}


@router.get("", summary="[ADMIN] Lista todas las encuestas")
async def admin_list_polls(admin: dict = Depends(require_admin_role)):
    supabase = get_async_supabase_client()
    result = await (
        supabase.table("polls")
        .select("*, poll_questions(*)")
        .order("created_at", desc=True)
        .execute()
    )
    return {"polls": result.data, "total": len(result.data)}


@router.post("", summary="[ADMIN] Crear encuesta con preguntas", status_code=201)
async def admin_create_poll(
    body: PollCreateIn,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()

    # Validar preguntas
    for q in body.questions:
        if q.question_type == "multiple_choice":
            if not q.options or len(q.options) < 2:
                raise HTTPException(
                    status_code=400,
                    detail=f"La pregunta '{q.question_text}' de opción múltiple requiere al menos 2 opciones.",
                )
        if q.question_type == "numeric_scale" and q.scale_min >= q.scale_max:
            raise HTTPException(
                status_code=400,
                detail=f"scale_min ({q.scale_min}) debe ser menor que scale_max ({q.scale_max}).",
            )

    # Crear poll
    poll_payload = {
        "title": body.title,
        "description": body.description,
        "cover_image_url": body.cover_image_url,
        "start_at": body.start_at,
        "end_at": body.end_at,
        "is_active": body.is_active,
        "created_by": admin["user_id"],
    }
    poll_res = await supabase.table("polls").insert(poll_payload).execute()
    if not poll_res.data:
        raise HTTPException(status_code=500, detail="Error creando encuesta.")

    poll = poll_res.data[0]
    poll_id = poll["id"]

    # Crear preguntas
    questions_payload = [
        {
            "poll_id": poll_id,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "options": q.options,
            "scale_min": q.scale_min,
            "scale_max": q.scale_max,
            "order_index": q.order_index,
        }
        for q in body.questions
    ]
    q_res = await supabase.table("poll_questions").insert(questions_payload).execute()

    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_CREATE_POLL",
        entity_type="POLL",
        entity_id=poll_id,
        details={"title": body.title, "questions": len(body.questions)},
    )

    return {"poll": poll, "questions": q_res.data}


@router.patch("/{poll_id}", summary="[ADMIN] Editar encuesta")
async def admin_update_poll(
    poll_id: str,
    body: PollUpdateIn,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()

    # Verificar existencia
    existing = await supabase.table("polls").select("id, title").eq("id", poll_id).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada.")

    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar.")

    result = await supabase.table("polls").update(patch).eq("id", poll_id).execute()

    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_UPDATE_POLL",
        entity_type="POLL",
        entity_id=poll_id,
        details={"changes": patch, "old_title": existing.data["title"]},
    )

    return {"poll": result.data[0] if result.data else None}


@router.delete("/{poll_id}", summary="[ADMIN] Eliminar encuesta")
async def admin_delete_poll(
    poll_id: str,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()

    existing = await supabase.table("polls").select("id, title").eq("id", poll_id).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada.")

    await supabase.table("polls").delete().eq("id", poll_id).execute()

    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_DELETE_POLL",
        entity_type="POLL",
        entity_id=poll_id,
        details={"title": existing.data["title"]},
    )

    return {"ok": True, "deleted_id": poll_id}
