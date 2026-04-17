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
    "text_secondary": "#888888",
    "accent_gold": "#D4AF37",
    "accent_cyan": "#00E5FF",
    "accent_green": "#39FF14",
    "border": "#2A2A2A",
    "bar_track": "#1C1C1C",
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

    # Preparar respuesta (retornar bytes directamente)
    timestamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    download_name = f"beacon-{poll_slug}-q{question_id}-{timestamp}.png"

    response = {
        "image_bytes": image_bytes,
        "download_name": download_name,
        "cached": False,
    }

    # Cache en Redis (solo metadata)
    cache_data = {
        "download_name": download_name,
        "generated_at": timestamp,
    }
    try:
        await redis.cache_set(cache_key, json.dumps(cache_data), expire=86400)
    except Exception as e:
        logger.warning("Could not cache: %s", str(e))

    logger.info("Image generated: %s", cache_key)
    return response


def _generate_image_pillow(
    poll_data: dict,
    question_results: dict,
    width: int,
    height: int,
    verified_votes: int,
    total_votes: int,
) -> bytes:
    """Genera PNG con Pillow — diseño profesional según spec."""
    img = Image.new("RGB", (width, height), COLORS["bg"])
    draw = ImageDraw.Draw(img)

    # Aplicar background image con overlay oscuro
    if poll_data.get("header_image"):
        try:
            bg_img = Image.open(io.BytesIO(urlopen(poll_data["header_image"]).read()))
            bg_img = bg_img.convert("RGB").resize((width, height))
            bg_img = bg_img.filter(ImageFilter.GaussianBlur(radius=10))
            overlay = Image.new("RGB", (width, height), COLORS["bg"])
            img = Image.blend(bg_img, overlay, alpha=0.85)
            draw = ImageDraw.Draw(img)
        except Exception as e:
            logger.warning("Could not load background: %s", str(e))

    MARGIN = 60
    FOOTER_H = 170
    is_landscape = width > height

    # Fonts con tamaños según formato
    f_brand = _get_font(26, bold=True)
    f_category = _get_font(14)
    f_badge = _get_font(14, bold=True)
    q_size = 22 if is_landscape else 28
    f_question = _get_font(q_size, bold=True)
    f_option = _get_font(17)
    f_pct = _get_font(18, bold=True)
    f_footer = _get_font(18)
    f_footer_sm = _get_font(16)
    f_cta = _get_font(20, bold=True)

    # === HEADER ===
    y = 48
    draw.text((MARGIN, y), "BEACON CHILE", fill=COLORS["accent_gold"], font=f_brand)
    y += 38

    if poll_data.get("category"):
        draw.text((MARGIN, y), f"{poll_data['category'].upper()}", fill=COLORS["text_secondary"], font=f_category)
        y += 28
    else:
        y += 8

    draw.text((MARGIN, y), "RESULTADOS VERIFICADOS", fill=COLORS["accent_green"], font=f_badge)
    y += 34

    # Divider (cyan, más visible)
    draw.line([(MARGIN, y), (width - MARGIN, y)], fill=COLORS["accent_cyan"], width=2)
    y += 35

    # === QUESTION TITLE ===
    question_text = question_results.get("question_text", "")
    q_lines = _wrap_text(question_text, f_question, width - 2 * MARGIN)
    q_line_h = 36 if is_landscape else 38
    for line in q_lines:
        draw.text((MARGIN, y), line, fill=COLORS["text_primary"], font=f_question)
        y += q_line_h
    y += 20

    # === RESULTS ===
    results = question_results.get("results", [])
    n = len(results)

    # Calcular altura dinámica por opción (más compactas)
    available = height - y - FOOTER_H
    per_option_h = max(36, min(50, available // max(n, 1)))

    bar_x_start = MARGIN
    bar_x_end = width - MARGIN
    bar_max_w = bar_x_end - bar_x_start
    bar_h = 14

    # Encontrar ganador (máximo %)
    max_pct = max((r.get("pct", 0) for r in results), default=0)

    for result in results:
        label = result.get("option", "")
        pct = result.get("pct", 0)
        count = result.get("count", 0)
        is_winner = (pct == max_pct and pct > 0)

        bar_color = COLORS["accent_gold"] if is_winner else COLORS["accent_cyan"]

        # Label (sin símbolo, el color gold ya indica ganador)
        display_label = label
        pct_text = f"{pct}%"

        # Calcular ancho del % para right-align
        pct_bbox = draw.textbbox((0, 0), pct_text, font=f_pct)
        pct_w = pct_bbox[2] - pct_bbox[0]

        # Dibujar label + pct en la misma fila
        draw.text((MARGIN, y), display_label, fill=COLORS["text_primary"], font=f_option)
        draw.text((width - MARGIN - pct_w, y), pct_text, fill=bar_color, font=f_pct)

        label_h = 20
        bar_y = y + label_h + 5

        # Track (fondo)
        draw.rounded_rectangle(
            [(bar_x_start, bar_y), (bar_x_end, bar_y + bar_h)],
            radius=7,
            fill=COLORS["bar_track"]
        )

        # Fill (barra)
        if pct > 0:
            fill_w = int(pct / 100 * bar_max_w)
        else:
            fill_w = 4

        draw.rounded_rectangle(
            [(bar_x_start, bar_y), (bar_x_start + fill_w, bar_y + bar_h)],
            radius=7,
            fill=bar_color
        )

        y += per_option_h

    # === CTA PANEL (antes del footer, como "flotante") ===
    y_cta = height - FOOTER_H

    # Panel visual (línea divisoria sutil arriba)
    draw.line([(MARGIN, y_cta), (width - MARGIN, y_cta)], fill=COLORS["border"], width=1)
    y_cta += 8

    # CTA: 20px bold, gold, muy agresivo
    cta_text = "¿Estás de acuerdo? ¿Quieres dar tu opinión?\nIngresa a beaconchile.cl y dinos qué piensas"
    cta_lines = cta_text.split("\n")
    for line in cta_lines:
        draw.text((MARGIN, y_cta), line, fill=COLORS["accent_gold"], font=f_cta)
        y_cta += 24

    y_cta += 8

    # === FOOTER (votos) ===
    # Línea divisoria
    draw.line([(MARGIN, y_cta), (width - MARGIN, y_cta)], fill=COLORS["border"], width=1)
    y_cta += 10

    # Votos verificados (importante, verde) + dominio en la misma fila
    draw.text((MARGIN, y_cta), f"{verified_votes} votos verificados", fill=COLORS["accent_green"], font=f_footer)

    domain = "beaconchile.cl"
    domain_bbox = draw.textbbox((0, 0), domain, font=f_footer_sm)
    domain_w = domain_bbox[2] - domain_bbox[0]
    draw.text((width - MARGIN - domain_w, y_cta), domain, fill=COLORS["text_secondary"], font=f_footer_sm)

    # Votos totales (secundario, más visible)
    y_cta += 30
    draw.text((MARGIN, y_cta), f"• {total_votes} votos totales", fill="#777777", font=f_footer_sm)

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
    """Obtiene fuente proporcional (Segoe UI / Arial) con fallback a monospace."""
    fonts_bold = [
        "C:\\Windows\\Fonts\\segoeuib.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
        "C:\\Windows\\Fonts\\calibrib.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    fonts_regular = [
        "C:\\Windows\\Fonts\\segoeui.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
        "C:\\Windows\\Fonts\\calibri.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]

    font_list = fonts_bold if bold else fonts_regular
    for font_path in font_list:
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
        # Multiple choice: mostrar TODAS las opciones disponibles
        all_options = question.get("options", [])

        results = []
        for opt in all_options:
            count = option_counts.get(opt, 0)
            pct = round((count / total * 100), 1) if total > 0 else 0

            results.append({
                "option": opt,
                "count": count,
                "pct": pct,
            })

        # Ordenar por votos descendente (0% al final)
        results.sort(key=lambda x: x["count"], reverse=True)

        return {
            "question_id": question_id,
            "question_text": question_text,
            "question_type": question_type,
            "results": results,
        }


def _parse_format(format_type: str) -> tuple:
    """Convierte "1080x1080" → (1080, 1080)."""
    return (1080, 1080) if format_type == "1080x1080" else (1200, 630)
