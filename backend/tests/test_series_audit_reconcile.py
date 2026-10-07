"""
BEACON PROTOCOL — Tests: reconciliación del audit de ediciones publicadas
==========================================================================
Una edición publicada sin fila SERIES_EDITION_PUBLISHED se reescribe en audit_logs
(append-only, idempotente). Sin red: cliente Supabase falso y audit simulado.
"""

import pytest

from app.core.polls_series import series_audit_reconcile
from app.core.polls_series.series_audit_reconcile import reconcile_edition_audit
from tests.fake_supabase import FakeSupabase


def _poll(pid, series_id="s-1"):
    return {"id": pid, "series_id": series_id, "edition": "2026-10", "template_version": 1,
            "created_by": "admin-1", "created_at": "2026-10-01T03:15:00+00:00"}


@pytest.fixture
def written(monkeypatch):
    events = []

    async def fake_alog_event(**kwargs):
        events.append(kwargs)

    monkeypatch.setattr(series_audit_reconcile.audit_bus, "alog_event", fake_alog_event)
    return events


class TestReconcile:
    @pytest.mark.asyncio
    async def test_reescribe_solo_las_ediciones_sin_audit(self, written):
        sb = FakeSupabase(polls=[_poll("p-1"), _poll("p-2"), {**_poll("p-3"), "series_id": None}])
        sb.db["audit_logs"] = [{"action": "SERIES_EDITION_PUBLISHED", "entity_id": "p-1"}]
        out = await reconcile_edition_audit(sb, "pipeline")
        assert out == {"audit_reconciled": ["p-2"], "audit_reconcile_failed": []}
        assert written[0]["entity_id"] == "p-2" and written[0]["action"] == "SERIES_EDITION_PUBLISHED"
        assert written[0]["details"]["reconciled"] is True and written[0]["raise_on_error"] is True

    @pytest.mark.asyncio
    async def test_sin_pendientes_no_escribe(self, written):
        sb = FakeSupabase(polls=[_poll("p-1")])
        sb.db["audit_logs"] = [{"action": "SERIES_EDITION_PUBLISHED", "entity_id": "p-1"}]
        assert (await reconcile_edition_audit(sb, "pipeline"))["audit_reconciled"] == []
        assert written == []

    @pytest.mark.asyncio
    async def test_un_audit_de_otra_accion_no_cuenta(self, written):
        sb = FakeSupabase(polls=[_poll("p-1")])
        sb.db["audit_logs"] = [{"action": "SERIES_EDITION_SNAPSHOT", "entity_id": "p-1"}]
        assert (await reconcile_edition_audit(sb, "pipeline"))["audit_reconciled"] == ["p-1"]

    @pytest.mark.asyncio
    async def test_fallo_en_una_no_impide_las_demas(self, monkeypatch):
        async def flaky(**kwargs):
            if kwargs["entity_id"] == "p-1":
                raise RuntimeError("audit caído")

        monkeypatch.setattr(series_audit_reconcile.audit_bus, "alog_event", flaky)
        out = await reconcile_edition_audit(FakeSupabase(polls=[_poll("p-1"), _poll("p-2")]), "pipeline")
        assert out == {"audit_reconciled": ["p-2"], "audit_reconcile_failed": ["p-1"]}
