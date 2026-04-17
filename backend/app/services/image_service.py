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
import io
import json
from datetime import datetime, timezone
from typing import Optional, Literal
from pathlib import Path
from urllib.request import urlopen

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import qrcode

from app.core.database import get_async_supabase_client, get_supabase_anon_async
from app.core.redis_client import get_redis
from app.core.config import settings

logger = logging.getLogger("beacon.image_generation")

# ─── Constantes ───────────────────────────────────────────────────────────
COLORS = {
    "bg": "#0A0A0A",
    "text_primary": "#FFFFFF",
    "text_secondary": "#999999",
    "accent_gold": "#D4AF37",
    "accent_green": "#39FF14",
    "border": "#333333",
}

FORMATS = {
    "1080x1080": (1080, 1080),
    "1200x630": (1200, 630),
}

MAX_OPTIONS_DISPLAYED = 10


class PollImageGenerator:
    """
    Generador de imágenes PNG para resultados de encuestas.

    Soporta múltiples preguntas, escalas, y opciones múltiples.
    """

    def __init__(
        self,
        poll_data: dict,
        question_id: str,
        question_results: dict,
        format_type: Literal["1080x1080", "1200x630"] = "1080x1080",
        verified_votes: int = 0,
        total_votes: int = 0,
    ):
        """
        Args:
            poll_data: {id, slug, title, category, header_image, ...}
            question_id: ID de la pregunta a renderizar
            question_results: {question_text, question_type, results: [...]}
            format_type: Tamaño de la imagen
            verified_votes: Votos verificados totales de la encuesta
            total_votes: Votos totales
        """
        self.poll = poll_data
        self.question_id = question_id
        self.question_results = question_results
        self.format_type = format_type
        self.verified_votes = verified_votes
        self.total_votes = total_votes

        self.width, self.height = FORMATS.get(format_type, (1080, 1080))
        self.image: Optional[Image.Image] = None
        self.draw: Optional[ImageDraw.ImageDraw] = None

    async def generate_image(self) -> bytes:
        """
        Genera PNG completo y retorna bytes.

        Flujo:
          1. Crear canvas base (fondo oscuro)
          2. Cargar + aplicar header_image (blur + opacidad)
          3. Renderizar elementos (logo, título, gráfico, stats, QR)
          4. Guardar como PNG in-memory
          5. Retornar bytes
        """
        try:
            # Crear canvas base
            self._create_base_canvas()

            # Aplicar background image con blur/opacidad si existe
            if self.poll.get("header_image"):
                await self._apply_background_image()

            # Renderizar contenido
            self._render_header()
            self._render_question_title()
            self._render_results_chart()
            self._render_stats()
            self._render_footer()
            await self._render_qr()

            # Guardar a buffer
            buffer = io.BytesIO()
            self.image.save(buffer, format="PNG", optimize=True)
            buffer.seek(0)

            logger.info("Imagen generada: poll=%s q=%s format=%s", self.poll.get("id"), self.question_id, self.format_type)
            return buffer.getvalue()

        except Exception as e:
            logger.error("Error generando imagen: %s", str(e), exc_info=True)
            raise RuntimeError(f"Error en generación de imagen: {str(e)}")

    def _create_base_canvas(self):
        """Crea canvas base con fondo oscuro."""
        self.image = Image.new("RGB", (self.width, self.height), color="#0A0A0A")
        self.draw = ImageDraw.Draw(self.image, "RGBA")

    async def _apply_background_image(self):
        """Carga header_image, aplica blur + opacidad, y la coloca como fondo."""
        try:
            header_url = self.poll.get("header_image")
            if not header_url:
                return

            # Descargar imagen desde URL (sync, pero es OK porque es I/O bound)
            try:
                with urlopen(header_url, timeout=5) as response:
                    img_bytes = response.read()
            except Exception as e:
                logger.warning("No se pudo cargar header_image: %s", str(e))
                return

            # Abrir imagen y redimensionar al tamaño de canvas
            bg = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            bg = bg.resize((self.width, self.height), Image.Resampling.LANCZOS)

            # Aplicar blur
            bg = bg.filter(ImageFilter.GaussianBlur(radius=15))

            # Reducir opacidad (oscurecer)
            # Crear overlay semi-transparente
            overlay = Image.new("RGBA", (self.width, self.height), (10, 10, 10, 180))
            bg = bg.convert("RGBA")
            bg = Image.alpha_composite(bg, overlay)
            bg = bg.convert("RGB")

            # Pegar sobre canvas
            self.image.paste(bg, (0, 0))
            self.draw = ImageDraw.Draw(self.image, "RGBA")

        except Exception as e:
            logger.warning("Error aplicando background_image: %s", str(e))
            # Continuar sin background

    def _render_header(self):
        """Renderiza cabecera: logo BEACON + categoria + tag RESULTADOS VERIFICADOS."""
        y_offset = 30

        # Logo BEACON (texto simple)
        text_header = "BEACON CHILE"
        self.draw.text(
            (40, y_offset),
            text_header,
            fill="#D4AF37",
            font=self._get_font(14, bold=True),
        )

        # Tag de categoría
        category = self.poll.get("category", "general").upper()
        self.draw.text(
            (40, y_offset + 30),
            f"📊 {category}",
            fill="#999999",  # Gray instead of rgba
            font=self._get_font(11),
        )

        # Badge "RESULTADOS VERIFICADOS"
        self.draw.text(
            (40, y_offset + 55),
            "✓ RESULTADOS VERIFICADOS",
            fill="#39FF14",
            font=self._get_font(11, bold=True),
        )

    def _render_question_title(self):
        """Renderiza título de la pregunta (multi-línea si es necesario)."""
        title = self.question_results.get("question_text", "")
        y_offset = 140

        # Texto más grande, ancho limitado para wrapping
        font = self._get_font(18, bold=True)
        max_width = self.width - 80

        lines = self._wrap_text(title, font, max_width)
        for line in lines:
            self.draw.text((40, y_offset), line, fill="#FFFFFF", font=font)
            y_offset += 35

    def _render_results_chart(self):
        """Renderiza gráfico de resultados (barras horizontales)."""
        results = self.question_results.get("results", [])
        question_type = self.question_results.get("question_type", "multiple_choice")

        if not results:
            return

        y_offset = 280

        # Limitar a MAX_OPTIONS_DISPLAYED opciones
        if len(results) > MAX_OPTIONS_DISPLAYED:
            results = results[:MAX_OPTIONS_DISPLAYED]

        bar_height = 20
        bar_spacing = 20

        for result in results:
            option_label = result.get("option", "")
            pct = result.get("pct", 0)
            count = result.get("count", 0)

            # Para escala: formato "1 — Nada confiado"
            if question_type == "scale":
                # option_label es "1 — Nada confiado" ya
                text_label = option_label
            else:
                text_label = option_label

            # Barra de porcentaje
            bar_width = int((pct / 100) * (self.width - 120)) if pct > 0 else 1
            bar_color = "#00E5FF" if question_type == "scale" else "#D4AF37"

            # Texto: etiqueta
            self.draw.text(
                (40, y_offset),
                text_label,
                fill="#FFFFFF",
                font=self._get_font(11),
            )

            # Barra de resultado (más pequeña, debajo del texto)
            bar_y = y_offset + 18
            self.draw.rectangle(
                [(40, bar_y), (40 + bar_width, bar_y + 8)],
                fill=bar_color,
            )

            # Porcentaje + votos (derecha)
            pct_text = f"{count} ({pct}%)" if count > 0 else f"0 (0%)"
            self.draw.text(
                (self.width - 150, y_offset),
                pct_text,
                fill="#999999",
                font=self._get_font(10),
            )

            y_offset += bar_height + bar_spacing

    def _render_stats(self):
        """Renderiza estadísticas: votos verificados y totales."""
        y_offset = self.height - 140

        # Votos verificados
        verified_text = f"✓ {self.verified_votes} votos verificados"
        self.draw.text(
            (40, y_offset),
            verified_text,
            fill="#39FF14",
            font=self._get_font(11, bold=True),
        )

        # Votos totales
        total_text = f"• {self.total_votes} votos totales"
        self.draw.text(
            (40, y_offset + 30),
            total_text,
            fill="#CCCCCC",
            font=self._get_font(11),
        )

    def _render_footer(self):
        """Renderiza footer: beaconchile.cl + fecha."""
        y_offset = self.height - 40

        footer_text = "beaconchile.cl"
        self.draw.text(
            (40, y_offset),
            footer_text,
            fill="#D4AF37",
            font=self._get_font(10),
        )

    async def _render_qr(self):
        """Renderiza QR code en esquina superior derecha."""
        poll_slug = self.poll.get("slug", "")
        qr_url = f"https://beaconchile.cl/encuestas/{poll_slug}"

        # Generar QR
        qr = qrcode.QRCode(version=1, box_size=5, border=1)
        qr.add_data(qr_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="white", back_color="#0A0A0A")

        # Dimensionar QR (120x120 px)
        qr_size = 120
        qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.LANCZOS)

        # Colocar en esquina superior derecha
        x = self.width - qr_size - 30
        y = 30

        # Pegar QR
        if qr_img.mode != "RGB":
            qr_img = qr_img.convert("RGB")
        self.image.paste(qr_img, (x, y))

    def _get_font(self, size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
        """
        Obtiene fuente monospace.
        Fallback a fuente por defecto si no existe archivo.
        """
        # Posibles rutas de fuentes según SO
        font_paths = [
            "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
            "/System/Library/Fonts/Monaco.ttf",  # macOS
            "C:\\Windows\\Fonts\\courbd.ttf" if bold else "C:\\Windows\\Fonts\\cour.ttf",  # Windows
        ]

        for font_path in font_paths:
            try:
                return ImageFont.truetype(font_path, size)
            except (OSError, IOError):
                continue

        # Fallback final: fuente por defecto de PIL
        try:
            return ImageFont.load_default(size=size)
        except TypeError:
            return ImageFont.load_default()

    def _wrap_text(self, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
        """
        Divide texto en múltiples líneas para que quepa en max_width.
        Simplificado: divide por palabras.
        """
        words = text.split()
        lines = []
        current_line = ""

        for word in words:
            test_line = f"{current_line} {word}".strip()
            bbox = self.draw.textbbox((0, 0), test_line, font=font)
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

    Returns:
        {
            "image_url": "https://storage.supabase.co/...",
            "download_name": "beacon-{slug}-q{number}-{timestamp}.png",
            "cached": True|False
        }
    """
    redis = await get_redis()
    supabase = get_async_supabase_client()

    # Key de caché
    cache_key = f"image:poll:{poll_slug}:q{question_id}:{format_type}"

    # 1. Check caché (optional - si Redis falla, continuar sin caché)
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
        logger.warning("Redis unavailable, proceeding without cache: %s", str(e))

    # 2. Fetch poll
    poll_resp = await supabase.table("polls").select("*").eq("slug", poll_slug).single().execute()
    poll = poll_resp.data
    if not poll:
        raise ValueError(f"Poll not found: {poll_slug}")

    # 3. Fetch votos
    votes_resp = await supabase.table("poll_votes").select("option_value, voter_rank").eq("poll_id", poll["id"]).execute()
    votes = votes_resp.data or []

    # Separar verified/basic
    verified_votes = [v for v in votes if v.get("voter_rank") == "VERIFIED"]
    total_votes = len(votes)
    verified_count = len(verified_votes)

    # 4. Calcular resultados por pregunta
    question_results = _calculate_question_results(poll, question_id, votes)

    # 5. Generar imagen
    generator = PollImageGenerator(
        poll_data=poll,
        question_id=question_id,
        question_results=question_results,
        format_type=format_type,
        verified_votes=verified_count,
        total_votes=total_votes,
    )
    image_bytes = await generator.generate_image()

    # 6. Upload a Supabase Storage (usar anon client para bucket PUBLIC)
    timestamp = datetime.now(timezone.utc).isoformat().replace(":", "-")
    storage_path = f"polls/{poll['id']}/{question_id}/{format_type}_{timestamp}.png"

    supabase_anon = get_supabase_anon_async()
    await supabase_anon.storage.from_("encuestas").upload(storage_path, image_bytes, {
        "content-type": "image/png",
    })

    # 7. Construir URL pública manualmente
    image_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/encuestas/{storage_path}"

    # 8. Cache en Redis (optional)
    cache_data = {
        "image_url": image_url,
        "download_name": f"beacon-{poll_slug}-q{question_id}-{timestamp}.png",
    }
    try:
        await redis.cache_set(cache_key, json.dumps(cache_data), expire=86400)
    except Exception as e:
        logger.warning("Could not cache image: %s", str(e))

    logger.info("Imagen generada: %s", cache_key)
    return {**cache_data, "cached": False}


def _calculate_question_results(poll: dict, question_id: str, votes: list) -> dict:
    """
    Calcula resultados para una pregunta específica.

    Args:
        poll: Datos de la encuesta
        question_id: ID de la pregunta
        votes: Lista de votos [{option_value, voter_rank}, ...]

    Returns:
        {
            "question_id": "...",
            "question_text": "...",
            "question_type": "multiple_choice|scale",
            "results": [...],
            "average": 3.5 (solo para scale)
        }
    """
    # Buscar pregunta en poll.questions
    questions = poll.get("questions", [])
    question = next((q for q in questions if q.get("id") == question_id), None)

    if not question:
        raise ValueError(f"Question not found: {question_id}")

    question_text = question.get("text", "")
    question_type = question.get("type", "multiple_choice")

    # Filtrar votos por pregunta
    relevant_votes = []
    for vote in votes:
        opt_val = vote.get("option_value", "")
        try:
            # Intentar parsear como JSON (multi-pregunta)
            parsed = json.loads(opt_val) if opt_val.startswith("{") else None
            if parsed and question_id in parsed:
                relevant_votes.append({"option": parsed[question_id], "voter_rank": vote.get("voter_rank")})
        except (json.JSONDecodeError, TypeError):
            # No es JSON, asumir single-question
            if not opt_val.startswith("{"):
                relevant_votes.append({"option": opt_val, "voter_rank": vote.get("voter_rank")})

    # Agregar por opción
    option_counts = {}
    for vote in relevant_votes:
        opt = vote.get("option", "")
        option_counts[opt] = option_counts.get(opt, 0) + 1

    total = len(relevant_votes)

    # Para escala: incluir TODAS las opciones (1 a scale_points)
    if question_type == "scale":
        scale_points = question.get("scale_points", 5)
        scale_labels = question.get("scale_labels", [])

        # Si no hay etiquetas, usar índices
        if not scale_labels or len(scale_labels) < scale_points:
            scale_labels = [str(i) for i in range(1, scale_points + 1)]

        results = []
        sum_votes = 0

        for i in range(1, scale_points + 1):
            count = option_counts.get(str(i), 0)
            pct = round((count / total * 100), 1) if total > 0 else 0

            label = scale_labels[i - 1] if i <= len(scale_labels) else str(i)
            option_str = f"{i} — {label}"

            results.append({
                "option": option_str,
                "count": count,
                "pct": pct,
            })

            sum_votes += count * i

        # Calcular promedio
        average = (sum_votes / total) if total > 0 else 0

        return {
            "question_id": question_id,
            "question_text": question_text,
            "question_type": question_type,
            "results": results,
            "average": average,
        }
    else:
        # Multiple choice: solo opciones con votos
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
