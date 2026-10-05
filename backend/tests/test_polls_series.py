"""
BEACON PROTOCOL — Tests: series de encuestas mensuales
=======================================================
Ventana de edición (hora Chile, DST) y publicación idempotente.
Sin Supabase real: se usa un cliente falso en memoria.
"""

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.admin import polls_series_admin
from app.api.v1.admin.polls_admin import require_pipeline_key
from app.core.polls_series import series_publisher
from app.core.polls_series.series_publisher import (
    AuditWriteFailed,
    build_edition_payload,
    publish_due_series,
    publish_series_edition,
)
from app.core.polls_series.series_window import (
    CHILE_TZ,
    current_edition,
    edition_label,
    edition_window,
)
from tests.fake_supabase import FakeSupabase, Query, Result

SERIES = {
    "id": "s-1",
    "slug": "aprobacion-presidencial",
    "title": "¿Aprueba al Presidente?",
    "context": None,
    "tags": ["politica"],
    "category": "politica",
    "questions": [{"id": "q1", "text": "¿Aprueba?", "type": "multiple_choice", "options": ["Sí", "No"]}],
    "requires_auth": True,
    "template_version": 2,
    "is_active": True,
}


# ═══ Ventana de edición ═══

class TestEditionWindow:
    def test_octubre_chile_horario_verano(self):
        # Oct 2026: Chile en UTC-3 → 00:00 local = 03:00 UTC; 23:59:59 local = 02:59:59 UTC del día siguiente.
        starts, ends = edition_window("2026-10")
        assert starts == datetime(2026, 10, 1, 3, 0, 0, tzinfo=timezone.utc)
        assert ends == datetime(2026, 11, 1, 2, 59, 59, tzinfo=timezone.utc)

    def test_julio_chile_horario_invierno(self):
        # Jul 2026: Chile en UTC-4.
        starts, ends = edition_window("2026-07")
        assert starts == datetime(2026, 7, 1, 4, 0, 0, tzinfo=timezone.utc)
        assert ends == datetime(2026, 8, 1, 3, 59, 59, tzinfo=timezone.utc)

    def test_septiembre_empieza_invierno_y_cierra_verano(self):
        # Chile pasa a horario de verano el 6 sep 2026 (00:00 → 01:00): inicio UTC-4, cierre UTC-3.
        starts, ends = edition_window("2026-09")
        assert starts == datetime(2026, 9, 1, 4, 0, 0, tzinfo=timezone.utc)
        assert ends == datetime(2026, 10, 1, 2, 59, 59, tzinfo=timezone.utc)

    def test_abril_empieza_verano_y_cierra_invierno(self):
        # Chile vuelve a horario de invierno el 5 abr 2026 (00:00 → 23:00 del sábado): inicio UTC-3, cierre UTC-4.
        starts, ends = edition_window("2026-04")
        assert starts == datetime(2026, 4, 1, 3, 0, 0, tzinfo=timezone.utc)
        assert ends == datetime(2026, 5, 1, 3, 59, 59, tzinfo=timezone.utc)

    def test_febrero_bisiesto(self):
        _, ends = edition_window("2028-02")
        assert (ends.year, ends.month, ends.day) == (2028, 3, 1)  # 29 feb 23:59:59 local = 1 mar UTC

    def test_edicion_sigue_hora_chile_no_utc(self):
        # 1 nov 01:00 UTC todavía es 31 oct 22:00 en Chile → sigue siendo la edición de octubre.
        assert current_edition(datetime(2026, 11, 1, 1, 0, tzinfo=timezone.utc)) == "2026-10"
        assert current_edition(datetime(2026, 11, 1, 4, 0, tzinfo=timezone.utc)) == "2026-11"

    def test_22h_chile_del_ultimo_dia_sigue_siendo_el_mes_actual(self):
        # 31 oct 22:00 hora Chile = 1 nov 01:00 UTC. En UTC ya es noviembre; en Chile no.
        local = datetime(2026, 10, 31, 22, 0, tzinfo=CHILE_TZ)
        assert local.astimezone(timezone.utc).month == 11
        assert current_edition(local) == "2026-10"
        assert current_edition(local.astimezone(timezone.utc)) == "2026-10"

    def test_label_en_espanol(self):
        assert edition_label("2026-10") == "Octubre 2026"


# ═══ Payload ═══

class TestBuildPayload:
    def test_enlaza_serie_y_conserva_ids_de_preguntas(self):
        p = build_edition_payload(SERIES, "2026-10", "admin-1")
        assert p["series_id"] == "s-1"
        assert p["edition"] == "2026-10"
        assert p["template_version"] == 2
        assert p["slug"] == "aprobacion-presidencial-2026-10"
        assert p["title"] == "¿Aprueba al Presidente? — Octubre 2026"
        assert p["questions"][0]["id"] == "q1"
        assert p["status"] == "active" and p["is_active"] is True


@pytest.fixture(autouse=True)
def _audit(monkeypatch):
    events = []

    async def fake_alog_event(**kwargs):
        events.append(kwargs)

    monkeypatch.setattr(series_publisher.audit_bus, "alog_event", fake_alog_event)
    return events


NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)


# ═══ Publicación idempotente ═══

class TestPublish:
    @pytest.mark.asyncio
    async def test_publica_una_vez_y_registra_audit(self, _audit):
        sb = FakeSupabase([SERIES])
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary == {"edition": "2026-10", "published": ["aprobacion-presidencial"], "skipped": [], "failed": [], "audit_failed": []}
        assert len(sb.db["polls"]) == 1
        assert sb.db["poll_series"][0]["last_published_at"] is not None
        assert [e["action"] for e in _audit] == ["SERIES_EDITION_PUBLISHED"]
        assert _audit[0]["raise_on_error"] is True  # sin esto el audit perdido nunca se vería

    @pytest.mark.asyncio
    async def test_segunda_ejecucion_no_duplica(self, _audit):
        sb = FakeSupabase([SERIES])
        await publish_due_series(sb, "admin-1", now=NOW)
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary["published"] == [] and summary["skipped"] == ["aprobacion-presidencial"]
        assert len(sb.db["polls"]) == 1
        assert len(_audit) == 1

    @pytest.mark.asyncio
    async def test_carrera_por_indice_unico_se_trata_como_skip(self, monkeypatch):
        sb = FakeSupabase([SERIES])
        # Otra ejecución insertó entre el SELECT inicial y el INSERT.
        sb.db["polls"].append({"id": "poll-0", "series_id": "s-1", "edition": "2026-10"})
        original = Query.execute
        state = {"first_select": True}

        async def racing(self):
            if self.op == "select" and self.table == "polls" and state["first_select"]:
                state["first_select"] = False
                return Result([])  # el primer chequeo "no ve" la edición
            return await original(self)

        monkeypatch.setattr(Query, "execute", racing)
        assert await publish_series_edition(sb, SERIES, "2026-10", "admin-1") is None
        assert len(sb.db["polls"]) == 1

    @pytest.mark.asyncio
    async def test_serie_pausada_no_se_publica(self):
        paused = {**SERIES, "is_active": False}
        sb = FakeSupabase([paused])
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary["published"] == [] and sb.db["polls"] == []

    @pytest.mark.asyncio
    async def test_nuevo_mes_publica_nueva_edicion(self):
        sb = FakeSupabase([SERIES])
        await publish_due_series(sb, "admin-1", now=NOW)
        nov = datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)
        summary = await publish_due_series(sb, "admin-1", now=nov)
        assert summary["edition"] == "2026-11" and summary["published"] == ["aprobacion-presidencial"]
        assert len(sb.db["polls"]) == 2


# ═══ Casos que se rompen en la práctica ═══

class TestFailureModes:
    @pytest.mark.asyncio
    async def test_slug_ocupado_por_otra_poll_es_fallo_no_skip(self):
        sb = FakeSupabase([SERIES])
        # Otra poll (sin serie) ya usa el slug de la edición.
        sb.db["polls"].append({"id": "poll-x", "slug": "aprobacion-presidencial-2026-10"})
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary["failed"] == ["aprobacion-presidencial"]
        assert summary["published"] == [] and summary["skipped"] == []
        assert len(sb.db["polls"]) == 1  # no se creó nada

    @pytest.mark.asyncio
    async def test_slug_ocupado_no_impide_publicar_otras_series(self):
        otra = {**SERIES, "id": "s-2", "slug": "economia-hogar", "title": "Economía del hogar"}
        sb = FakeSupabase([SERIES, otra])
        sb.db["polls"].append({"id": "poll-x", "slug": "aprobacion-presidencial-2026-10"})
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary["failed"] == ["aprobacion-presidencial"]
        assert summary["published"] == ["economia-hogar"]

    @pytest.mark.asyncio
    async def test_fallo_de_audit_tras_insert_no_pierde_ni_oculta_la_edicion(self, monkeypatch):
        async def boom(**_):
            raise RuntimeError("audit_logs caído")

        monkeypatch.setattr(series_publisher.audit_bus, "alog_event", boom)
        sb = FakeSupabase([SERIES])

        with pytest.raises(AuditWriteFailed):
            await publish_series_edition(sb, SERIES, "2026-10", "admin-1")
        assert len(sb.db["polls"]) == 1  # la poll sigue publicada

        # El resumen del cron la cuenta como publicada Y reporta el audit perdido.
        sb2 = FakeSupabase([SERIES])
        summary = await publish_due_series(sb2, "admin-1", now=NOW)
        assert summary["published"] == ["aprobacion-presidencial"]
        assert summary["audit_failed"] == ["aprobacion-presidencial"]
        assert summary["failed"] == []

        # Reintento: no duplica.
        again = await publish_due_series(sb2, "admin-1", now=NOW)
        assert again["skipped"] == ["aprobacion-presidencial"] and len(sb2.db["polls"]) == 1

    @pytest.mark.asyncio
    async def test_fallo_al_actualizar_last_published_no_cuenta_como_fallo_y_el_audit_se_escribe(self, _audit):
        sb = FakeSupabase([SERIES])
        original = Query.execute

        async def execute(self):
            if self.table == "poll_series" and self.op == "update":
                raise RuntimeError("update caído")
            return await original(self)

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(Query, "execute", execute)
            summary = await publish_due_series(sb, "admin-1", now=NOW)

        assert summary["published"] == ["aprobacion-presidencial"]
        assert summary["failed"] == [] and summary["audit_failed"] == []
        assert [e["action"] for e in _audit] == ["SERIES_EDITION_PUBLISHED"]


# ═══ Endpoint publish-due: el código HTTP debe hacer fallar al cron ═══

def _client():
    app = FastAPI()
    app.include_router(polls_series_admin.router)
    app.dependency_overrides[require_pipeline_key] = lambda: {"user_id": "admin-1"}
    return TestClient(app)


class TestPublishDueEndpoint:
    def _patch(self, monkeypatch, summary):
        async def fake(_supabase, actor_id, now=None):
            return summary

        monkeypatch.setattr(polls_series_admin, "publish_due_series", fake)
        monkeypatch.setattr(polls_series_admin, "get_async_supabase_client", lambda: object())

    def test_200_cuando_todo_sale_bien(self, monkeypatch):
        ok = {"edition": "2026-10", "published": ["a"], "skipped": [], "failed": [], "audit_failed": []}
        self._patch(monkeypatch, ok)
        res = _client().post("/admin/polls/series/publish-due")
        assert res.status_code == 200 and res.json() == ok

    def test_500_con_resumen_si_una_serie_falla(self, monkeypatch):
        bad = {"edition": "2026-10", "published": [], "skipped": [], "failed": ["a"], "audit_failed": []}
        self._patch(monkeypatch, bad)
        res = _client().post("/admin/polls/series/publish-due")
        assert res.status_code == 500 and res.json() == bad

    def test_500_si_se_perdio_un_audit(self, monkeypatch):
        bad = {"edition": "2026-10", "published": ["a"], "skipped": [], "failed": [], "audit_failed": ["a"]}
        self._patch(monkeypatch, bad)
        assert _client().post("/admin/polls/series/publish-due").status_code == 500

    def test_sin_key_responde_401(self):
        app = FastAPI()
        app.include_router(polls_series_admin.router)
        res = TestClient(app).post("/admin/polls/series/publish-due")
        assert res.status_code == 401
