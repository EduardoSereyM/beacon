"""
BEACON PROTOCOL — Image Generation Endpoint
==========================================
Endpoint para generar y descargar imágenes de resultados de encuestas.

GET /api/v1/images/polls/{poll_slug}/generate
  Parámetros query:
    - question_id: ID de la pregunta (requerido)
    - format: "1080x1080" | "1200x630" (default: 1080x1080)

Retorna el PNG (image/png) como archivo descargable (Content-Disposition: attachment).
La imagen se genera en cada petición (no hay caché en el servidor); la respuesta lleva
`Cache-Control: public, max-age=300` para que el navegador o la CDN alivianen la carga.
"""

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import io

from app.services.image_service import render_poll_image

# La imagen refleja los votos al momento de generarla: 5 minutos de caché compartida bastan para aliviar la carga.
CACHE_CONTROL = "public, max-age=300"

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
      2. Generar la imagen con Pillow (siempre)
      3. Devolver el PNG con `Cache-Control: public, max-age=300`

    Latencia esperada: ~0,6–1,5 s por imagen.
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

        # Generar (retorna dict con image_bytes y download_name)
        result = await render_poll_image(poll_slug, question_id, format)

        # Retornar como archivo descargable
        image_bytes = result.get("image_bytes")
        download_name = result.get("download_name", f"beacon-{poll_slug}-{datetime.now(timezone.utc).isoformat()}.png")

        return StreamingResponse(
            io.BytesIO(image_bytes),
            media_type="image/png",
            headers={
                "Content-Disposition": f"attachment; filename={download_name}",
                "Cache-Control": CACHE_CONTROL,
            },
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
