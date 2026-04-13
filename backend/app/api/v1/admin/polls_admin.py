"""
BEACON PROTOCOL — Polls Admin CRUD
====================================
CRUD de encuestas para administradores.
Schema real: tabla `polls` con `questions` JSONB y `poll_votes`.

Endpoints:
  GET    /admin/polls              → Lista todas las encuestas
  POST   /admin/polls              → Crear encuesta (schema UI admin)
  POST   /admin/polls/ingest       → Ingestar encuesta desde pipeline de agentes (schema AGENTE_05)
  PATCH  /admin/polls/{id}         → Editar encuesta
  DELETE /admin/polls/{id}         → Eliminar encuesta
  POST   /admin/polls/upload-image → Subir imagen cabecera al bucket 'encuestas'
"""

import hmac
import logging
import uuid

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Any

from app.core.database import get_async_supabase_client
from app.core.config import settings
from app.core.audit_logger import audit_bus
from app.api.v1.admin.require_admin import require_admin_role

logger = logging.getLogger("beacon.polls_admin")

router = APIRouter(prefix="/admin/polls", tags=["Admin — Polls"])

POLLS_BUCKET = "encuestas"  # bucket público para imágenes de encuestas
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB

VALID_CATEGORIES = {
    "general", "politica", "economia", "salud",
    "educacion", "espectaculos", "deporte", "cultura",
    "seguridad", "justicia",
}


# ── Schemas ────────────────────────────────────────────

class QuestionDef(BaseModel):
    """Definición de una pregunta dentro del JSONB questions[]."""
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    text: str = Field(..., min_length=1, max_length=500)
    type: str = Field(..., pattern="^(multiple_choice|scale)$")
    options: Optional[List[str]] = None   # solo multiple_choice
    allow_multiple: bool = False          # True = checkboxes, False = radio (solo multiple_choice)
    # Escala por puntos (frontend admin)
    scale_points: Optional[int] = Field(None, ge=2, le=10)
    scale_labels: Optional[List[str]] = None  # etiqueta por cada punto (len == scale_points)
    # Escala por extremos (legacy / retrocompat)
    scale_min: Optional[int] = Field(None, ge=1, le=9)
    scale_max: Optional[int] = Field(None, ge=2, le=10)
    scale_min_label: Optional[str] = Field(None, max_length=80)
    scale_max_label: Optional[str] = Field(None, max_length=80)
    order_index: int = 0


VALID_STATUSES = {"draft", "active", "paused", "closed"}


class PollCreateIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    slug: Optional[str] = Field(None, min_length=2, max_length=120, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: Optional[str] = None
    context: Optional[str] = None          # texto contextual visible en la página pública
    source_url: Optional[str] = None       # fuente de origen
    tags: Optional[List[str]] = []
    header_image: Optional[str] = None
    starts_at: str                          # ISO 8601
    ends_at: str                            # ISO 8601
    status: str = "draft"                   # draft | active | paused | closed
    is_featured: bool = False               # aparece en hero del home
    questions: List[QuestionDef] = Field(..., min_length=1)
    category: str = "general"
    requires_auth: bool = True
    access_code: Optional[str] = Field(None, min_length=4, max_length=20)


class PollUpdateIn(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    slug: Optional[str] = Field(None, min_length=2, max_length=120, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: Optional[str] = None
    context: Optional[str] = None
    source_url: Optional[str] = None
    tags: Optional[List[str]] = None
    header_image: Optional[str] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    status: Optional[str] = None           # draft | active | paused | closed
    is_featured: Optional[bool] = None
    questions: Optional[List[QuestionDef]] = None
    category: Optional[str] = None
    requires_auth: Optional[bool] = None
    access_code: Optional[str] = Field(None, min_length=4, max_length=20)


# ── Schema pipeline de agentes ─────────────────────────

class AgentQuestionIn(BaseModel):
    """Pregunta en el formato que genera AGENTE_05 (PUBLISHER)."""
    text: str = Field(..., min_length=1, max_length=500)
    question_type: str = Field(..., pattern="^(single_choice|multiple_choice|scale)$")
    options: Optional[List[str]] = None
    scale_points: Optional[int] = Field(None, ge=2, le=10)
    scale_labels: Optional[List[str]] = None
    order_index: int = 0


class AgentPollMetadata(BaseModel):
    """Metadatos de trazabilidad generados por el pipeline (audit trail)."""
    idea_id: Optional[str] = None
    confidence_score: Optional[float] = None
    variante_generator: Optional[str] = None
    sources: Optional[List[str]] = None
    curated_by: Optional[str] = None
    verified_by: Optional[str] = None
    generated_by: Optional[str] = None
    approved_at_checkpoint_2: Optional[str] = None
    overlord_selection: Optional[str] = None
    publish_schedule: Optional[str] = None
    created_timestamp: Optional[str] = None

    model_config = {"extra": "allow"}  # tolerar campos futuros del pipeline


class AgentPollIn(BaseModel):
    """
    Payload generado por AGENTE_05 (PUBLISHER) del pipeline BEACON.
    El endpoint /ingest transforma este schema al formato interno QuestionDef.
    """
    title: str = Field(..., min_length=1, max_length=300)
    context: Optional[str] = None
    category: str = "general"
    duration_days: int = Field(default=7, ge=1, le=365)
    tags: Optional[List[str]] = []
    is_active: bool = True
    header_image_query: Optional[str] = None   # solo para referencia; imagen se sube manualmente
    questions: List[AgentQuestionIn] = Field(..., min_length=1)
    metadata: Optional[AgentPollMetadata] = None


def _agent_question_to_def(q: AgentQuestionIn) -> QuestionDef:
    """Transforma una pregunta del schema de agente al schema interno QuestionDef."""
    if q.question_type == "scale":
        return QuestionDef(
            text=q.text,
            type="scale",
            scale_points=q.scale_points,
            scale_labels=q.scale_labels,
            order_index=q.order_index,
        )
    return QuestionDef(
        text=q.text,
        type="multiple_choice",
        allow_multiple=(q.question_type == "multiple_choice"),
        options=q.options or [],
        order_index=q.order_index,
    )


# ── Auth pipeline de agentes ───────────────────────────

async def require_pipeline_key(request: Request) -> dict:
    """
    Autentica llamadas del pipeline de agentes usando PIPELINE_API_KEY.
    No requiere JWT de usuario — el pipeline se autentica con su propia key.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Pipeline API key requerida")

    token = auth_header.replace("Bearer ", "")
    expected = settings.PIPELINE_API_KEY

    if not expected:
        raise HTTPException(
            status_code=503,
            detail="PIPELINE_API_KEY no configurada en el backend",
        )

    if not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Pipeline API key inválida")

    return {"actor": "agent_pipeline", "user_id": "SYSTEM_PIPELINE"}


# ── Ingest desde pipeline de agentes ───────────────────

@router.post("/ingest", summary="Ingestar encuesta desde pipeline de agentes", status_code=201)
async def admin_ingest_poll(
    body: AgentPollIn,
    pipeline: dict = Depends(require_pipeline_key),
):
    """
    Endpoint para el pipeline automático de agentes (AGENTE_05 / PUBLISHER).
    Se autentica con PIPELINE_API_KEY — no requiere JWT de usuario.

    Diferencias con POST /admin/polls:
    - Auth: PIPELINE_API_KEY en vez de JWT admin
    - `question_type` en lugar de `type` (single_choice|multiple_choice|scale)
    - `duration_days` en lugar de `starts_at`/`ends_at`
    - `is_active` en lugar de `status`
    - `metadata` con audit trail del pipeline (se guarda en audit_log, no en polls)
    """
    from datetime import datetime, timedelta, timezone

    # Transformar preguntas al schema interno
    questions = [_agent_question_to_def(q) for q in body.questions]

    # Calcular fechas desde duration_days
    now = datetime.now(timezone.utc)
    starts_at = now.isoformat()
    ends_at = (now + timedelta(days=body.duration_days)).isoformat()

    # Normalizar categoría
    category = body.category if body.category in VALID_CATEGORIES else "general"
    if category != body.category:
        logger.warning(f"ingest: categoría '{body.category}' no válida → 'general' | poll='{body.title}'")

    status = "active" if body.is_active else "draft"

    # Construir payload interno y crear directamente (sin delegar a admin_create_poll
    # que requiere admin auth)
    for q in questions:
        if q.type == "multiple_choice" and (not q.options or len(q.options) < 2):
            raise HTTPException(
                status_code=400,
                detail=f"Pregunta '{q.text}' requiere al menos 2 opciones.",
            )
        if q.type == "scale":
            if q.scale_points is not None:
                if not (2 <= q.scale_points <= 10):
                    raise HTTPException(status_code=400, detail=f"Pregunta '{q.text}': scale_points debe ser entre 2 y 10.")
                if q.scale_labels and len(q.scale_labels) != q.scale_points:
                    raise HTTPException(status_code=400, detail=f"Pregunta '{q.text}': scale_labels debe tener {q.scale_points} etiquetas.")

    supabase = get_async_supabase_client()

    # Generar slug
    slug = _generate_slug(body.title)
    existing_slug = await (
        supabase.table("polls")
        .select("id")
        .ilike("slug", slug)
        .maybe_single()
        .execute()
    )
    if existing_slug.data:
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    questions_json = [q.model_dump() for q in questions]

    payload = {
        "title":        body.title,
        "slug":         slug,
        "description":  None,
        "context":      body.context,
        "tags":         body.tags or [],
        "header_image": None,
        "starts_at":    starts_at,
        "ends_at":      ends_at,
        "status":       status,
        "is_active":    status == "active",
        "is_featured":  False,
        "created_by":   "SYSTEM_PIPELINE",
        "questions":    questions_json,
        "category":     category,
        "requires_auth": True,
        "poll_type":    questions[0].type,
        "options":      questions[0].options if questions[0].type == "multiple_choice" else None,
        "scale_min":    questions[0].scale_min or 1,
        "scale_max":    questions[0].scale_max or (questions[0].scale_points or 5),
    }

    result = await supabase.table("polls").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creando encuesta.")

    poll = result.data[0]

    # Audit trail del pipeline
    metadata_details: dict = {}
    if body.metadata:
        metadata_details = body.metadata.model_dump()
    await audit_bus.alog_event(
        actor_id="SYSTEM_PIPELINE",
        action="AGENT_PIPELINE_INGEST_POLL",
        entity_type="POLL",
        entity_id=poll["id"],
        details={
            "title": body.title,
            "category": category,
            "questions": len(questions),
            "duration_days": body.duration_days,
            "pipeline_metadata": metadata_details,
        },
    )

    logger.info(f"ingest: poll creada vía pipeline | id={poll['id']} | title='{body.title}'")
    return {"poll": poll, "ingested_from": "agent_pipeline"}


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


def _generate_slug(title: str) -> str:
    """Genera slug URL-safe desde el título. Ej: '¿Aprueba al Presidente?' → 'aprueba-al-presidente'"""
    import re
    import unicodedata
    # Normalizar y eliminar tildes
    nfkd = unicodedata.normalize("NFKD", title.lower())
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    # Reemplazar caracteres no-alfanuméricos por guión
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_str).strip("-")
    return slug[:100]  # máximo 100 chars


@router.post("", summary="[ADMIN] Crear encuesta", status_code=201)
async def admin_create_poll(
    body: PollCreateIn,
    admin: dict = Depends(require_admin_role),
):
    # Validar categoría y status
    category = body.category if body.category in VALID_CATEGORIES else "general"
    status   = body.status if body.status in VALID_STATUSES else "draft"

    # Validar preguntas
    for q in body.questions:
        if q.type == "multiple_choice" and (not q.options or len(q.options) < 2):
            raise HTTPException(
                status_code=400,
                detail=f"Pregunta '{q.text}' requiere al menos 2 opciones.",
            )
        if q.type == "scale":
            if q.scale_points is not None:
                if not (2 <= q.scale_points <= 10):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Pregunta '{q.text}': scale_points debe ser entre 2 y 10.",
                    )
                if q.scale_labels and len(q.scale_labels) != q.scale_points:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Pregunta '{q.text}': scale_labels debe tener exactamente {q.scale_points} etiquetas.",
                    )
            else:
                mn = q.scale_min or 1
                mx = q.scale_max or 5
                if mn >= mx:
                    raise HTTPException(
                        status_code=400,
                        detail=f"scale_min ({mn}) debe ser menor que scale_max ({mx}).",
                    )

    supabase = get_async_supabase_client()

    # Slug: usar el provisto o generarlo desde el título
    slug_base = body.slug or _generate_slug(body.title)

    # Garantizar unicidad añadiendo sufijo si hay colisión
    slug = slug_base
    for attempt in range(10):
        existing_slug = await (
            supabase.table("polls")
            .select("id")
            .ilike("slug", slug)
            .maybe_single()
            .execute()
        )
        if not existing_slug.data:
            break
        slug = f"{slug_base}-{attempt + 2}"
    else:
        slug = f"{slug_base}-{uuid.uuid4().hex[:6]}"

    questions_json = [q.model_dump() for q in body.questions]

    payload = {
        "title":        body.title,
        "slug":         slug,
        "description":  body.description,
        "context":      body.context,
        "source_url":   body.source_url,
        "tags":         body.tags or [],
        "header_image": body.header_image,
        "starts_at":    body.starts_at,
        "ends_at":      body.ends_at,
        "status":       status,
        "is_active":    status == "active",   # retrocompatibilidad
        "is_featured":  body.is_featured,
        "created_by":   admin["user_id"],
        "questions":    questions_json,
        "category":     category,
        "requires_auth": body.requires_auth,
        "access_code":  body.access_code or None,
        # poll_type refleja el tipo de la primera pregunta (retrocompat.)
        "poll_type":    body.questions[0].type,
        "options":      body.questions[0].options if body.questions[0].type == "multiple_choice" else None,
        "scale_min":    body.questions[0].scale_min or 1,
        "scale_max":    body.questions[0].scale_max or (body.questions[0].scale_points or 5),
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

    # ─── Hook C: Notificación al admin (fire-and-forget) ───
    try:
        import asyncio
        from app.core.notification_service import send_admin_notification
        asyncio.ensure_future(send_admin_notification(
            event_type="POLL_CREATED",
            subject="Nueva encuesta creada",
            message=f"Se creó la encuesta '{body.title}'.",
            entity_id=poll["id"],
            details={
                "title": body.title,
                "category": category,
                "questions": len(body.questions),
                "admin": admin["email"],
            },
        ))
    except Exception:
        pass  # Notificación nunca bloquea la creación

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
    if body.title is not None:
        patch["title"] = body.title
    if body.slug is not None:
        patch["slug"] = body.slug
    if body.description is not None:
        patch["description"] = body.description
    if body.context is not None:
        patch["context"] = body.context
    if body.source_url is not None:
        patch["source_url"] = body.source_url
    if body.tags is not None:
        patch["tags"] = body.tags
    if body.header_image is not None:
        patch["header_image"] = body.header_image
    if body.starts_at is not None:
        patch["starts_at"] = body.starts_at
    if body.ends_at is not None:
        patch["ends_at"] = body.ends_at
    if body.status is not None:
        new_status = body.status if body.status in VALID_STATUSES else "draft"
        patch["status"]    = new_status
        patch["is_active"] = new_status == "active"   # mantener retrocompat.
    if body.is_featured is not None:
        patch["is_featured"] = body.is_featured
    if body.requires_auth is not None:
        patch["requires_auth"] = body.requires_auth
    if body.access_code is not None:
        patch["access_code"] = body.access_code or None
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
