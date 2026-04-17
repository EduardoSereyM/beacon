"""
BEACON PROTOCOL — Poll Image Generation Service
===============================================
Generación de imágenes PNG para compartir resultados de encuestas.

Flujo:
  1. Fetch poll + votos de Supabase
  2. Check caché Redis
  3. Si cached: return URL
  4. Si no: generar PNG con Pillow
  5. Upload a Supabase Storage
  6. Cache URL en Redis (86400s = 1 día)
  7. Return { image_url, download_name }
"""

import logging
import json
import io
import base64
from datetime import datetime, timezone
from typing import Literal
from urllib.request import urlopen

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import qrcode

from app.core.database import get_async_supabase_client, get_supabase_anon_async
from app.core.redis_client import get_redis
from app.core.config import settings

logger = logging.getLogger("beacon.image_generation")

# Colores
COLORS = {
    "bg": "#0A0A0A",
    "text_primary": "#FFFFFF",
    "text_secondary": "#999999",
    "accent_gold": "#D4AF37",
    "accent_cyan": "#00E5FF",
    "accent_green": "#39FF14",
    "border": "#333333",
}


async def generate_and_cache_poll_image(
    poll_slug: str,
    question_id: str,
    format_type: Literal["1080x1080", "1200x630"] = "1080x1080",
) -> dict:
    """
    Genera o cachea imagen de resultado de encuesta.

    Flujo:
      1. Check Redis cache
      2. Si hit: return cached URL
      3. Si miss: generar con Pillow
      4. Upload a Supabase Storage
      5. Cache URL en Redis (86400s)
      6. Return { image_url, download_name }
    """
    redis = await get_redis()
    supabase = get_async_supabase_client()

    cache_key = f"image:poll:{poll_slug}:q{question_id}:{format_type}"

    # Check caché
    try:
        cached_data = await redis.cache_get(cache_key)
        if cached_data:
            try:
                cached_json = json.loads(cached_data) if isinstance(cached_data, str) else cached_data
                logger.info("Cache hit: %s", cache_key)
                return {**cached_json, "cached": True}
            except (json.JSONDecodeError, TypeError):
                logger.warning("Cache corrupted: %s", cache_key)
    except Exception as e:
        logger.warning("Redis unavailable: %s", str(e))

    # Fetch poll y votos
    poll_resp = await supabase.table("polls").select("*").eq("slug", poll_slug).single().execute()
    poll = poll_resp.data
    if not poll:
        raise ValueError(f"Poll not found: {poll_slug}")

    votes_resp = await supabase.table("poll_votes").select("option_value, voter_rank").eq("poll_id", poll["id"]).execute()
    votes = votes_resp.data or []

    verified_count = len([v for v in votes if v.get("voter_rank") == "VERIFIED"])
    total_votes = len(votes)

    # Calcular resultados
    question_results = _calculate_question_results(poll, question_id, votes)

    # Generar imagen
    width, height = _parse_format(format_type)
    image_bytes = _generate_image_pillow(
        poll_data=poll,
        question_results=question_results,
        width=width,
        height=height,
        verified_votes=verified_count,
        total_votes=total_votes,
    )

    # Upload a Storage
    timestamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    storage_path = f"polls/{poll['id']}/{question_id}/{format_type}_{timestamp}.png"

    supabase_anon = get_supabase_anon_async()
    await supabase_anon.storage.from_("encuestas").upload(storage_path, image_bytes, {
        "content-type": "image/png",
    })

    image_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/encuestas/{storage_path}"

    # Cache en Redis
    cache_data = {
        "image_url": image_url,
        "download_name": f"beacon-{poll_slug}-q{question_id}-{timestamp}.png",
    }
    try:
        await redis.cache_set(cache_key, json.dumps(cache_data), expire=86400)
    except Exception as e:
        logger.warning("Could not cache: %s", str(e))

    logger.info("Image generated: %s", cache_key)
    return {**cache_data, "cached": False}


def _generate_image_pillow(
    poll_data: dict,
    question_results: dict,
    width: int,
    height: int,
    verified_votes: int,
    total_votes: int,
) -> bytes:
    """Genera PNG con Pillow."""
    img = Image.new("RGB", (width, height), COLORS["bg"])
    draw = ImageDraw.Draw(img)

    # Aplicar background image si existe
    if poll_data.get("header_image"):
        try:
            bg_img = Image.open(io.BytesIO(urlopen(poll_data["header_image"]).read()))
            bg_img = bg_img.resize((width, height))
            bg_img = ImageFilter.GaussianBlur(radius=8)(bg_img)
            bg_img.putalpha(int(255 * 0.15))
            img.paste(bg_img, (0, 0), bg_img)
        except Exception as e:
            logger.warning("Could not load background: %s", str(e))

    y = 40
    font_title = _get_font(20, bold=True)
    font_label = _get_font(12)
    font_small = _get_font(11)

    # Header
    draw.text((40, y), "BEACON CHILE", fill=COLORS["accent_gold"], font=_get_font(14, bold=True))
    y += 30

    if poll_data.get("category"):
        draw.text((40, y), f"= {poll_data['category'].upper()}", fill=COLORS["text_secondary"], font=_get_font(11))
        y += 20

    draw.text((40, y), "✓ RESULTADOS VERIFICADOS", fill=COLORS["accent_green"], font=_get_font(11, bold=True))
    y += 30

    # QR (derecha)
    qr_url = _generate_qr_image(poll_data["slug"])
    img.paste(qr_url, (width - 140, 40))

    # Título pregunta
    question_text = question_results.get("question_text", "")
    lines = _wrap_text(question_text, font_title, width - 160)
    for line in lines:
        draw.text((40, y), line, fill=COLORS["text_primary"], font=font_title)
        y += 35

    y += 15

    # Resultados
    results = question_results.get("results", [])
    for result in results:
        option_label = result.get("option", "")
        pct = result.get("pct", 0)
        count = result.get("count", 0)

        # Etiqueta
        draw.text((40, y), option_label, fill=COLORS["text_primary"], font=font_small)
        draw.text((width - 150, y), f"{count} ({pct}%)", fill=COLORS["text_secondary"], font=_get_font(10))

        # Barra
        bar_y = y + 18
        bar_width = int((pct / 100) * (width - 120)) if pct > 0 else 1
        draw.rectangle([(40, bar_y), (40 + bar_width, bar_y + 8)], fill=COLORS["accent_cyan"])

        y += 28

    # Footer
    y_footer = height - 50
    draw.line([(40, y_footer), (width - 40, y_footer)], fill=COLORS["border"], width=1)

    draw.text((40, y_footer + 16), f"✓ {verified_votes} votos verificados", fill=COLORS["accent_green"], font=_get_font(11))
    draw.text((40, y_footer + 32), f"• {total_votes} votos totales", fill=COLORS["text_secondary"], font=_get_font(11))

    draw.text((width - 200, y_footer + 24), "beaconchile.cl", fill=COLORS["text_secondary"], font=_get_font(11))

    # Guardar a bytes
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _generate_qr_image(poll_slug: str, size: int = 120) -> Image.Image:
    """Genera QR como PIL Image."""
    qr = qrcode.QRCode(version=1, box_size=10, border=2)
    qr.add_data(f"https://beaconchile.cl/encuestas/{poll_slug}")
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    return qr_img.resize((size, size))


def _wrap_text(text: str, font, max_width: int) -> list:
    """Envuelve texto a múltiples líneas."""
    words = text.split()
    lines = []
    current_line = ""

    for word in words:
        test_line = f"{current_line} {word}".strip()
        bbox = ImageDraw.Draw(Image.new("RGB", (1, 1))).textbbox((0, 0), test_line, font=font)
        line_width = bbox[2] - bbox[0]

        if line_width > max_width:
            if current_line:
                lines.append(current_line)
            current_line = word
        else:
            current_line = test_line

    if current_line:
        lines.append(current_line)

    return lines


def _get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Obtiene fuente monospace con fallback."""
    fonts = [
        "C:\\Windows\\Fonts\\consola.ttf",  # Windows
        "/System/Library/Fonts/Monaco.dfont",  # Mac
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",  # Linux
    ]

    for font_path in fonts:
        try:
            return ImageFont.truetype(font_path, size)
        except Exception:
            pass

    return ImageFont.load_default()


def _calculate_question_results(poll: dict, question_id: str, votes: list) -> dict:
    """Calcula resultados para una pregunta."""
    questions = poll.get("questions", [])
    question = next((q for q in questions if q.get("id") == question_id), None)

    if not question:
        raise ValueError(f"Question not found: {question_id}")

    question_text = question.get("text", "")
    question_type = question.get("type", "multiple_choice")

    # Filtrar votos
    relevant_votes = []
    for vote in votes:
        opt_val = vote.get("option_value", "")
        try:
            parsed = json.loads(opt_val) if opt_val.startswith("{") else None
            if parsed and question_id in parsed:
                relevant_votes.append({"option": parsed[question_id], "voter_rank": vote.get("voter_rank")})
        except (json.JSONDecodeError, TypeError):
            if not opt_val.startswith("{"):
                relevant_votes.append({"option": opt_val, "voter_rank": vote.get("voter_rank")})

    option_counts = {}
    for vote in relevant_votes:
        opt = vote.get("option", "")
        option_counts[opt] = option_counts.get(opt, 0) + 1

    total = len(relevant_votes)

    # Para escala: incluir TODAS las opciones
    if question_type == "scale":
        scale_points = question.get("scale_points", 5)
        scale_labels = question.get("scale_labels", [])

        if not scale_labels or len(scale_labels) < scale_points:
            scale_labels = [str(i) for i in range(1, scale_points + 1)]

        results = []
        for i in range(1, scale_points + 1):
            count = option_counts.get(str(i), 0)
            pct = round((count / total * 100), 1) if total > 0 else 0
            label = scale_labels[i - 1] if i <= len(scale_labels) else str(i)

            results.append({
                "option": f"{i} — {label}",
                "count": count,
                "pct": pct,
            })

        return {
            "question_id": question_id,
            "question_text": question_text,
            "question_type": question_type,
            "results": results,
        }
    else:
        # Multiple choice
        results = [
            {
                "option": opt,
                "count": count,
                "pct": round((count / total * 100), 1) if total > 0 else 0,
            }
            for opt, count in sorted(option_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        return {
            "question_id": question_id,
            "question_text": question_text,
            "question_type": question_type,
            "results": results,
        }


def _parse_format(format_type: str) -> tuple:
    """Convierte "1080x1080" → (1080, 1080)."""
    return (1080, 1080) if format_type == "1080x1080" else (1200, 630)
