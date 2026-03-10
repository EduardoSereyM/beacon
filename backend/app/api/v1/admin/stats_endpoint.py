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

    # ── Consultas paralelas ──────────────────────────────────────────────────
    (
        entities_all,
        users_all,
        votes_all,
        audit_all,
    ) = await asyncio.gather(
        supabase.table("entities").select(
            "id, first_name, last_name, category, is_active, reputation_score, total_reviews, photo_path"
        ).execute(),
        supabase.table("users").select(
            "id, rank, is_shadow_banned, created_at"
        ).execute(),
        supabase.table("entity_reviews").select(
            "id, created_at"
        ).execute(),
        supabase.table("audit_logs").select(
            "id, action, table_name, user_id, created_at, new_data"
        ).order("created_at", desc=True).limit(10).execute(),
    )

    entities   = entities_all.data  or []
    users      = users_all.data     or []
    votes      = votes_all.data     or []
    audit_logs = audit_all.data     or []

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
        rank = u.get("rank", "BRONZE")
        ranks[rank] = ranks.get(rank, 0) + 1

    shadow_banned = sum(1 for u in users if u.get("is_shadow_banned"))

    # ── Audit logs formateados ───────────────────────────────────────────────
    recent_actions = []
    for log in audit_logs:
        new_data = log.get("new_data") or {}
        label = new_data.get("first_name", "") + " " + new_data.get("last_name", "")
        label = label.strip() or new_data.get("email", "—")
        recent_actions.append({
            "id":         log.get("id"),
            "action":     log.get("action", ""),
            "table_name": log.get("table_name", ""),
            "label":      label,
            "created_at": log.get("created_at", ""),
        })

    return {
        # KPIs principales
        "total_entities":    len(entities),
        "active_entities":   len(active_entities),
        "inactive_entities": len(inactive_entities),
        "total_users":       len(users),
        "total_votes":       len(votes),
        "shadow_banned":     shadow_banned,

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
