"""
BEACON PROTOCOL — Tests: GET /images/polls/{slug}/generate
==========================================================
El endpoint genera la imagen en cada petición (sin caché en el servidor) y la sirve como PNG
descargable con `Cache-Control: public, max-age=300` para la CDN y el navegador.
Usa el servicio real con un Supabase falso en memoria: sin red ni base de datos.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
import io
import pytest

from app.api.v1.endpoints import images
from app.services import image_service
from tests.test_image_service import POLL, PNG_MAGIC, _FakeSupabase, _vote

URL = f"/images/polls/{POLL['slug']}/generate"


@pytest.fixture
def client(monkeypatch):
    supabase = _FakeSupabase(polls=[POLL], votes=[_vote("Aprueba"), _vote("Desaprueba", rank="BASIC")])
    monkeypatch.setattr(image_service, "get_async_supabase_client", lambda: supabase)
    app = FastAPI()
    app.include_router(images.router)
    return TestClient(app)


class TestGenerateEndpoint:
    def test_devuelve_png_descargable_con_cache_control(self, client):
        res = client.get(URL, params={"question_id": "q1", "format": "1200x630"})
        assert res.status_code == 200
        assert res.headers["content-type"] == "image/png"
        assert res.headers["cache-control"] == "public, max-age=300"
        assert res.headers["content-disposition"].startswith("attachment; filename=beacon-")
        assert res.content.startswith(PNG_MAGIC)
        assert Image.open(io.BytesIO(res.content)).size == (1200, 630)

    def test_formato_por_defecto_es_cuadrado(self, client):
        res = client.get(URL, params={"question_id": "q1"})
        assert Image.open(io.BytesIO(res.content)).size == (1080, 1080)

    def test_tres_peticiones_seguidas_devuelven_imagen_no_vacia(self, client):
        for _ in range(3):
            res = client.get(URL, params={"question_id": "q1"})
            assert res.status_code == 200 and len(res.content) > 0
            assert res.headers["cache-control"] == "public, max-age=300"

    def test_encuesta_inexistente_es_404_y_no_se_cachea(self, client):
        res = client.get("/images/polls/no-existe/generate", params={"question_id": "q1"})
        assert res.status_code == 404
        assert "cache-control" not in res.headers

    def test_pregunta_inexistente_es_404_y_no_se_cachea(self, client):
        res = client.get(URL, params={"question_id": "no-existe"})
        assert res.status_code == 404
        assert "cache-control" not in res.headers

    def test_formato_invalido_es_422(self, client):
        res = client.get(URL, params={"question_id": "q1", "format": "800x600"})
        assert res.status_code == 422
        assert "cache-control" not in res.headers
