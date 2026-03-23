"""
BEACON PROTOCOL — Admin Stats Endpoint (Pulso del Sistema)
===========================================================
Retorna métricas reales de la base de datos para el Sovereign Dashboard.

Consultas:
  - Entidades: total, activas, inactivas, por categoría, top por score
  - Usuarios: total, por rango, shadow banned
  - Votos: total procesados
  - Audit logs: últimas 10 acciones del Overlord

"El Overlord que no mide, no gobierna."
"""

from fastapi import APIRouter, Depends
from app.core.database import get_async_supabase_client
from app.api.v1.admin.require_admin import require_admin_role

router = APIRouter(prefix="/admin", tags=["Admin — Stats"])


@router.get("/stats", summary="[ADMIN] Métricas reales del sistema")
async def admin_get_stats(admin: dict = Depends(require_admin_role)):
    """
    Agrega métricas reales desde Supabase para el dashboard del Overlord.
    Todas las consultas son paralelas via asyncio.gather para minimizar latencia.
    """
    import asyncio
    supabase = get_async_supabase_client()

    # ── Consultas paralelas ───────────────────────────────────────────────────
    # entity_reviews: solo COUNT via PostgREST (count="exact" + limit 0).
    # users: columnas mínimas para métricas (rank, is_shadow_banned).
    # entities: columnas mínimas para top-5 y desgloses por categoría.
    # polls/versus/events: conteos totales y activos.
    (
        entities_all,
        users_all,
        votes_count_result,
        polls_all,
        versus_all,
        events_all,
        poll_votes_result,
        versus_votes_result,
    ) = await asyncio.gather(
        supabase.table("entities").select(
            "id, first_name, last_name, category, is_active, reputation_score, total_reviews, photo_path"
        ).execute(),
        supabase.table("users").select(
            "rank, is_shadow_banned"
        ).execute(),
        supabase.table("entity_reviews").select(
            "*", count="exact"
        ).limit(0).execute(),
        supabase.table("polls").select(
            "id, is_active"
        ).execute(),
        supabase.table("versus").select(
            "id, is_active"
        ).execute(),
        supabase.table("events").select(
            "id, is_active"
        ).execute(),
        supabase.table("poll_votes").select(
            "*", count="exact"
        ).limit(0).execute(),
        supabase.table("versus_votes").select(
            "*", count="exact"
        ).limit(0).execute(),
    )

    entities         = entities_all.data  or []
    users            = users_all.data     or []
    total_votes      = votes_count_result.count or 0
    polls            = polls_all.data     or []
    versus_list      = versus_all.data    or []
    events_list      = events_all.data    or []
    total_poll_votes    = poll_votes_result.count    or 0
    total_versus_votes  = versus_votes_result.count  or 0

    # ── Audit logs: columnas reales del audit_logger ─────────────────────────
    # Columnas: actor_id, action, entity_type, entity_id, details, created_at
    audit_logs = []
    try:
        audit_all = await (
            supabase.table("audit_logs")
            .select("*")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        audit_logs = audit_all.data or []
    except Exception as e:
        import logging
        logging.getLogger("beacon.admin").warning(f"audit_logs no disponible: {e}")

    # ── Métricas de entidades ────────────────────────────────────────────────
    active_entities   = [e for e in entities if e.get("is_active")]
    inactive_entities = [e for e in entities if not e.get("is_active")]

    categories = {}
    for e in active_entities:
        cat = e.get("category", "sin_categoria")
        categories[cat] = categories.get(cat, 0) + 1

    top_by_score   = sorted(active_entities, key=lambda x: x.get("reputation_score") or 0, reverse=True)[:5]
    top_by_reviews = sorted(active_entities, key=lambda x: x.get("total_reviews") or 0, reverse=True)[:5]

    # ── Métricas de usuarios ─────────────────────────────────────────────────
    ranks = {}
    for u in users:
        rank = u.get("rank", "BASIC")
        ranks[rank] = ranks.get(rank, 0) + 1

    shadow_banned = sum(1 for u in users if u.get("is_shadow_banned"))

    # ── Audit logs formateados (tolerante a cualquier esquema) ──────────────
    recent_actions = []
    for log in audit_logs:
        details = log.get("details") or {}
        new_data = details.get("new_data") or {}
        label = (
            (new_data.get("first_name", "") + " " + new_data.get("last_name", "")).strip()
            or details.get("email", "")
            or log.get("entity_id", "")
            or "—"
        )
        # Soportar tanto 'action' como posibles variantes
        action_val = (
            log.get("action")
            or log.get("event_type")
            or log.get("type")
            or "—"
        )
        table_val = (
            log.get("entity_type")
            or log.get("table_name")
            or log.get("resource")
            or ""
        )
        recent_actions.append({
            "id":         log.get("id", ""),
            "action":     action_val,
            "table_name": table_val,
            "label":      label,
            "created_at": log.get("created_at", ""),
            "_raw":       log,   # debug: el frontend puede ignorarlo
        })

    # ── Métricas de contenido ────────────────────────────────────────────────
    active_polls   = sum(1 for p in polls       if p.get("is_active"))
    active_versus  = sum(1 for v in versus_list  if v.get("is_active"))
    active_events  = sum(1 for e in events_list  if e.get("is_active"))

    return {
        # KPIs principales
        "total_entities":    len(entities),
        "active_entities":   len(active_entities),
        "inactive_entities": len(inactive_entities),
        "total_users":       len(users),
        "total_votes":       total_votes,
        "shadow_banned":     shadow_banned,

        # Encuestas
        "total_polls":       len(polls),
        "active_polls":      active_polls,
        "total_poll_votes":  total_poll_votes,

        # Versus
        "total_versus":      len(versus_list),
        "active_versus":     active_versus,
        "total_versus_votes": total_versus_votes,

        # Eventos
        "total_events":      len(events_list),
        "active_events":     active_events,

        # Desgloses
        "by_category": categories,
        "by_rank":     ranks,

        # Top entidades
        "top_by_score":   [
            {
                "id":    e["id"],
                "name":  f"{e.get('first_name','')} {e.get('last_name','')}".strip(),
                "score": round(e.get("reputation_score") or 0, 2),
                "reviews": e.get("total_reviews") or 0,
                "photo": e.get("photo_path"),
                "category": e.get("category"),
            }
            for e in top_by_score
        ],
        "top_by_reviews": [
            {
                "id":    e["id"],
                "name":  f"{e.get('first_name','')} {e.get('last_name','')}".strip(),
                "score": round(e.get("reputation_score") or 0, 2),
                "reviews": e.get("total_reviews") or 0,
                "photo": e.get("photo_path"),
                "category": e.get("category"),
            }
            for e in top_by_reviews
        ],

        # Actividad reciente
        "recent_audit": recent_actions,
    }
