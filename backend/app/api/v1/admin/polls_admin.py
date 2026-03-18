"""
BEACON PROTOCOL — Polls Admin CRUD
====================================
CRUD de encuestas para administradores.
Schema real: tabla `polls` con `questions` JSONB y `poll_votes`.

Endpoints:
  GET    /admin/polls              → Lista todas las encuestas
  POST   /admin/polls              → Crear encuesta
  PATCH  /admin/polls/{id}         → Editar encuesta
  DELETE /admin/polls/{id}         → Eliminar encuesta
  POST   /admin/polls/upload-image → Subir imagen cabecera al bucket 'encuestas'
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Any

logger = logging.getLogger("beacon.polls_admin")

from app.core.database import get_async_supabase_client
from app.core.config import settings
from app.core.audit_logger import audit_bus
from app.api.v1.admin.require_admin import require_admin_role

router = APIRouter(prefix="/admin/polls", tags=["Admin — Polls"])

POLLS_BUCKET = "encuestas"  # bucket público para imágenes de encuestas
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB

VALID_CATEGORIES = {
    "general", "politica", "economia", "salud",
    "educacion", "espectaculos", "deporte", "cultura",
}


# ── Schemas ────────────────────────────────────────────

class QuestionDef(BaseModel):
    """Definición de una pregunta dentro del JSONB questions[]."""
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    text: str = Field(..., min_length=1, max_length=500)
    type: str = Field(..., pattern="^(multiple_choice|scale)$")
    options: Optional[List[str]] = None   # solo multiple_choice
    scale_min: Optional[int] = Field(None, ge=1, le=9)
    scale_max: Optional[int] = Field(None, ge=2, le=10)
    order_index: int = 0


class PollCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = None
    header_image: Optional[str] = None
    starts_at: str          # ISO 8601
    ends_at: str            # ISO 8601
    is_active: bool = True
    questions: List[QuestionDef] = Field(..., min_length=1)
    category: str = "general"
    requires_auth: bool = True
    access_code: Optional[str] = Field(None, min_length=4, max_length=20)


class PollUpdateIn(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    description: Optional[str] = None
    header_image: Optional[str] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    is_active: Optional[bool] = None
    questions: Optional[List[QuestionDef]] = None
    category: Optional[str] = None
    requires_auth: Optional[bool] = None
    access_code: Optional[str] = Field(None, min_length=4, max_length=20)


# ── Upload imagen ──────────────────────────────────────

@router.post("/upload-image", summary="[ADMIN] Subir imagen de cabecera")
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
        logger.error(f"Storage upload error | bucket={POLLS_BUCKET} | path={filename} | err={e}")
        raise HTTPException(status_code=500, detail=f"Error subiendo imagen: {e}")

    # Construir URL pública directamente (evita ambigüedad async en supabase-py v2)
    public_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/{POLLS_BUCKET}/{filename}"
    return {"url": public_url, "path": filename}


# ── CRUD ───────────────────────────────────────────────

@router.get("", summary="[ADMIN] Lista todas las encuestas")
async def admin_list_polls(admin: dict = Depends(require_admin_role)):
    supabase = get_async_supabase_client()
    result = await (
        supabase.table("polls")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return {"items": result.data, "total": len(result.data)}


@router.post("", summary="[ADMIN] Crear encuesta", status_code=201)
async def admin_create_poll(
    body: PollCreateIn,
    admin: dict = Depends(require_admin_role),
):
    # Validar categoría
    category = body.category if body.category in VALID_CATEGORIES else "general"

    # Validar preguntas
    for q in body.questions:
        if q.type == "multiple_choice" and (not q.options or len(q.options) < 2):
            raise HTTPException(
                status_code=400,
                detail=f"Pregunta '{q.text}' requiere al menos 2 opciones.",
            )
        if q.type == "scale":
            mn = q.scale_min or 1
            mx = q.scale_max or 5
            if mn >= mx:
                raise HTTPException(
                    status_code=400,
                    detail=f"scale_min ({mn}) debe ser menor que scale_max ({mx}).",
                )

    supabase = get_async_supabase_client()

    questions_json = [q.model_dump() for q in body.questions]

    payload = {
        "title": body.title,
        "description": body.description,
        "header_image": body.header_image,
        "starts_at": body.starts_at,
        "ends_at": body.ends_at,
        "is_active": body.is_active,
        "created_by": admin["user_id"],
        "questions": questions_json,
        "category": category,
        "requires_auth": body.requires_auth,
        "access_code": body.access_code or None,
        # poll_type refleja el tipo de la primera pregunta (retrocompat.)
        "poll_type": body.questions[0].type,
        "options": body.questions[0].options if body.questions[0].type == "multiple_choice" else None,
        "scale_min": body.questions[0].scale_min or 1,
        "scale_max": body.questions[0].scale_max or 5,
    }

    result = await supabase.table("polls").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creando encuesta.")

    poll = result.data[0]

    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_CREATE_POLL",
        entity_type="POLL",
        entity_id=poll["id"],
        details={"title": body.title, "questions": len(body.questions), "category": category},
    )

    return {"poll": poll}


@router.patch("/{poll_id}", summary="[ADMIN] Editar encuesta")
async def admin_update_poll(
    poll_id: str,
    body: PollUpdateIn,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()

    existing = await (
        supabase.table("polls")
        .select("id, title")
        .eq("id", poll_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada.")

    patch: dict[str, Any] = {}
    if body.title is not None:           patch["title"] = body.title
    if body.description is not None:     patch["description"] = body.description
    if body.header_image is not None:    patch["header_image"] = body.header_image
    if body.starts_at is not None:       patch["starts_at"] = body.starts_at
    if body.ends_at is not None:         patch["ends_at"] = body.ends_at
    if body.is_active is not None:       patch["is_active"] = body.is_active
    if body.requires_auth is not None:   patch["requires_auth"] = body.requires_auth
    if body.access_code is not None:     patch["access_code"] = body.access_code or None
    if body.category is not None:
        patch["category"] = body.category if body.category in VALID_CATEGORIES else "general"
    if body.questions is not None:
        patch["questions"] = [q.model_dump() for q in body.questions]

    if not patch:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar.")

    result = await supabase.table("polls").update(patch).eq("id", poll_id).execute()

    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_UPDATE_POLL",
        entity_type="POLL",
        entity_id=poll_id,
        details={"changes": list(patch.keys()), "old_title": existing.data["title"]},
    )

    return {"poll": result.data[0] if result.data else None}


@router.delete("/{poll_id}", summary="[ADMIN] Eliminar encuesta")
async def admin_delete_poll(
    poll_id: str,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()

    existing = await (
        supabase.table("polls")
        .select("id, title")
        .eq("id", poll_id)
        .maybe_single()
        .execute()
    )
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


# ── Analytics ──────────────────────────────────────────

@router.get("/analytics/voters", summary="[ADMIN] Votos por usuario en período")
async def admin_poll_voters_analytics(
    from_date: Optional[str] = Query(None, description="ISO 8601 — fecha inicio"),
    to_date: Optional[str] = Query(None, description="ISO 8601 — fecha fin"),
    admin: dict = Depends(require_admin_role),
):
    """
    Devuelve ranking de usuarios por cantidad de votos en encuestas,
    filtrable por período. Incluye email, rank y última actividad.
    """
    supabase = get_async_supabase_client()

    # 1. Traer votos (con filtro de fecha opcional)
    query = supabase.table("poll_votes").select("user_id, poll_id, created_at")
    if from_date:
        query = query.gte("created_at", from_date)
    if to_date:
        query = query.lte("created_at", to_date)
    votes_res = await query.order("created_at", desc=True).execute()
    votes = votes_res.data or []

    if not votes:
        return {"items": [], "total": 0, "period": {"from": from_date, "to": to_date}}

    # 2. Agregar por user_id
    from collections import defaultdict
    user_stats: dict[str, dict] = defaultdict(lambda: {"votes": 0, "polls": set(), "last_vote_at": None})
    for v in votes:
        uid = v.get("user_id")
        if not uid:
            continue
        user_stats[uid]["votes"] += 1
        user_stats[uid]["polls"].add(v["poll_id"])
        ts = v.get("created_at")
        if ts and (not user_stats[uid]["last_vote_at"] or ts > user_stats[uid]["last_vote_at"]):
            user_stats[uid]["last_vote_at"] = ts

    if not user_stats:
        return {"items": [], "total": 0, "period": {"from": from_date, "to": to_date}}

    # 3. Traer datos de usuarios
    user_ids = list(user_stats.keys())
    users_res = await (
        supabase.table("users")
        .select("id, email, first_name, last_name, rank, reputation_score")
        .in_("id", user_ids)
        .execute()
    )
    users_map = {u["id"]: u for u in (users_res.data or [])}

    # 4. Construir respuesta ordenada por votos DESC
    items = []
    for uid, stats in sorted(user_stats.items(), key=lambda x: -x[1]["votes"]):
        u = users_map.get(uid, {})
        items.append({
            "user_id": uid,
            "email": u.get("email", "—"),
            "first_name": u.get("first_name", ""),
            "last_name": u.get("last_name", ""),
            "rank": u.get("rank", "BASIC"),
            "reputation_score": u.get("reputation_score", 0.5),
            "votes_count": stats["votes"],
            "polls_count": len(stats["polls"]),
            "last_vote_at": stats["last_vote_at"],
        })

    return {"items": items, "total": len(items), "period": {"from": from_date, "to": to_date}}
