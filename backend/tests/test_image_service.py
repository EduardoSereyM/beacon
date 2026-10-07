"""
BEACON PROTOCOL — Tests de humo: servicio de imagen de resultados
=================================================================
Cubre `generate_and_cache_poll_image` y sus helpers (`_wrap_text`, `_get_font`,
`_calculate_question_results`, `_parse_format`). Sin red ni base de datos: datos
sintéticos, un Supabase mínimo en memoria y un Redis falso. El tamaño y el formato
de la imagen se verifican abriendo el PNG con Pillow.
"""

import io
import json

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.services import image_service
from app.services.image_service import (
    _calculate_question_results,
    _get_font,
    _parse_format,
    _wrap_text,
    generate_and_cache_poll_image,
)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

QUESTION_MC = {
    "id": "q1",
    "text": "¿Aprueba la gestión del Presidente?",
    "type": "multiple_choice",
    "options": ["Aprueba", "Desaprueba", "No sabe"],
}
QUESTION_SCALE = {
    "id": "q2",
    "text": "Del 1 al 5, ¿cómo evalúa la economía?",
    "type": "scale",
    "scale_points": 5,
    "scale_labels": ["Muy mala", "Mala", "Regular", "Buena", "Muy buena"],
}
POLL = {
    "id": "poll-1",
    "slug": "encuesta-de-prueba",
    "title": "Encuesta de prueba",
    "category": "politica",
    "questions": [QUESTION_MC, QUESTION_SCALE],
}


def _vote(option, rank="VERIFIED", question_id="q1", legacy=False):
    """Voto como lo guarda poll_votes: JSON por pregunta (o texto plano en votos antiguos)."""
    value = option if legacy else json.dumps({question_id: option})
    return {"option_value": value, "voter_rank": rank}


# ═══ Dobles de prueba ═══

class _Resp:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, db, name):
        self.db, self.name, self.filters, self.one = db, name, {}, False

    def select(self, *_):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def single(self):
        self.one = True
        return self

    async def execute(self):
        rows = [r for r in self.db.get(self.name, []) if all(r.get(k) == v for k, v in self.filters.items())]
        if self.one:
            return _Resp(rows[0] if rows else None)
        return _Resp(rows)


class _FakeSupabase:
    """Solo lo que usa el servicio: polls (.single) y poll_votes (lista)."""

    def __init__(self, polls=None, votes=None):
        self.db = {"polls": polls or [], "poll_votes": votes or []}
        self.used = False

    def table(self, name):
        self.used = True
        return _Table(self.db, name)


class _FakeRedis:
    def __init__(self, cached=None, fail=False):
        self.cached, self.fail, self.sets = cached, fail, []

    async def cache_get(self, key):
        if self.fail:
            raise ConnectionError("redis caído")
        return self.cached

    async def cache_set(self, key, value, expire=3600):
        if self.fail:
            raise ConnectionError("redis caído")
        self.sets.append((key, value, expire))


@pytest.fixture
def servicio(monkeypatch):
    """Instala Supabase y Redis falsos en el módulo; devuelve (supabase, redis, instalar)."""
    estado = {}

    def instalar(supabase=None, redis=None):
        estado["supabase"] = supabase or _FakeSupabase(polls=[POLL], votes=[])
        estado["redis"] = redis or _FakeRedis()

        async def _get_redis():
            return estado["redis"]

        monkeypatch.setattr(image_service, "get_async_supabase_client", lambda: estado["supabase"])
        monkeypatch.setattr(image_service, "get_redis", _get_redis)
        return estado["supabase"], estado["redis"]

    return instalar


def _abrir(png_bytes):
    assert png_bytes.startswith(PNG_MAGIC)
    img = Image.open(io.BytesIO(png_bytes))
    img.load()  # decodifica todo el PNG: falla si está truncado
    return img


# ═══ _parse_format ═══

class TestParseFormat:
    def test_cuadrado(self):
        assert _parse_format("1080x1080") == (1080, 1080)

    def test_horizontal(self):
        assert _parse_format("1200x630") == (1200, 630)

    def test_valor_invalido_cae_al_horizontal(self):
        # Comportamiento actual (no lanza): cualquier otro valor se trata como 1200x630.
        # El endpoint ya rechaza formatos inválidos con 400 antes de llegar aquí.
        assert _parse_format("800x600") == (1200, 630)
        assert _parse_format("") == (1200, 630)


# ═══ _get_font ═══

class TestGetFont:
    @pytest.mark.parametrize("bold", [False, True])
    def test_devuelve_una_fuente_utilizable(self, bold):
        font = _get_font(20, bold=bold)
        bbox = ImageDraw.Draw(Image.new("RGB", (1, 1))).textbbox((0, 0), "Beacon", font=font)
        assert bbox[2] - bbox[0] > 0

    def test_si_ninguna_fuente_carga_usa_la_de_respaldo(self, monkeypatch):
        real = ImageFont.truetype

        def sin_fuentes(font, *args, **kwargs):
            if isinstance(font, str):  # las rutas de archivo del sistema no existen
                raise OSError("sin fuentes")
            return real(font, *args, **kwargs)  # la fuente de respaldo de Pillow se carga desde memoria

        monkeypatch.setattr(image_service.ImageFont, "truetype", sin_fuentes)
        font = _get_font(20, bold=True)
        bbox = ImageDraw.Draw(Image.new("RGB", (1, 1))).textbbox((0, 0), "Beacon", font=font)
        assert bbox[2] - bbox[0] > 0
        assert isinstance(font, (ImageFont.ImageFont, ImageFont.FreeTypeFont))


# ═══ _wrap_text ═══

def _ancho(texto, font):
    bbox = ImageDraw.Draw(Image.new("RGB", (1, 1))).textbbox((0, 0), texto, font=font)
    return bbox[2] - bbox[0]


class TestWrapText:
    def test_texto_largo_se_divide_en_varias_lineas_que_caben(self):
        font = _get_font(20)
        texto = "Beacon mide la opinión ciudadana de Chile con identidad verificada " * 3
        lineas = _wrap_text(texto, font, max_width=300)
        assert len(lineas) > 1
        assert all(_ancho(linea, font) <= 300 for linea in lineas)
        assert " ".join(lineas).split() == texto.split()  # no se pierde ni se reordena ninguna palabra

    def test_texto_corto_queda_en_una_linea(self):
        assert _wrap_text("Hola Chile", _get_font(20), max_width=600) == ["Hola Chile"]

    def test_texto_vacio_o_solo_espacios(self):
        font = _get_font(20)
        assert _wrap_text("", font, max_width=300) == []
        assert _wrap_text("   \n  ", font, max_width=300) == []

    def test_una_palabra_mas_ancha_que_el_maximo_va_sola_sin_perderse(self):
        font = _get_font(20)
        lineas = _wrap_text("corto " + "x" * 80 + " fin", font, max_width=100)
        assert "x" * 80 in lineas
        assert lineas[0] == "corto" and lineas[-1] == "fin"


# ═══ _calculate_question_results ═══

class TestCalculateQuestionResults:
    def test_opcion_unica_cuenta_porcentajes_y_ordena_por_votos(self):
        votos = [_vote("Desaprueba"), _vote("Desaprueba"), _vote("Aprueba"), _vote("Desaprueba")]
        res = _calculate_question_results(POLL, "q1", votos)
        assert res["question_type"] == "multiple_choice" and res["question_text"] == QUESTION_MC["text"]
        assert [(r["option"], r["count"], r["pct"]) for r in res["results"]] == [
            ("Desaprueba", 3, 75.0), ("Aprueba", 1, 25.0), ("No sabe", 0, 0),
        ]

    def test_sin_votos_todas_las_opciones_en_cero(self):
        res = _calculate_question_results(POLL, "q1", [])
        assert [r["option"] for r in res["results"]] == ["Aprueba", "Desaprueba", "No sabe"]
        assert all(r["count"] == 0 and r["pct"] == 0 for r in res["results"])

    def test_solo_cuenta_los_votos_de_esa_pregunta(self):
        votos = [_vote("Aprueba"), _vote("3", question_id="q2"), {"option_value": json.dumps({"q1": "Aprueba", "q2": "5"})}]
        res = _calculate_question_results(POLL, "q1", votos)
        assert res["results"][0]["option"] == "Aprueba" and res["results"][0]["count"] == 2
        scale = _calculate_question_results(POLL, "q2", votos)
        assert sum(r["count"] for r in scale["results"]) == 2

    def test_voto_en_texto_plano_hoy_no_se_cuenta(self):
        # Caracterización del comportamiento actual, no un contrato deseado: el `except` que pretende contar
        # votos antiguos en texto plano nunca se ejecuta (el `else None` evita que json.loads falle), así que
        # esos votos quedan fuera. Si se decide contarlos, este test se actualiza.
        res = _calculate_question_results(POLL, "q1", [_vote("Aprueba", legacy=True)])
        assert all(r["count"] == 0 and r["pct"] == 0 for r in res["results"])

    def test_escala_incluye_todos_los_puntos_con_su_etiqueta(self):
        votos = [_vote("5", question_id="q2"), _vote("5", question_id="q2"), _vote("1", question_id="q2")]
        res = _calculate_question_results(POLL, "q2", votos)
        assert res["question_type"] == "scale"
        assert [r["option"] for r in res["results"]] == [
            "1 — Muy mala", "2 — Mala", "3 — Regular", "4 — Buena", "5 — Muy buena",
        ]
        assert [r["count"] for r in res["results"]] == [1, 0, 0, 0, 2]
        assert res["results"][4]["pct"] == pytest.approx(66.7)

    def test_escala_sin_etiquetas_usa_los_numeros(self):
        poll = {"questions": [{"id": "q", "text": "t", "type": "scale", "scale_points": 3}]}
        res = _calculate_question_results(poll, "q", [])
        assert [r["option"] for r in res["results"]] == ["1 — 1", "2 — 2", "3 — 3"]
        assert all(r["pct"] == 0 for r in res["results"])

    def test_pregunta_inexistente_lanza_value_error(self):
        with pytest.raises(ValueError, match="Question not found"):
            _calculate_question_results(POLL, "no-existe", [])


# ═══ generate_and_cache_poll_image ═══

class TestGenerateAndCachePollImage:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("formato,tamano", [("1080x1080", (1080, 1080)), ("1200x630", (1200, 630))])
    async def test_png_valido_con_el_tamano_del_formato(self, servicio, formato, tamano):
        votos = [_vote("Aprueba"), _vote("Desaprueba", rank="BASIC"), _vote("Aprueba")]
        servicio(_FakeSupabase(polls=[POLL], votes=votos))
        res = await generate_and_cache_poll_image(POLL["slug"], "q1", formato)
        img = _abrir(res["image_bytes"])
        assert img.format == "PNG" and img.mode == "RGB" and img.size == tamano
        assert res["cached"] is False
        assert res["download_name"].startswith(f"beacon-{POLL['slug']}-qq1-") and res["download_name"].endswith(".png")

    @pytest.mark.asyncio
    async def test_pregunta_de_escala(self, servicio):
        votos = [_vote("4", question_id="q2"), _vote("5", question_id="q2", rank="BASIC")]
        servicio(_FakeSupabase(polls=[POLL], votes=votos))
        res = await generate_and_cache_poll_image(POLL["slug"], "q2", "1080x1080")
        assert _abrir(res["image_bytes"]).size == (1080, 1080)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("pregunta", ["q1", "q2"])
    async def test_sin_votos_genera_la_imagen_con_0_por_ciento(self, servicio, pregunta):
        servicio(_FakeSupabase(polls=[POLL], votes=[]))
        res = await generate_and_cache_poll_image(POLL["slug"], pregunta, "1200x630")
        assert _abrir(res["image_bytes"]).size == (1200, 630)

    @pytest.mark.asyncio
    async def test_guarda_en_cache_solo_metadatos_por_24_horas(self, servicio):
        _, redis = servicio(_FakeSupabase(polls=[POLL], votes=[_vote("Aprueba")]))
        res = await generate_and_cache_poll_image(POLL["slug"], "q1", "1080x1080")
        assert len(redis.sets) == 1
        clave, valor, expira = redis.sets[0]
        assert clave == f"image:poll:{POLL['slug']}:qq1:1080x1080" and expira == 86400
        assert json.loads(valor)["download_name"] == res["download_name"]
        assert "image_bytes" not in json.loads(valor)

    @pytest.mark.asyncio
    async def test_acierto_de_cache_no_toca_la_base(self, servicio):
        cacheado = json.dumps({"download_name": "beacon-x.png", "generated_at": "2026-10-07T00-00-00"})
        supabase, _ = servicio(_FakeSupabase(polls=[POLL]), _FakeRedis(cached=cacheado))
        res = await generate_and_cache_poll_image(POLL["slug"], "q1", "1080x1080")
        assert res["cached"] is True and res["download_name"] == "beacon-x.png"
        assert supabase.used is False

    @pytest.mark.asyncio
    @pytest.mark.xfail(strict=True, reason="Defecto conocido: la caché guarda solo metadatos, así que un acierto de "
                                           "caché no trae image_bytes y el endpoint serviría un archivo vacío. "
                                           "Quitar este xfail cuando se corrija.")
    async def test_acierto_de_cache_debe_traer_la_imagen(self, servicio):
        cacheado = json.dumps({"download_name": "beacon-x.png", "generated_at": "2026-10-07T00-00-00"})
        servicio(_FakeSupabase(polls=[POLL]), _FakeRedis(cached=cacheado))
        res = await generate_and_cache_poll_image(POLL["slug"], "q1", "1080x1080")
        assert res.get("image_bytes")

    @pytest.mark.asyncio
    async def test_cache_corrupta_se_ignora_y_se_genera(self, servicio):
        servicio(_FakeSupabase(polls=[POLL], votes=[]), _FakeRedis(cached="{no es json"))
        res = await generate_and_cache_poll_image(POLL["slug"], "q1", "1080x1080")
        assert res["cached"] is False and _abrir(res["image_bytes"]).size == (1080, 1080)

    @pytest.mark.asyncio
    async def test_redis_caido_no_impide_generar(self, servicio):
        servicio(_FakeSupabase(polls=[POLL], votes=[]), _FakeRedis(fail=True))
        res = await generate_and_cache_poll_image(POLL["slug"], "q1", "1200x630")
        assert res["cached"] is False and _abrir(res["image_bytes"]).size == (1200, 630)

    @pytest.mark.asyncio
    async def test_imagen_de_cabecera_inaccesible_no_rompe_la_generacion(self, servicio, monkeypatch):
        def sin_red(*_args, **_kwargs):
            raise OSError("sin red")

        monkeypatch.setattr(image_service, "urlopen", sin_red)
        poll = {**POLL, "header_image": "https://ejemplo.invalid/cabecera.png"}
        servicio(_FakeSupabase(polls=[poll], votes=[_vote("Aprueba")]))
        res = await generate_and_cache_poll_image(poll["slug"], "q1", "1080x1080")
        assert _abrir(res["image_bytes"]).size == (1080, 1080)

    @pytest.mark.asyncio
    async def test_encuesta_inexistente_lanza_value_error(self, servicio):
        servicio(_FakeSupabase(polls=[], votes=[]))
        with pytest.raises(ValueError, match="Poll not found"):
            await generate_and_cache_poll_image("no-existe", "q1", "1080x1080")

    @pytest.mark.asyncio
    async def test_pregunta_inexistente_lanza_value_error(self, servicio):
        servicio(_FakeSupabase(polls=[POLL], votes=[]))
        with pytest.raises(ValueError, match="Question not found"):
            await generate_and_cache_poll_image(POLL["slug"], "no-existe", "1080x1080")
