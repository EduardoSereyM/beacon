"""
BEACON PROTOCOL — Polls Router (Encuestas)
==========================================
Endpoints públicos para encuestas ciudadanas.

GET  /polls              → lista encuestas activas (filtros: category, search)
GET  /polls/my           → encuestas donde el usuario ya participó
GET  /polls/{id}         → detalle + resultados parciales
POST /polls              → crear encuesta (solo VERIFIED, máx 3 preguntas)
POST /polls/{id}/vote    → emitir voto (JWT requerido o anónimo si requires_auth=False)
"""

import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Any, Optional, List, Dict, Union
import logging

from app.core.database import get_async_supabase_client
from app.api.v1.user.auth import get_current_user
from app.api.v1.endpoints.realtime import publish_poll_pulse

logger = logging.getLogger("beacon.polls")
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class PollVotePayload(BaseModel):
    option_value: str  # opción elegida ("Sí", "No") o valor numérico en scale ("4")
    anon_session_id: Optional[str] = None  # UUID del browser, solo para encuestas sin auth
    access_code: Optional[str] = None      # código de encuesta privada


class UserQuestionIn(BaseModel):
    text: str
    type: str                         # "multiple_choice" | "scale" | "ranking"
    options: Optional[List[str]] = None
    scale_points: Optional[int] = None   # 2–10 (ciudadanos)
    allow_multiple: bool = False          # True = checkboxes, False = radio
    scale_min_label: Optional[str] = None # legado
    scale_max_label: Optional[str] = None # legado
    scale_labels: Optional[Any] = None    # List[str] o Dict[str,str] (protocolo BEACON)
    metadata: Optional[Dict[str, Any]] = None  # BEACON: campos anidados (options, scale_min, scale_max, scale_labels)


VALID_CATEGORIES = {
    "general", "politica", "economia", "salud", "educacion",
    "espectaculos", "deporte", "cultura", "seguridad", "ambiente",
}

# Mapa de tipos BEACON externos → tipos internos
_QUESTION_TYPE_MAP = {
    "likert_scale":    "scale",
    "multiple_choice": "multiple_choice",
    "ranking":         "ranking",
}


class ConfidenceMetadata(BaseModel):
    beacon_idea_id:   Optional[str] = None
    confidence_score: int = 0               # 0–100; debe ser ≥ 70 para pasar validación
    source_ids:       Optional[List[str]] = None
    verifier_notes:   Optional[str] = None
    # Campos extendidos del protocolo BEACON (preservados, no validados)
    generated_by:     Optional[str] = None
    variant_selected: Optional[str] = None
    integrity_hash:   Optional[str] = None


class AuditTrailEntry(BaseModel):
    agent:            str
    status:           str
    timestamp:        Optional[str] = None
    notes:            Optional[str] = None
    confidence_score: Optional[int] = None
    variant:          Optional[str] = None
    checkpoint:       Optional[int] = None


class AuditTrail(BaseModel):
    approval_chain:    List[AuditTrailEntry] = []
    # Campos extendidos del protocolo BEACON
    created_at:        Optional[str] = None
    published_by:      Optional[str] = None
    publication_reason: Optional[str] = None


class UserPollCreateIn(BaseModel):
    title: str
    description:      Optional[str] = None
    category:         str = "general"
    ends_in_days:     int = 7                  # 1–30 (ciudadanos). Ignorado si se proveen start_date/end_date
    start_date:       Optional[datetime] = None  # ISO8601 — protocolo BEACON
    end_date:         Optional[datetime] = None  # ISO8601 — protocolo BEACON
    questions:        List[UserQuestionIn]       # máx 4
    confidence_metadata: Optional[ConfidenceMetadata] = None
    audit_trail:         Optional[AuditTrail] = None
    internal_notes:      Optional[str] = None
    # Campos BEACON adicionales (mapeados internamente)
    requires_login:   Optional[bool] = None   # BEACON: False → requires_auth=True, True → requires_auth=False
    header_image_url: Optional[str] = None    # alias de header_image
    is_public:        Optional[bool] = None   # reservado (siempre público por ahora)


# ─── Helper: normalizar scale_labels ──────────────────────────────────────────

def _normalize_scale_labels(
    raw: Any,
    scale_min: int,
    scale_max: int,
) -> Optional[List[str]]:
    """
    Convierte scale_labels a List[str] indexado desde scale_min.
    Acepta:
      - List[str]       → devuelve tal cual si longitud == rango
      - Dict[str, str]  → {"2": "Mala", ..., "10": "Óptima"} → array
    """
    size = scale_max - scale_min + 1
    if raw is None:
        return None
    if isinstance(raw, dict):
        result = [""] * size
        for k, v in raw.items():
            idx = int(k) - scale_min
            if 0 <= idx < size:
                result[idx] = str(v).strip()
        return result
    if isinstance(raw, list):
        if len(raw) == size:
            return [str(l).strip() for l in raw]
        # longitud parcial (solo min/max, como en Ejemplo 2 ajuste) — expandir
        if len(raw) == 2:
            return [str(raw[0]).strip()] + [""] * (size - 2) + [str(raw[-1]).strip()]
    return None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_open(p: dict) -> bool:
    now = datetime.now(timezone.utc)
    try:
        start = datetime.fromisoformat(str(p["starts_at"]).replace("Z", "+00:00"))
        end   = datetime.fromisoformat(str(p["ends_at"]).replace("Z", "+00:00"))
        return start <= now <= end
    except Exception:
        return False


def _aggregate(poll: dict, votes: list) -> list:
    """
    Agrega votos en resultados para un subconjunto (todos o solo verificados).
    Soporta multiple_choice, scale y ranking.

    Convención de posiciones (RANKING):
      Todas las posiciones en los outputs de API son 1-based (1 = primer lugar).
      Borda internamente: option en posición p (1-based) recibe (n - p) puntos,
      donde n = número de opciones. Posición 1 → n-1 pts, posición n → 0 pts.

    Nota: polls creadas vía admin/pipeline no tienen poll_type ni options en el
    top-level; solo dentro de questions[0]. Se hace fallback a questions[0].
    """
    total = len(votes)
    # Fallback a questions[0] para polls creadas vía admin/pipeline
    first_q = (poll.get("questions") or [{}])[0]
    poll_type = poll.get("poll_type") or first_q.get("type", "multiple_choice")
    top_options = poll.get("options") or first_q.get("options") or []

    if poll_type == "multiple_choice":
        options = top_options
        counts = {opt: 0 for opt in options}
        for v in votes:
            raw = v.get("option_value", "")
            for sel in (s.strip() for s in raw.split("||") if s.strip()):
                if sel in counts:
                    counts[sel] += 1
        return [
            {"option": opt, "count": cnt, "pct": round(cnt / total * 100, 1) if total else 0}
            for opt, cnt in counts.items()
        ]

    if poll_type == "ranking":
        options = top_options
        n = len(options)
        borda:      dict = {opt: 0   for opt in options}
        pos_sum:    dict = {opt: 0.0 for opt in options}
        pos_count:  dict = {opt: 0   for opt in options}
        first_place: dict = {opt: 0  for opt in options}

        for v in votes:
            ranked = [s.strip() for s in v.get("option_value", "").split("||") if s.strip()]
            for pos_1based, opt in enumerate(ranked, start=1):  # pos_1based: 1 = primer lugar
                if opt in borda:
                    borda[opt]     += n - pos_1based          # Borda: n-p (1-based)
                    pos_sum[opt]   += pos_1based
                    pos_count[opt] += 1
                    if pos_1based == 1:
                        first_place[opt] += 1

        result = []
        for opt in options:
            cnt  = pos_count[opt]
            avg_pos = round(pos_sum[opt] / cnt, 2) if cnt else None
            fp_pct  = round(first_place[opt] / total * 100, 1) if total else 0
            result.append({
                "option":          opt,
                "borda_score":     borda[opt],
                "avg_position":    avg_pos,    # 1-based: 1.0 = siempre primero
                "first_place_pct": fp_pct,
                "count":           cnt,
            })
        # Ordenar por Borda descendente (mayor puntaje = más preferida)
        result.sort(key=lambda x: x["borda_score"], reverse=True)
        return result

    # scale
    values = []
    for v in votes:
        try:
            values.append(float(v["option_value"]))
        except (ValueError, TypeError):
            pass
    avg = round(sum(values) / len(values), 2) if values else 0
    return [{"average": avg, "count": len(values)}]


def _compute_results(poll: dict, votes: list) -> dict:
    """
    Agrega resultados totales Y verificados.

    Retorna:
      results          → todos los votos (comportamiento histórico)
      results_verified → solo votos de ciudadanos VERIFIED
      total_votes      → total de votos
      verified_votes   → votos de ciudadanos VERIFIED
      basic_votes      → votos de ciudadanos BASIC/ANONYMOUS
    """
    verified = [v for v in votes if v.get("voter_rank") == "VERIFIED"]
    basic    = [v for v in votes if v.get("voter_rank") != "VERIFIED"]

    return {
        **poll,
        "total_votes":      len(votes),
        "verified_votes":   len(verified),
        "basic_votes":      len(basic),
        "results":          _aggregate(poll, votes),
        "results_verified": _aggregate(poll, verified),
        "is_open":          _is_open(poll),
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

POLL_PUBLIC_FIELDS = "id, slug, title, description, context, header_image, starts_at, ends_at, questions, category, requires_auth, is_featured, tags, status"


@router.get("/polls/featured", summary="Encuesta destacada para el hero del home")
async def get_featured_poll():
    """
    Lógica mixta: primero busca una encuesta con is_featured=true y status='active'.
    Si no hay ninguna, devuelve la encuesta activa con más votos en las últimas 24h.
    """
    supabase = get_async_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Buscar featured manual
    try:
        featured_res = await (
            supabase.table("polls")
            .select(POLL_PUBLIC_FIELDS)
            .eq("status", "active")
            .eq("is_featured", True)
            .is_("access_code", "null")
            .lte("starts_at", now_iso)
            .gte("ends_at", now_iso)
            .limit(1)
            .execute()
        )
        if featured_res.data:
            poll = featured_res.data[0]
            vote_res = await (
                supabase.table("poll_votes")
                .select("option_value, voter_rank")
                .eq("poll_id", poll["id"])
                .execute()
            )
            return _compute_results(poll, vote_res.data or [])
    except Exception as e:
        logger.warning(f"Error buscando featured poll: {e}")

    # 2. Fallback: la más votada en las últimas 24h
    try:
        since_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        active_res = await (
            supabase.table("polls")
            .select(POLL_PUBLIC_FIELDS)
            .eq("status", "active")
            .is_("access_code", "null")
            .lte("starts_at", now_iso)
            .gte("ends_at", now_iso)
            .execute()
        )
        polls = active_res.data or []
        if not polls:
            return None

        # Contar votos recientes por poll
        best_poll = None
        best_count = -1
        for p in polls:
            vote_res = await (
                supabase.table("poll_votes")
                .select("id")
                .eq("poll_id", p["id"])
                .gte("created_at", since_24h)
                .execute()
            )
            count = len(vote_res.data or [])
            if count > best_count:
                best_count = count
                best_poll = p

        if best_poll:
            all_votes = await (
                supabase.table("poll_votes")
                .select("option_value, voter_rank")
                .eq("poll_id", best_poll["id"])
                .execute()
            )
            return _compute_results(best_poll, all_votes.data or [])
    except Exception as e:
        logger.error(f"Error en fallback featured poll: {e}")

    return None


@router.get("/polls", summary="Listar encuestas por status")
async def list_polls(
    category: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = "active",   # active | closed | draft | paused
    limit: Optional[int] = 50,
):
    supabase = get_async_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Validar status
    valid_statuses = {"active", "closed", "draft", "paused"}
    if status not in valid_statuses:
        status = "active"

    try:
        query = (
            supabase.table("polls")
            .select(POLL_PUBLIC_FIELDS)
            .eq("status", status)
            .is_("access_code", "null")
        )
        # Las activas se filtran por fecha; las cerradas no (ya pasó ends_at)
        if status == "active":
            query = query.lte("starts_at", now_iso).gte("ends_at", now_iso)

        if category:
            query = query.eq("category", category)
        if search:
            query = query.ilike("title", f"%{search}%")

        query = query.order("ends_at", desc=True).limit(limit)
        result = await query.execute()
    except Exception as e:
        logger.error(f"Error listando polls: {e}")
        raise HTTPException(status_code=503, detail="Error al obtener encuestas")

    items = result.data or []
    enriched = []
    for p in items:
        try:
            vote_res = await (
                supabase.table("poll_votes")
                .select("option_value, voter_rank")
                .eq("poll_id", p["id"])
                .execute()
            )
            enriched.append(_compute_results(p, vote_res.data or []))
        except Exception:
            enriched.append(_compute_results(p, []))

    # Ordenar por total_votes desc — las más participadas primero
    enriched.sort(key=lambda x: x.get("total_votes", 0), reverse=True)
    return {"items": enriched, "total": len(enriched)}


@router.get("/polls/my", summary="Encuestas donde el usuario ya participó (incluye privadas)")
async def my_polls(current_user: dict = Depends(get_current_user)):
    """Devuelve encuestas donde el usuario autenticado ya votó."""
    supabase = get_async_supabase_client()
    user_id = current_user["id"]

    # Obtener poll_ids donde votó este usuario
    votes_res = await (
        supabase.table("poll_votes")
        .select("poll_id")
        .eq("user_id", user_id)
        .execute()
    )
    poll_ids = list({v["poll_id"] for v in (votes_res.data or [])})
    if not poll_ids:
        return {"items": [], "total": 0}

    result = await (
        supabase.table("polls")
        .select("id, title, description, header_image, starts_at, ends_at, category, requires_auth, is_active, questions")
        .in_("id", poll_ids)
        .order("created_at", desc=True)
        .execute()
    )
    items = result.data or []
    enriched = []
    for p in items:
        try:
            vote_res = await (
                supabase.table("poll_votes").select("option_value, voter_rank").eq("poll_id", p["id"]).execute()
            )
            enriched.append(_compute_results(p, vote_res.data or []))
        except Exception:
            enriched.append(_compute_results(p, []))
    return {"items": enriched, "total": len(enriched)}


@router.post("/polls", summary="Crear encuesta (solo VERIFIED, máx 3 preguntas)")
async def create_user_poll(
    payload: UserPollCreateIn,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("rank") != "VERIFIED":
        raise HTTPException(status_code=403, detail="Solo usuarios VERIFIED pueden crear encuestas")
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="El título es obligatorio")
    if len(payload.questions) == 0:
        raise HTTPException(status_code=400, detail="Se requiere al menos 1 pregunta")
    if len(payload.questions) > 4:
        raise HTTPException(status_code=400, detail="Máximo 4 preguntas permitidas")
    if not 1 <= payload.ends_in_days <= 30:
        raise HTTPException(status_code=400, detail="La duración debe ser entre 1 y 30 días")

    # Normalizar categoría (acepta mayúsculas del protocolo BEACON)
    category = payload.category.lower()
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Categoría inválida: {payload.category}")

    # Validar umbral de confianza BEACON
    if payload.confidence_metadata is not None:
        if payload.confidence_metadata.confidence_score < 70:
            raise HTTPException(
                status_code=422,
                detail=f"confidence_score={payload.confidence_metadata.confidence_score} no alcanza el umbral BEACON (mínimo 70)",
            )

    # Validar cada pregunta
    questions_clean = []
    for i, q in enumerate(payload.questions):
        if not q.text.strip():
            raise HTTPException(status_code=400, detail=f"Pregunta {i+1}: texto obligatorio")

        # Normalizar tipo: acepta mayúsculas y alias del protocolo BEACON
        q_type = _QUESTION_TYPE_MAP.get(q.type.lower(), q.type.lower())
        if q_type != q.type:
            q = q.model_copy(update={"type": q_type})

        # Extraer campos anidados en metadata (formato BEACON)
        meta = q.metadata or {}
        opts_src    = q.options if q.options is not None else meta.get("options")
        allow_multi = q.allow_multiple or meta.get("allow_multiple", False)
        labels_raw  = q.scale_labels if q.scale_labels is not None else meta.get("scale_labels")
        sc_min      = int(meta.get("scale_min", 1))
        sc_max_meta = meta.get("scale_max")
        sc_pts      = q.scale_points or (int(sc_max_meta) - sc_min + 1 if sc_max_meta else 5)
        sc_max      = sc_min + sc_pts - 1

        if q.type == "multiple_choice":
            opts = [o.strip() for o in (opts_src or []) if str(o).strip()]
            if len(opts) < 2:
                raise HTTPException(status_code=400, detail=f"Pregunta {i+1}: mínimo 2 opciones")
            questions_clean.append({"text": q.text.strip(), "type": "multiple_choice", "options": opts, "allow_multiple": allow_multi, "order_index": i})

        elif q.type == "scale":
            if not 2 <= sc_pts <= 10:
                raise HTTPException(status_code=400, detail=f"Pregunta {i+1}: escala debe ser 2–10 puntos")
            # Normalizar etiquetas (acepta List o Dict; legado min/max como fallback)
            labels: Optional[List[str]] = _normalize_scale_labels(labels_raw, sc_min, sc_max)
            if labels is None and (q.scale_min_label or q.scale_max_label):
                labels = [q.scale_min_label.strip() if q.scale_min_label else ""] + [""] * (sc_pts - 2) + [q.scale_max_label.strip() if q.scale_max_label else ""]
            questions_clean.append({"text": q.text.strip(), "type": "scale", "scale_min": sc_min, "scale_max": sc_max, "scale_labels": labels, "order_index": i})

        elif q.type == "ranking":
            opts = [o.strip() for o in (opts_src or []) if str(o).strip()]
            if len(opts) < 3:
                raise HTTPException(status_code=400, detail=f"Pregunta {i+1}: ranking requiere mínimo 3 opciones")
            if len(opts) > 6:
                raise HTTPException(status_code=400, detail=f"Pregunta {i+1}: ranking permite máximo 6 opciones")
            questions_clean.append({"text": q.text.strip(), "type": "ranking", "options": opts, "order_index": i})

        else:
            raise HTTPException(status_code=400, detail=f"Pregunta {i+1}: tipo inválido (multiple_choice | scale | ranking)")

    now = datetime.now(timezone.utc)

    # Calcular starts_at / ends_at
    # Protocolo BEACON envía start_date/end_date absolutos; ciudadanos usan ends_in_days
    if payload.start_date and payload.end_date:
        starts_at = payload.start_date.astimezone(timezone.utc)
        ends_at   = payload.end_date.astimezone(timezone.utc)
        if ends_at <= starts_at:
            raise HTTPException(status_code=400, detail="end_date debe ser posterior a start_date")
    else:
        if not 1 <= payload.ends_in_days <= 30:
            raise HTTPException(status_code=400, detail="La duración debe ser entre 1 y 30 días")
        starts_at = now
        ends_at   = now + timedelta(days=payload.ends_in_days)

    # requires_auth: ciudadanos = siempre True; BEACON puede enviarlo como requires_login=False
    requires_auth = True
    if payload.requires_login is not None:
        requires_auth = not payload.requires_login  # BEACON: requires_login=False → requires_auth=True

    # Determinar poll_type y options desde la primera pregunta (retrocompatibilidad)
    first_q = questions_clean[0]
    if first_q["type"] in ("multiple_choice", "ranking"):
        poll_type = first_q["type"]
        options   = first_q["options"]
        scale_min, scale_max = 1, 5
    else:
        poll_type = "scale"
        options   = None
        scale_min = first_q.get("scale_min", 1)
        scale_max = first_q.get("scale_max", 5)

    supabase = get_async_supabase_client()
    row = {
        "title":       payload.title.strip(),
        "description": payload.description,
        "category":    category,
        "poll_type":   poll_type,
        "options":     options,
        "scale_min":   scale_min,
        "scale_max":   scale_max,
        "questions":   questions_clean,
        "is_active":   True,
        "requires_auth": requires_auth,
        "starts_at":   starts_at.isoformat(),
        "ends_at":     ends_at.isoformat(),
        "created_by":  current_user["id"],
        # BEACON protocol metadata (opcionales — append-only)
        "confidence_metadata": payload.confidence_metadata.model_dump() if payload.confidence_metadata else None,
        "audit_trail":         payload.audit_trail.model_dump() if payload.audit_trail else None,
        "internal_notes":      payload.internal_notes,
        **({"header_image": payload.header_image_url} if payload.header_image_url else {}),
    }

    try:
        res = await supabase.table("polls").insert(row).execute()
    except Exception as e:
        logger.error(f"Error creando poll por VERIFIED: {e}")
        raise HTTPException(status_code=500, detail="Error al crear encuesta")

    if not res.data:
        raise HTTPException(status_code=500, detail="Error al crear encuesta")

    created = res.data[0]
    poll_id  = created["id"]
    slug     = created.get("slug") or poll_id
    logger.info(f"Poll creado | user={current_user['id']} | poll={poll_id} | title={payload.title}")
    return JSONResponse(
        status_code=201,
        content={
            "success":  True,
            "id":       poll_id,
            "poll_id":  poll_id,
            "live_url": f"https://www.beaconchile.cl/encuestas/{slug}",
        },
    )


@router.get("/polls/by-slug/{slug}", summary="Detalle de encuesta por slug (URL pública)")
async def get_poll_by_slug(
    slug: str,
    access_code: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    """Lookup por slug canónico — usado por las páginas /encuestas/[slug].
    Si se envía JWT, incluye user_vote con el voto previo del usuario (si existe).
    """
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("polls")
            .select("*")
            .ilike("slug", slug)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")

    poll = res.data
    stored_code = poll.get("access_code")

    if stored_code:
        if not access_code or access_code != stored_code:
            return {
                "id": poll["id"],
                "slug": poll.get("slug"),
                "title": poll["title"],
                "description": poll.get("description"),
                "header_image": poll.get("header_image"),
                "is_open": _is_open(poll),
                "is_private": True,
                "requires_auth": poll.get("requires_auth", True),
                "category": poll.get("category", "general"),
                "status": poll.get("status", "active"),
                "total_votes": 0,
                "results": [],
            }

    vote_res = await (
        supabase.table("poll_votes")
        .select("option_value, voter_rank")
        .eq("poll_id", poll["id"])
        .execute()
    )
    result = _compute_results(poll, vote_res.data or [])
    result["is_private"] = bool(stored_code)
    result.pop("access_code", None)

    # Detectar voto previo del usuario autenticado
    result["user_vote"] = None
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ", 1)[1]
            user_res = await supabase.auth.get_user(token)
            user_id = user_res.user.id if user_res and user_res.user else None
            if user_id:
                uv_res = await (
                    supabase.table("poll_votes")
                    .select("option_value")
                    .eq("poll_id", poll["id"])
                    .eq("user_id", user_id)
                    .limit(1)
                    .execute()
                )
                if uv_res.data:
                    result["user_vote"] = uv_res.data[0]["option_value"]
        except Exception:
            pass  # JWT inválido o expirado — tratamos como anónimo

    return result


@router.get("/polls/{poll_id}", summary="Detalle encuesta con resultados")
async def get_poll(poll_id: str, access_code: Optional[str] = None):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("polls")
            .select("*")
            .eq("id", poll_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")

    poll = res.data
    stored_code = poll.get("access_code")

    # Si tiene código y no se proporcionó o es incorrecto → respuesta parcial
    if stored_code:
        if not access_code or access_code != stored_code:
            return {
                "id": poll["id"],
                "title": poll["title"],
                "description": poll.get("description"),
                "header_image": poll.get("header_image"),
                "is_open": _is_open(poll),
                "is_private": True,
                "requires_auth": poll.get("requires_auth", True),
                "category": poll.get("category", "general"),
                "total_votes": 0,
                "results": [],
                "questions": None,
                "options": None,
                "poll_type": poll.get("poll_type"),
                "scale_min": poll.get("scale_min", 1),
                "scale_max": poll.get("scale_max", 5),
                "starts_at": poll.get("starts_at"),
                "ends_at": poll.get("ends_at"),
            }

    vote_res = await (
        supabase.table("poll_votes")
        .select("option_value, voter_rank")
        .eq("poll_id", poll_id)
        .execute()
    )
    result = _compute_results(poll, vote_res.data or [])
    result["is_private"] = bool(stored_code)
    # Nunca exponer el código al cliente
    result.pop("access_code", None)
    return result


@router.post("/polls/{poll_id}/vote", summary="Votar en encuesta")
async def vote_poll(
    poll_id: str,
    payload: PollVotePayload,
    authorization: Optional[str] = Header(None),
):
    supabase = get_async_supabase_client()

    # Verificar encuesta
    try:
        poll_res = await (
            supabase.table("polls")
            .select("id, questions, starts_at, ends_at, is_active, requires_auth, access_code")
            .eq("id", poll_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")

    poll = poll_res.data
    if not poll["is_active"]:
        raise HTTPException(status_code=409, detail="Esta encuesta no está activa")
    if not _is_open(poll):
        raise HTTPException(status_code=409, detail="Esta encuesta no está abierta para votar")

    # Validar access_code si la encuesta es privada
    stored_code = poll.get("access_code")
    if stored_code and payload.access_code != stored_code:
        raise HTTPException(status_code=403, detail="Código de acceso incorrecto")

    requires_auth = poll.get("requires_auth", True)

    # Resolver identidad del votante
    user_id: Optional[str] = None
    anon_id: Optional[str] = None

    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        try:
            user_res = await supabase.auth.get_user(token)
            if user_res and user_res.user:
                user_id = user_res.user.id
        except Exception:
            pass

    if requires_auth and not user_id:
        raise HTTPException(status_code=401, detail="Debes iniciar sesión para votar en esta encuesta")

    if not user_id:
        # Encuesta anónima: usar anon_session_id del payload
        anon_id = payload.anon_session_id
        if not anon_id:
            raise HTTPException(status_code=400, detail="Se requiere anon_session_id para votar en esta encuesta")

    # Extraer tipo y opciones de la PRIMERA pregunta
    questions = poll.get("questions") or []
    if not questions:
        raise HTTPException(status_code=400, detail="Encuesta sin preguntas configuradas")

    first_q = questions[0]
    q_type = first_q.get("type", "scale")
    q_options = first_q.get("options") or []
    q_scale_min = first_q.get("scale_min", 1)
    q_scale_max = first_q.get("scale_max") or first_q.get("scale_points", 5)

    # Validar opción
    if q_type == "multiple_choice":
        if payload.option_value not in q_options:
            raise HTTPException(status_code=400, detail=f"Opción inválida. Opciones: {q_options}")
    elif q_type == "ranking":
        # Ranking completo obligatorio: todas las opciones exactamente una vez
        submitted = [s.strip() for s in payload.option_value.split("||") if s.strip()]
        if sorted(submitted) != sorted(q_options):
            raise HTTPException(
                status_code=400,
                detail="Ranking incompleto: debes ordenar todas las opciones exactamente una vez"
            )
    else:  # scale
        try:
            val = float(payload.option_value)
            if not (q_scale_min <= val <= q_scale_max):
                raise ValueError
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=400,
                detail=f"Valor fuera de rango [{q_scale_min}-{q_scale_max}]"
            )

    # Anti-brigada: 1 voto por usuario/sesión por encuesta
    if user_id:
        existing = await (
            supabase.table("poll_votes")
            .select("id")
            .eq("poll_id", poll_id)
            .eq("user_id", user_id)
            .execute()
        )
    else:
        existing = await (
            supabase.table("poll_votes")
            .select("id")
            .eq("poll_id", poll_id)
            .eq("anon_session_id", anon_id)
            .execute()
        )
    if existing.data:
        raise HTTPException(status_code=409, detail="Ya votaste en esta encuesta")

    # Snapshot del rango del votante (inmutable)
    voter_rank = "ANONYMOUS"
    if user_id:
        try:
            ur = await (
                supabase.table("users")
                .select("rank")
                .eq("id", user_id)
                .single()
                .execute()
            )
            voter_rank = ur.data.get("rank", "BASIC") if ur.data else "BASIC"
        except Exception:
            voter_rank = "BASIC"

    # Insertar voto
    vote_row: dict = {
        "poll_id": poll_id,
        "option_value": payload.option_value,
        "voter_rank": voter_rank,
    }
    if user_id:
        vote_row["user_id"] = user_id
    else:
        vote_row["anon_session_id"] = anon_id

    await supabase.table("poll_votes").insert(vote_row).execute()

    # Publicar pulso en tiempo real (Efecto Kahoot)
    try:
        all_votes = await (
            supabase.table("poll_votes")
            .select("option_value, voter_rank")
            .eq("poll_id", poll_id)
            .execute()
        )
        updated_results = _compute_results(poll, all_votes.data or [])
        asyncio.create_task(publish_poll_pulse(
            poll_id=poll_id,
            results=updated_results["results"],
            total_votes=updated_results["total_votes"],
            results_verified=updated_results["results_verified"],
            verified_votes=updated_results["verified_votes"],
            basic_votes=updated_results["basic_votes"],
        ))
    except Exception as e:
        logger.warning(f"Pulse Poll falló (no crítico): {e}")

    logger.info(f"Poll voto | poll={poll_id} | user={user_id or 'anon'} | value={payload.option_value}")
    return {"success": True, "option_value": payload.option_value}


# ─── Cross-tabs ────────────────────────────────────────────────────────────────

MIN_CROSSTAB_N = 5  # Grupos con menos de N respuestas se suprimen (privacidad)

VALID_DIMENSIONS = {"age", "region", "commune", "country"}

AGE_BINS = [
    (18, 29,  "18-29"),
    (30, 44,  "30-44"),
    (45, 59,  "45-59"),
    (60, 999, "60+"),
]


def _age_group(birth_year: Optional[int], reference_year: int) -> Optional[str]:
    if not birth_year:
        return None
    age = reference_year - birth_year
    for lo, hi, label in AGE_BINS:
        if lo <= age <= hi:
            return label
    return None


def _crosstab_aggregate(votes_with_demo: list, dimension_values: list, options_or_scale: dict) -> list:
    """
    Agrupa votos por valor de dimensión demográfica y agrega resultados.
    Suprime grupos con n < MIN_CROSSTAB_N.
    Retorna lista de grupos ordenada por n desc.
    """
    from collections import defaultdict

    groups: dict = defaultdict(list)
    for item in votes_with_demo:
        grp = item.get("_dim")
        if grp:
            groups[grp].append(item["option_value"])

    poll_type = options_or_scale.get("poll_type", "multiple_choice")
    poll_options = options_or_scale.get("options") or []

    results = []
    suppressed = 0

    for group, values in groups.items():
        n = len(values)
        if n < MIN_CROSSTAB_N:
            suppressed += 1
            continue

        if poll_type == "multiple_choice":
            counts = {opt: 0 for opt in poll_options}
            for v in values:
                for sel in (s.strip() for s in v.split("||") if s.strip()):
                    if sel in counts:
                        counts[sel] += 1
            breakdown = [
                {"option": opt, "count": cnt, "pct": round(cnt / n * 100, 1)}
                for opt, cnt in counts.items()
            ]

        elif poll_type == "ranking":
            # Posiciones 1-based. avg_position: 1.0 = siempre primero.
            pos_sum:    dict = {opt: 0.0 for opt in poll_options}
            pos_count:  dict = {opt: 0   for opt in poll_options}
            first_place: dict = {opt: 0  for opt in poll_options}
            for v in values:
                ranked = [s.strip() for s in v.split("||") if s.strip()]
                for pos_1based, opt in enumerate(ranked, start=1):
                    if opt in pos_sum:
                        pos_sum[opt]    += pos_1based
                        pos_count[opt]  += 1
                        if pos_1based == 1:
                            first_place[opt] += 1
            breakdown = [
                {
                    "option":          opt,
                    "avg_position":    round(pos_sum[opt] / pos_count[opt], 2) if pos_count[opt] else None,
                    "first_place_pct": round(first_place[opt] / n * 100, 1),
                }
                for opt in poll_options
            ]
            breakdown.sort(key=lambda x: (x["avg_position"] or 999))
            results.append({"group": group, "n": n, "breakdown": breakdown})
            continue

        else:  # scale — distribución completa por punto + promedio
            scale_min = options_or_scale.get("scale_min", 1)
            scale_max = options_or_scale.get("scale_max", 5)
            point_counts: dict = {}
            nums = []
            for v in values:
                try:
                    pt = float(v)
                    nums.append(pt)
                    key = str(int(pt))
                    point_counts[key] = point_counts.get(key, 0) + 1
                except (ValueError, TypeError):
                    pass
            avg = round(sum(nums) / len(nums), 2) if nums else 0
            breakdown = [
                {
                    "option": str(pt),
                    "count": point_counts.get(str(pt), 0),
                    "pct": round(point_counts.get(str(pt), 0) / n * 100, 1),
                }
                for pt in range(scale_min, scale_max + 1)
            ]
            results.append({"group": group, "n": n, "breakdown": breakdown, "average": avg})
            continue

        results.append({"group": group, "n": n, "breakdown": breakdown})

    results.sort(key=lambda x: x["n"], reverse=True)
    return results, suppressed


@router.get("/polls/{poll_id}/crosstabs", summary="Cross-tabs demográficos de una encuesta")
async def get_poll_crosstabs(
    poll_id: str,
    dimension: str = "region",
    question_index: int = 0,
):
    """
    Devuelve resultados desagregados por dimensión demográfica.

    - dimension: age | region | commune | country (default: region)
    - question_index: índice de la pregunta en encuestas multi-pregunta (default: 0)

    Solo incluye votos de ciudadanos VERIFIED (datos demográficos confiables).
    Suprime grupos con menos de MIN_CROSSTAB_N=5 respuestas para evitar de-anonimización.
    """
    if dimension not in VALID_DIMENSIONS:
        raise HTTPException(status_code=400, detail=f"dimension inválida. Opciones: {', '.join(sorted(VALID_DIMENSIONS))}")

    supabase = get_async_supabase_client()

    # 1. Verificar que la encuesta existe
    try:
        poll_res = await supabase.table("polls").select("id, questions").eq("id", poll_id).single().execute()
    except Exception:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")
    poll = poll_res.data

    # Resolver tipo, opciones y rango de escala para question_index
    questions = poll.get("questions") or []
    if not questions:
        raise HTTPException(status_code=400, detail="Encuesta sin preguntas configuradas")

    if question_index < len(questions):
        q = questions[question_index]
        q_type    = q.get("type", "scale")
        q_options = q.get("options") or []
        q_scale_min = int(q.get("scale_min", 1))
        q_scale_max = int(q.get("scale_max") or q.get("scale_points", 5))
    else:
        raise HTTPException(status_code=400, detail=f"question_index {question_index} fuera de rango")
        q_scale_max = int(poll.get("scale_max", 5))
    poll_meta = {"poll_type": q_type, "options": q_options, "scale_min": q_scale_min, "scale_max": q_scale_max}

    # 2. Votos VERIFIED con user_id
    try:
        votes_res = await (
            supabase.table("poll_votes")
            .select("user_id, option_value")
            .eq("poll_id", poll_id)
            .eq("voter_rank", "VERIFIED")
            .not_.is_("user_id", "null")
            .execute()
        )
    except Exception as e:
        logger.error(f"Error leyendo votos para crosstabs poll={poll_id}: {e}")
        raise HTTPException(status_code=500, detail="Error al leer votos")

    votes = votes_res.data or []
    if not votes:
        return {"poll_id": poll_id, "dimension": dimension, "total_verified_votes": 0, "suppressed_groups": 0, "results": []}

    # 3. Demografía de los votantes
    user_ids = list({v["user_id"] for v in votes})
    demo_field = "birth_year" if dimension == "age" else dimension
    try:
        users_res = await (
            supabase.table("users")
            .select(f"id, {demo_field}")
            .in_("id", user_ids)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error leyendo demografía users para crosstabs: {e}")
        raise HTTPException(status_code=500, detail="Error al leer datos demográficos")

    from datetime import datetime as _dt
    current_year = _dt.now().year
    user_demo: dict = {}
    for u in (users_res.data or []):
        if dimension == "age":
            user_demo[u["id"]] = _age_group(u.get("birth_year"), current_year)
        else:
            user_demo[u["id"]] = u.get(dimension)

    # 4. Enriquecer votos con dimensión
    enriched = []
    for v in votes:
        dim_val = user_demo.get(v["user_id"])
        if dim_val:
            enriched.append({"option_value": v["option_value"], "_dim": dim_val})

    # 5. Agregar y aplicar filtro de privacidad
    results, suppressed = _crosstab_aggregate(enriched, [], poll_meta)

    logger.info(f"Crosstabs | poll={poll_id} | dim={dimension} | verified={len(votes)} | groups={len(results)} | suppressed={suppressed}")

    return {
        "poll_id":              poll_id,
        "dimension":            dimension,
        "question_index":       question_index,
        "total_verified_votes": len(votes),
        "suppressed_groups":    suppressed,
        "min_group_size":       MIN_CROSSTAB_N,
        "results":              results,
    }
