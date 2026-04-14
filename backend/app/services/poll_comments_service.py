"""
BEACON PROTOCOL — Poll Comments Service
========================================
Lógica de negocio para reacciones ciudadanas (poll_comments).

Reglas:
  - Un usuario puede tener exactamente UN comentario activo por encuesta.
  - Los comentarios borrados quedan en la tabla (soft-delete) para audit.
  - El rank se captura en el momento de publicar (snapshot inmutable).
  - El servicio usa el cliente service_role para escritura; la RLS lo protege
    desde el frontend, pero en backend verificamos user_id manualmente.
"""

import logging
from typing import Optional

from app.core.database import get_async_supabase_client

logger = logging.getLogger("beacon.poll_comments")


async def get_comments(poll_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
    """
    Lista comentarios activos de una encuesta, ordenados por fecha desc.
    Paginable via limit/offset.
    """
    supabase = get_async_supabase_client()
    resp = (
        await supabase
        .table("poll_comments")
        .select("id, poll_id, user_id, reaction, text, rank, created_at")
        .eq("poll_id", poll_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return resp.data or []


async def get_user_comment(poll_id: str, user_id: str) -> Optional[dict]:
    """Devuelve el comentario activo del usuario en esta encuesta, o None."""
    supabase = get_async_supabase_client()
    resp = (
        await supabase
        .table("poll_comments")
        .select("id, reaction, text, rank, created_at")
        .eq("poll_id", poll_id)
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    data = resp.data or []
    return data[0] if data else None


async def create_comment(
    poll_id: str,
    user_id: str,
    text: str,
    rank: str,
    reaction: Optional[str] = None,
) -> dict:
    """
    Publica un nuevo comentario.

    Raises:
      ValueError — si el usuario ya tiene un comentario activo en esta encuesta.
    """
    # Verificar unicidad antes de insertar (constraint de BBDD también lo garantiza,
    # pero un mensaje claro es mejor UX que un error 23505 crudo).
    existing = await get_user_comment(poll_id, user_id)
    if existing:
        raise ValueError("Ya publicaste un comentario en esta encuesta.")

    supabase = get_async_supabase_client()
    payload: dict = {
        "poll_id":  poll_id,
        "user_id":  user_id,
        "text":     text,
        "rank":     rank,
    }
    if reaction is not None:
        payload["reaction"] = reaction

    resp = (
        await supabase
        .table("poll_comments")
        .insert(payload)
        .execute()
    )
    created = (resp.data or [None])[0]
    if not created:
        logger.error("poll_comments insert no devolvió datos: poll=%s user=%s", poll_id, user_id)
        raise RuntimeError("Error al guardar el comentario.")

    logger.info("Comentario publicado | poll=%s user=%s rank=%s", poll_id, user_id, rank)
    return created


async def soft_delete_comment(comment_id: str, user_id: str) -> bool:
    """
    Soft-delete: marca deleted_at = now().
    Solo el propietario puede borrar su comentario.
    Devuelve True si se borró, False si no era suyo o no existía.
    """
    from datetime import datetime, timezone
    supabase = get_async_supabase_client()

    resp = (
        await supabase
        .table("poll_comments")
        .update({"deleted_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", comment_id)
        .eq("user_id", user_id)
        .is_("deleted_at", "null")
        .execute()
    )
    updated = resp.data or []
    return len(updated) > 0
