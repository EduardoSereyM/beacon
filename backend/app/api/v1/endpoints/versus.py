"""
BEACON PROTOCOL — Versus Router (P3)
=====================================
Endpoints públicos para enfrentamientos VS entre entidades.

GET  /versus              → lista VS activos (dentro de fecha)
GET  /versus/{id}         → detalle VS + resultados parciales
POST /versus/{id}/vote    → emitir voto A o B (JWT, 1 por usuario por VS)
"""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import logging

from app.core.database import get_async_supabase_client
from app.api.v1.user.auth import get_current_user

logger = logging.getLogger("beacon.versus")
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class VersusVotePayload(BaseModel):
    voted_for: str  # "A" | "B"

    def model_post_init(self, __context):
        if self.voted_for not in ("A", "B"):
            raise ValueError("voted_for debe ser 'A' o 'B'")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_open(v: dict) -> bool:
    now = datetime.now(timezone.utc)
    try:
        start = datetime.fromisoformat(str(v["starts_at"]).replace("Z", "+00:00"))
        end   = datetime.fromisoformat(str(v["ends_at"]).replace("Z", "+00:00"))
        return start <= now <= end
    except Exception:
        return False


def _enrich_versus(v: dict, votes: list, user_vote: str | None = None) -> dict:
    votes_a = sum(1 for vv in votes if vv["voted_for"] == "A")
    votes_b = sum(1 for vv in votes if vv["voted_for"] == "B")
    total   = votes_a + votes_b
    return {
        **v,
        "votes_a": votes_a,
        "votes_b": votes_b,
        "total_votes": total,
        "pct_a": round(votes_a / total * 100, 1) if total else 50.0,
        "pct_b": round(votes_b / total * 100, 1) if total else 50.0,
        "is_open": _is_open(v),
        "user_vote": user_vote,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/versus", summary="Listar VS activos")
async def list_versus():
    """Retorna VS activos y dentro de fecha, con entidades embebidas."""
    supabase = get_async_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        result = await (
            supabase.table("versus")
            .select(
                "id, title, description, starts_at, ends_at, affects_reputation, "
                "entity_a:entities!entity_a_id(id, first_name, last_name, photo_path, category, reputation_score), "
                "entity_b:entities!entity_b_id(id, first_name, last_name, photo_path, category, reputation_score)"
            )
            .eq("is_active", True)
            .lte("starts_at", now_iso)
            .gte("ends_at", now_iso)
            .order("starts_at", desc=True)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error listando versus: {e}")
        raise HTTPException(status_code=503, detail="Error al obtener VS")

    items = result.data or []

    # Enriquecer con conteo de votos (batch)
    enriched = []
    for v in items:
        try:
            vote_res = await (
                supabase.table("versus_votes")
                .select("voted_for")
                .eq("versus_id", v["id"])
                .execute()
            )
            enriched.append(_enrich_versus(v, vote_res.data or []))
        except Exception:
            enriched.append(_enrich_versus(v, []))

    return {"items": enriched, "total": len(enriched)}


@router.get("/versus/{versus_id}", summary="Detalle VS con resultados")
async def get_versus(versus_id: str):
    supabase = get_async_supabase_client()
    try:
        res = await (
            supabase.table("versus")
            .select(
                "id, title, description, starts_at, ends_at, affects_reputation, "
                "entity_a:entities!entity_a_id(id, first_name, last_name, photo_path, category, reputation_score, position, region), "
                "entity_b:entities!entity_b_id(id, first_name, last_name, photo_path, category, reputation_score, position, region)"
            )
            .eq("id", versus_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="VS no encontrado")

    vote_res = await (
        supabase.table("versus_votes")
        .select("voted_for")
        .eq("versus_id", versus_id)
        .execute()
    )
    return _enrich_versus(res.data, vote_res.data or [])


@router.post("/versus/{versus_id}/vote", summary="Votar en VS")
async def vote_versus(
    versus_id: str,
    payload: VersusVotePayload,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_async_supabase_client()
    user_id = current_user["id"]

    # Verificar VS existe, activo y abierto
    try:
        vs_res = await (
            supabase.table("versus")
            .select("id, starts_at, ends_at, is_active, affects_reputation, entity_a_id, entity_b_id")
            .eq("id", versus_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="VS no encontrado")

    vs = vs_res.data
    if not vs["is_active"]:
        raise HTTPException(status_code=409, detail="Este VS no está activo")
    if not _is_open(vs):
        raise HTTPException(status_code=409, detail="Este VS no está abierto para votación")

    # 1 voto por usuario
    existing = await (
        supabase.table("versus_votes")
        .select("id, voted_for")
        .eq("versus_id", versus_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail=f"Ya votaste por '{existing.data[0]['voted_for']}' en este VS")

    # Insertar voto
    await (
        supabase.table("versus_votes")
        .insert({"versus_id": versus_id, "user_id": user_id, "voted_for": payload.voted_for})
        .execute()
    )

    # Si affects_reputation → actualizar reputation_score (sin afectar total_reviews)
    if vs.get("affects_reputation"):
        entity_id = vs["entity_a_id"] if payload.voted_for == "A" else vs["entity_b_id"]
        try:
            ent = await (
                supabase.table("entities")
                .select("reputation_score, total_reviews")
                .eq("id", entity_id)
                .single()
                .execute()
            )
            if ent.data:
                old_score = float(ent.data["reputation_score"] or 0)
                old_n = int(ent.data["total_reviews"] or 0)
                new_score = (old_score * old_n + 3.5) / (old_n + 1) if old_n > 0 else 3.5
                await (
                    supabase.table("entities")
                    .update({"reputation_score": round(new_score, 4)})
                    .eq("id", entity_id)
                    .execute()
                )
        except Exception as e:
            logger.warning(f"No se pudo actualizar reputation desde VS: {e}")

    logger.info(f"VS voto | versus={versus_id} | user={user_id} | choice={payload.voted_for}")
    return {"success": True, "voted_for": payload.voted_for}
