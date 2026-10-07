"""
BEACON PROTOCOL — Tests: URL del QR de resultados
=================================================
El QR de la imagen para compartir apunta a la encuesta bajo settings.FRONTEND_URL
(ya no a un dominio fijo). Sin red ni Supabase.
"""

from app.services import image_service
from app.services.image_service import _generate_qr_image, poll_public_url


class TestPollPublicUrl:
    def test_usa_frontend_url(self, monkeypatch):
        monkeypatch.setattr(image_service.settings, "FRONTEND_URL", "https://www.beaconchile.cl")
        assert poll_public_url("aprobacion-2026-10") == "https://www.beaconchile.cl/encuestas/aprobacion-2026-10"

    def test_ignora_la_barra_final(self, monkeypatch):
        monkeypatch.setattr(image_service.settings, "FRONTEND_URL", "https://www.beaconchile.cl/")
        assert poll_public_url("x") == "https://www.beaconchile.cl/encuestas/x"

    def test_entorno_local(self, monkeypatch):
        monkeypatch.setattr(image_service.settings, "FRONTEND_URL", "http://localhost:3000")
        assert poll_public_url("x") == "http://localhost:3000/encuestas/x"


class TestQrImage:
    def test_el_qr_codifica_la_url_dinamica(self, monkeypatch):
        monkeypatch.setattr(image_service.settings, "FRONTEND_URL", "https://staging.example.cl")
        captured = []
        real = image_service.qrcode.QRCode

        class Spy(real):
            def add_data(self, data, *args, **kwargs):
                captured.append(data)
                return super().add_data(data, *args, **kwargs)

        monkeypatch.setattr(image_service.qrcode, "QRCode", Spy)
        img = _generate_qr_image("mi-encuesta", size=120)
        assert captured == ["https://staging.example.cl/encuestas/mi-encuesta"]
        assert img.size == (120, 120)
