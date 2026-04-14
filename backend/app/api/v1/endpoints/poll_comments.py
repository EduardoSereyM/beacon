"""
BEACON PROTOCOL — Poll Comments Router
========================================
Reacciones ciudadanas por encuesta.

GET  /polls/{poll_id}/comments              → lista paginada (público)
POST /polls/{poll_id}/comments              → publicar comentario (JWT requerido)
DELETE /polls/{poll_id}/comments/{id}       → soft-delete propio comentario (JWT requerido)
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from app.api.v1.user.auth import get_current_user
from app.services import poll_comments_service as svc

logger = logging.getLogger("beacon.poll_comments")
router = APIRouter()

VALID_REACTIONS = {"👍", "👎", "🤔"}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CommentIn(BaseModel):
    text:     str
    reaction: Optional[str] = None

    @field_validator("text")
    @classmethod
    def text_length(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("El comentario debe tener al menos 10 caracteres.")
        if len(v) > 500:
            raise ValueError("El comentario no puede superar los 500 caracteres.")
        return v

    @field_validator("reaction")
    @classmethod
    def valid_reaction(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_REACTIONS:
            raise ValueError(f"Reacción inválida. Usa: {VALID_REACTIONS}")
        return v


class CommentOut(BaseModel):
    id:         str
    poll_id:    str
    user_id:    str
    reaction:   Optional[str]
    text:       str
    rank:       str
    created_at: str


# ─── GET /polls/{poll_id}/comments ────────────────────────────────────────────

@router.get(
    "/polls/{poll_id}/comments",
    summary="Listar reacciones ciudadanas de una encuesta",
    response_model=list[CommentOut],
)
async def list_comments(
    poll_id: str,
    limit:   int = Query(default=50, ge=1, le=100),
    offset:  int = Query(default=0,  ge=0),
):
    """
    Devuelve los comentarios activos de una encuesta, paginados.
    Acceso público — no requiere autenticación.
    """
    try:
        comments = await svc.get_comments(poll_id, limit=limit, offset=offset)
        return comments
    except Exception as e:
        logger.error("Error listando comentarios poll=%s: %s", poll_id, e)
        raise HTTPException(status_code=500, detail="Error al obtener comentarios.")


# ─── POST /polls/{poll_id}/comments ───────────────────────────────────────────

@router.post(
    "/polls/{poll_id}/comments",
    summary="Publicar reacción ciudadana",
    status_code=201,
    response_model=CommentOut,
)
async def create_comment(
    poll_id: str,
    body:    CommentIn,
    user:    dict = Depends(get_current_user),
):
    """
    Publica un comentario con reacción opcional.
    Requiere Bearer token (usuario autenticado).
    Un usuario puede publicar un solo comentario activo por encuesta.
    """
    user_id = user["id"]
    rank    = user.get("rank", "BASIC")

    try:
        created = await svc.create_comment(
            poll_id=poll_id,
            user_id=user_id,
            text=body.text,
            rank=rank,
            reaction=body.reaction,
        )
        return created
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.error("Error creando comentario poll=%s user=%s: %s", poll_id, user_id, e)
        raise HTTPException(status_code=500, detail="Error al publicar el comentario.")


# ─── DELETE /polls/{poll_id}/comments/{comment_id} ────────────────────────────

@router.delete(
    "/polls/{poll_id}/comments/{comment_id}",
    summary="Eliminar propio comentario (soft-delete)",
    status_code=204,
)
async def delete_comment(
    poll_id:    str,
    comment_id: str,
    user:       dict = Depends(get_current_user),
):
    """
    Soft-delete del comentario. Solo el autor puede borrarlo.
    El registro queda en la BBDD para audit — solo se marca deleted_at.
    """
    user_id = user["id"]
    deleted = await svc.soft_delete_comment(comment_id=comment_id, user_id=user_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Comentario no encontrado o no tienes permiso para borrarlo.",
        )
