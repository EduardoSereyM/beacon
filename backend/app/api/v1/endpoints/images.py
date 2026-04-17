"""
BEACON PROTOCOL — Image Generation Endpoint
==========================================
Endpoint para generar y descargar imágenes de resultados de encuestas.

GET /api/v1/images/polls/{poll_slug}/generate
  Parámetros query:
    - question_id: ID de la pregunta (requerido)
    - format: "1080x1080" | "1200x630" (default: 1080x1080)

Retorna:
  {
    "image_url": "https://storage.supabase.co/...",
    "download_name": "beacon-{slug}-q{id}-{timestamp}.png",
    "cached": true|false
  }
"""

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import io

from app.services.image_service import generate_and_cache_poll_image

logger = logging.getLogger("beacon.images_endpoint")

router = APIRouter(prefix="/images", tags=["images"])


@router.get("/polls/{poll_slug}/generate")
async def generate_poll_image(
    poll_slug: str,
    question_id: str = Query(..., description="ID de la pregunta a renderizar"),
    format: Literal["1080x1080", "1200x630"] = Query("1080x1080", description="Tamaño de imagen"),
):
    """
    Genera imagen PNG de resultado de una pregunta.

    Flujo:
      1. Validar parámetros
      2. Check caché Redis
      3. Si cached: return URL
      4. Si no: generar con Pillow + upload a Storage
      5. Cache por 24h
      6. Return download link

    Latencia esperada:
      - Primera generación: ~800ms
      - Desde caché: ~50ms
    """
    try:
        # Validar parámetros
        if not poll_slug or not poll_slug.strip():
            raise HTTPException(status_code=400, detail="poll_slug es requerido")

        if not question_id or not question_id.strip():
            raise HTTPException(status_code=400, detail="question_id es requerido")

        if format not in ["1080x1080", "1200x630"]:
            raise HTTPException(status_code=400, detail="formato inválido: 1080x1080 o 1200x630")

        logger.info("Generando imagen: poll=%s q=%s format=%s", poll_slug, question_id, format)

        # Generar o cachear (retorna dict con image_bytes y metadata)
        result = await generate_and_cache_poll_image(poll_slug, question_id, format)

        # Retornar como archivo descargable
        image_bytes = result.get("image_bytes")
        download_name = result.get("download_name", f"beacon-{poll_slug}-{datetime.now(timezone.utc).isoformat()}.png")

        return StreamingResponse(
            io.BytesIO(image_bytes),
            media_type="image/png",
            headers={"Content-Disposition": f"attachment; filename={download_name}"},
        )

    except ValueError as e:
        # Encuesta no encontrada, pregunta no encontrada, etc.
        logger.warning("Validación fallida: %s", str(e))
        raise HTTPException(status_code=404, detail=str(e))

    except RuntimeError as e:
        # Error en generación de imagen
        logger.error("Error en generación: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Error al generar imagen")

    except Exception as e:
        logger.error("Error inesperado: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor")
