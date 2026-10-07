"""
BEACON PROTOCOL — Tests: alog_event(raise_on_error)
====================================================
Por defecto el audit nunca detiene el flujo (comportamiento histórico de los 20
llamadores). Con raise_on_error=True el error se propaga para que el cron de
series pueda avisar de un audit perdido. Sin red: cliente Supabase falso.
"""

from datetime import datetime, timezone

import pytest

from app.core.audit_logger import audit_bus
from app.core.polls_series.series_publisher import AuditWriteFailed, publish_due_series
from tests.fake_supabase import FakeSupabase

EVENT = dict(actor_id="a-1", action="X", entity_type="POLL", entity_id="p-1", details={})


class _FailingTable:
    def insert(self, _payload):
        return self

    async def execute(self):
        raise RuntimeError("audit_logs caído")


class _FailingClient:
    def table(self, _name):
        return _FailingTable()


class _OkTable(_FailingTable):
    async def execute(self):
        return None


class _OkClient:
    def __init__(self):
        self.inserted = []

    def table(self, name):
        self.inserted.append(name)
        return _OkTable()


def _patch_client(monkeypatch, client):
    monkeypatch.setattr("app.core.database.get_async_supabase_client", lambda: client)


class TestRaiseOnError:
    @pytest.mark.asyncio
    async def test_por_defecto_no_lanza(self, monkeypatch):
        _patch_client(monkeypatch, _FailingClient())
        await audit_bus.alog_event(**EVENT)  # no debe lanzar

    @pytest.mark.asyncio
    async def test_con_raise_on_error_propaga_la_excepcion_original(self, monkeypatch):
        _patch_client(monkeypatch, _FailingClient())
        with pytest.raises(RuntimeError, match="audit_logs caído"):
            await audit_bus.alog_event(**EVENT, raise_on_error=True)

    @pytest.mark.asyncio
    async def test_exito_no_lanza_con_ninguno_de_los_dos_modos(self, monkeypatch):
        client = _OkClient()
        _patch_client(monkeypatch, client)
        await audit_bus.alog_event(**EVENT)
        await audit_bus.alog_event(**EVENT, raise_on_error=True)
        assert client.inserted == ["audit_logs", "audit_logs"]


class TestPublisherSurfacesRealAuditFailure:
    """Integración publicador + alog_event real: el fallo del insert en audit_logs
    ya no se traga; llega como audit_failed (→ 500 del endpoint)."""

    SERIES = {
        "id": "s-1", "slug": "aprobacion", "title": "¿Aprueba?", "context": None, "tags": [],
        "category": "politica", "requires_auth": True, "template_version": 1, "is_active": True, "cadence": "monthly",
        "questions": [{"id": "q1", "text": "¿Aprueba?", "type": "multiple_choice", "options": ["Sí", "No"]}],
    }

    @pytest.mark.asyncio
    async def test_audit_caido_se_reporta_en_el_resumen(self, monkeypatch):
        _patch_client(monkeypatch, _FailingClient())
        sb = FakeSupabase([self.SERIES])
        now = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
        summary = await publish_due_series(sb, "admin-1", now=now)
        assert summary["published"] == ["aprobacion"]
        assert summary["audit_failed"] == ["aprobacion"] and summary["failed"] == []
        assert len(sb.db["polls"]) == 1

    @pytest.mark.asyncio
    async def test_publish_series_edition_lanza_audit_write_failed(self, monkeypatch):
        from app.core.polls_series.series_publisher import publish_series_edition

        _patch_client(monkeypatch, _FailingClient())
        with pytest.raises(AuditWriteFailed):
            await publish_series_edition(FakeSupabase([self.SERIES]), self.SERIES, "2026-10", "admin-1")
