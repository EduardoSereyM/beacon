"""
BEACON PROTOCOL — Tests: posición política autodeclarada (dato sensible, opcional)
===================================================================================
Sin consentimiento no se guarda; borrar quita dato y consentimiento; el audit nunca lleva el valor.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.v1.user import auth
from app.domain.schemas.user import PoliticalPositionUpdate
from app.services import political_position_service as service
from tests.fake_supabase import FakeSupabase

USER = {"id": "u-1", "rank": "VERIFIED"}


class TestSchema:
    @pytest.mark.parametrize("position", ["Derecha", "Centro", "Izquierda", "Independiente"])
    def test_con_consentimiento_se_acepta(self, position):
        assert PoliticalPositionUpdate(position=position, consent=True).position == position

    def test_sin_consentimiento_se_rechaza(self):
        with pytest.raises(ValidationError, match="consentimiento"):
            PoliticalPositionUpdate(position="Centro", consent=False)
        with pytest.raises(ValidationError):
            PoliticalPositionUpdate(position="Centro")

    def test_borrar_no_exige_consentimiento(self):
        assert PoliticalPositionUpdate(position=None).position is None

    @pytest.mark.parametrize("value", ["", "Extrema", "derecha", "Prefiero no decir"])
    def test_valor_fuera_de_las_opciones_se_rechaza(self, value):
        with pytest.raises(ValidationError):
            PoliticalPositionUpdate(position=value, consent=True)


@pytest.fixture
def env(monkeypatch):
    sb = FakeSupabase()
    sb.db["users"] = [{"id": "u-1", "political_position": None, "political_position_consent_at": None}]
    events = []

    async def fake_alog_event(**kwargs):
        events.append(kwargs)

    monkeypatch.setattr(service, "get_async_supabase_client", lambda: sb)
    monkeypatch.setattr(service.audit_bus, "alog_event", fake_alog_event)
    return sb, events


class TestService:
    @pytest.mark.asyncio
    async def test_guarda_con_marca_de_consentimiento(self, env):
        sb, _ = env
        await service.set_political_position("u-1", "Izquierda")
        row = sb.db["users"][0]
        assert row["political_position"] == "Izquierda" and row["political_position_consent_at"] is not None

    @pytest.mark.asyncio
    async def test_borrar_quita_dato_y_consentimiento_juntos(self, env):
        sb, _ = env
        await service.set_political_position("u-1", "Centro")
        await service.set_political_position("u-1", None)
        row = sb.db["users"][0]
        assert row["political_position"] is None and row["political_position_consent_at"] is None

    @pytest.mark.asyncio
    async def test_el_audit_registra_el_hecho_pero_nunca_el_valor(self, env):
        _, events = env
        await service.set_political_position("u-1", "Derecha")
        await service.set_political_position("u-1", None)
        assert [e["action"] for e in events] == ["POLITICAL_POSITION_SET", "POLITICAL_POSITION_CLEARED"]
        assert all(e["details"] == {} and "Derecha" not in str(e) for e in events)


class TestEndpoint:
    def _client(self):
        app = FastAPI()
        app.include_router(auth.router)
        app.dependency_overrides[auth.get_current_user] = lambda: USER
        return TestClient(app)

    def test_guarda_y_devuelve_el_valor_propio(self, env):
        res = self._client().put("/profile/political-position", json={"position": "Centro", "consent": True})
        assert res.status_code == 200 and res.json() == {"political_position": "Centro"}

    def test_sin_consentimiento_422_y_no_se_guarda_nada(self, env):
        sb, events = env
        res = self._client().put("/profile/political-position", json={"position": "Centro", "consent": False})
        assert res.status_code == 422
        assert sb.db["users"][0]["political_position"] is None and events == []

    def test_valor_invalido_422(self, env):
        assert self._client().put("/profile/political-position", json={"position": "Otra", "consent": True}).status_code == 422

    def test_null_borra(self, env):
        client = self._client()
        client.put("/profile/political-position", json={"position": "Centro", "consent": True})
        res = client.put("/profile/political-position", json={"position": None})
        assert res.status_code == 200 and env[0].db["users"][0]["political_position"] is None


class TestMigration:
    SQL = (Path(__file__).parent.parent / "migrations" / "028_political_position.sql").read_text(encoding="utf-8")

    def test_la_base_exige_consentimiento_y_valores_validos(self):
        assert "(political_position IS NULL) = (political_position_consent_at IS NULL)" in self.SQL
        assert "'Derecha', 'Centro', 'Izquierda', 'Independiente'" in self.SQL

    def test_documenta_el_uso_solo_agregado(self):
        assert "SOLO agregado" in self.SQL and "ROLLBACK" in self.SQL
