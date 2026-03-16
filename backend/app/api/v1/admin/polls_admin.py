"""
BEACON PROTOCOL — Admin Polls (CRUD)
======================================
POST   /admin/polls               → crear encuesta con multi-pregunta
GET    /admin/polls               → listar todas
PATCH  /admin/polls/{id}          → editar
DELETE /admin/polls/{id}          → desactivar (soft)
POST   /admin/polls/upload-image  → subir imagen de cabecera al Storage
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
import uuid
import logging

from app.core.database import get_async_supabase_client
from app.api.v1.admin.require_admin import require_admin_role

logger = logging.getLogger("beacon.admin.polls")
router = APIRouter()

STORAGE_BUCKET = "imagenes"
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PollQuestion(BaseModel):
    text: str
    type: str                          # "multiple_choice" | "scale"
    options: Optional[List[str]] = None  # solo multiple_choice
    scale_points: Optional[int] = None   # solo scale (2-10)


class PollCreate(BaseModel):
    title: str
    description: Optional[str] = None
    header_image: Optional[str] = None
    questions: List[PollQuestion]
    starts_at: str   # ISO 8601
    ends_at: str     # ISO 8601


class PollUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    header_image: Optional[str] = None
    questions: Optional[List[PollQuestion]] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    is_active: Optional[bool] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _validate_questions(questions: List[PollQuestion]) -> None:
    if not questions:
        raise HTTPException(status_code=400, detail="Se requiere al menos una pregunta")
    for i, q in enumerate(questions, 1):
        if not q.text.strip():
            raise HTTPException(status_code=400, detail=f"Pregunta {i}: el texto es obligatorio")
        if q.type not in ("multiple_choice", "scale"):
            raise HTTPException(status_code=400, detail=f"Pregunta {i}: tipo inválido '{q.type}'")
        if q.type == "multiple_choice":
            valid_opts = [o for o in (q.options or []) if o.strip()]
            if len(valid_opts) < 2:
                raise HTTPException(status_code=400, detail=f"Pregunta {i}: se requieren al menos 2 opciones")
        if q.type == "scale":
            pts = q.scale_points
            if pts is None or not (2 <= pts <= 10):
                raise HTTPException(status_code=400, detail=f"Pregunta {i}: scale_points debe estar entre 2 y 10")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/admin/polls/upload-image", summary="Subir imagen de cabecera de encuesta")
async def upload_poll_image(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin_role),
):
    """Sube una imagen al bucket y devuelve la URL pública para usar como header_image."""
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo no permitido: {file.content_type}. Use JPEG, PNG o WEBP.",
        )
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"Archivo demasiado grande. Máximo 5 MB.")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    filename = f"polls/{uuid.uuid4().hex}.{ext}"

    supabase = get_async_supabase_client()
    try:
        await supabase.storage.from_(STORAGE_BUCKET).upload(
            path=filename,
            file=contents,
            file_options={"content-type": file.content_type, "upsert": "false"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error subiendo imagen: {e}")

    public_url = await supabase.storage.from_(STORAGE_BUCKET).get_public_url(filename)
    logger.info(f"Poll image uploaded | path={filename} | admin={admin['user_id']}")
    return {"url": public_url, "path": filename}


@router.post("/admin/polls", summary="Crear encuesta")
async def create_poll(
    body: PollCreate,
    admin: dict = Depends(require_admin_role),
):
    _validate_questions(body.questions)

    questions_payload = [q.model_dump() for q in body.questions]

    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("polls")
            .insert({
                "title": body.title,
                "description": body.description,
                "header_image": body.header_image,
                "questions": questions_payload,
                "starts_at": body.starts_at,
                "ends_at": body.ends_at,
                "created_by": admin["user_id"],
            })
            .execute()
        )
    except Exception as e:
        logger.error(f"Error creando poll: {e}")
        raise HTTPException(status_code=503, detail="Error al crear encuesta")

    logger.info(f"Poll creada | id={res.data[0]['id']} | admin={admin['user_id']}")
    return res.data[0]


@router.get("/admin/polls", summary="Listar todas las encuestas")
async def list_polls_admin(
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("polls")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    items = res.data or []

    for p in items:
        try:
            vote_res = await (
                supabase.table("poll_votes")
                .select("id", count="exact")
                .eq("poll_id", p["id"])
                .execute()
            )
            p["total_votes"] = vote_res.count or 0
        except Exception:
            p["total_votes"] = 0

    return {"items": items, "total": len(items)}


@router.patch("/admin/polls/{poll_id}", summary="Editar encuesta")
async def update_poll(
    poll_id: str,
    body: PollUpdate,
    admin: dict = Depends(require_admin_role),
):
    if body.questions is not None:
        _validate_questions(body.questions)

    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.questions is not None:
        patch["questions"] = [q.model_dump() for q in body.questions]
    if not patch:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("polls")
            .update(patch)
            .eq("id", poll_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    if not res.data:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")

    return res.data[0]


@router.delete("/admin/polls/{poll_id}", summary="Desactivar encuesta")
async def delete_poll(
    poll_id: str,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    try:
        await (
            supabase.table("polls")
            .update({"is_active": False})
            .eq("id", poll_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error: {e}")

    return {"success": True, "poll_id": poll_id}
