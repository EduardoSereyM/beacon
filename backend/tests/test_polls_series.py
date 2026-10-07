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
    "cadence": "monthly",
}
WEEKLY = {**SERIES, "id": "s-2", "slug": "pulso-semanal", "title": "Pulso Beacon", "cadence": "weekly"}


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


# ═══ Ventana semanal (lunes 04:00 → lunes 03:59:59, hora de Chile) ═══

def _utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


class TestWeeklyWindow:
    def test_semana_de_verano_UTC_menos_3(self):
        starts, ends = edition_window("2026-W41")
        assert starts == _utc(2026, 10, 5, 7, 0, 0)
        assert ends == _utc(2026, 10, 12, 6, 59, 59)

    def test_semana_de_invierno_UTC_menos_4(self):
        starts, ends = edition_window("2027-W14")
        assert starts == _utc(2027, 4, 5, 8, 0, 0)
        assert ends == _utc(2027, 4, 12, 7, 59, 59)

    def test_cambio_de_horario_cae_dentro_de_la_semana_no_en_los_bordes(self):
        # Chile pasa a verano el sábado 5-sep-2026 a las 24:00: la semana 36 dura 1 h menos,
        # pero inicio y cierre siguen en 04:00 / 03:59:59 hora local.
        starts, ends = edition_window("2026-W36")
        assert starts == _utc(2026, 8, 31, 8, 0, 0)    # lunes 04:00 con UTC-4
        assert ends == _utc(2026, 9, 7, 6, 59, 59)     # lunes 03:59:59 con UTC-3
        assert (ends - starts).total_seconds() == 7 * 86400 - 3600 - 1

    def test_semanas_consecutivas_no_se_solapan_ni_dejan_huecos(self):
        _, end_prev = edition_window("2026-W40")
        start_next, _ = edition_window("2026-W41")
        assert (start_next - end_prev).total_seconds() == 1

    def test_antes_del_lunes_04_rige_la_semana_anterior(self):
        assert current_edition(_utc(2026, 10, 5, 6, 59), "weekly") == "2026-W40"
        assert current_edition(_utc(2026, 10, 5, 7, 0), "weekly") == "2026-W41"

    def test_domingo_23_59_sigue_en_la_semana(self):
        assert current_edition(_utc(2026, 10, 12, 2, 59), "weekly") == "2026-W41"  # domingo 23:59 Chile

    def test_anio_iso_distinto_al_calendario(self):
        # 2026 tiene 53 semanas ISO; el 29-dic-2025 ya es la semana 1 de 2026.
        assert current_edition(_utc(2026, 12, 29, 12, 0), "weekly") == "2026-W53"
        assert current_edition(_utc(2025, 12, 29, 12, 0), "weekly") == "2026-W01"

    def test_semana_53_inexistente_se_rechaza(self):
        with pytest.raises(ValueError):
            edition_window("2027-W53")

    def test_cadencia_desconocida_se_rechaza(self):
        with pytest.raises(ValueError):
            current_edition(_utc(2026, 10, 5, 12, 0), "daily")

    def test_etiquetas(self):
        assert edition_label("2026-W41") == "Semana 41 · 5–11 oct 2026"
        assert edition_label("2026-W36") == "Semana 36 · 31 ago – 6 sep 2026"
        assert edition_label("2026-W53") == "Semana 53 · 28 dic 2026 – 3 ene 2027"

    def test_payload_semanal(self):
        p = build_edition_payload(WEEKLY, "2026-W41", "admin-1")
        assert p["edition"] == "2026-W41"
        assert p["slug"] == "pulso-semanal-2026-w41"
        assert p["title"] == "Pulso Beacon — Semana 41 · 5–11 oct 2026"
        assert p["starts_at"] == "2026-10-05T07:00:00+00:00"
        assert p["ends_at"] == "2026-10-12T06:59:59+00:00"


# ═══ Publicación idempotente ═══

class TestPublish:
    @pytest.mark.asyncio
    async def test_publica_una_vez_y_registra_audit(self, _audit):
        sb = FakeSupabase([SERIES])
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary == {"editions": {"monthly": "2026-10", "weekly": "2026-W41"}, "published": ["aprobacion-presidencial"], "skipped": [], "failed": [], "audit_failed": []}
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
        assert summary["editions"]["monthly"] == "2026-11" and summary["published"] == ["aprobacion-presidencial"]
        assert len(sb.db["polls"]) == 2


class TestPublishWeekly:
    @pytest.mark.asyncio
    async def test_cada_serie_publica_su_propia_cadencia(self):
        sb = FakeSupabase([SERIES, WEEKLY])
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary["published"] == ["aprobacion-presidencial", "pulso-semanal"]
        assert sorted(p["edition"] for p in sb.db["polls"]) == ["2026-10", "2026-W41"]

    @pytest.mark.asyncio
    async def test_la_misma_semana_no_se_duplica(self):
        sb = FakeSupabase([WEEKLY])
        await publish_due_series(sb, "admin-1", now=NOW)
        later = _utc(2026, 10, 8, 12, 0)
        summary = await publish_due_series(sb, "admin-1", now=later)
        assert summary["skipped"] == ["pulso-semanal"] and len(sb.db["polls"]) == 1

    @pytest.mark.asyncio
    async def test_lunes_antes_de_las_04_no_abre_la_semana_nueva(self):
        sb = FakeSupabase([WEEKLY])
        await publish_due_series(sb, "admin-1", now=_utc(2026, 10, 5, 4, 15))   # lunes 01:15 Chile
        assert [p["edition"] for p in sb.db["polls"]] == ["2026-W40"]
        await publish_due_series(sb, "admin-1", now=_utc(2026, 10, 5, 8, 15))   # lunes 05:15 Chile
        assert [p["edition"] for p in sb.db["polls"]] == ["2026-W40", "2026-W41"]


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
        ok = {"editions": {"monthly": "2026-10", "weekly": "2026-W41"}, "published": ["a"], "skipped": [], "failed": [], "audit_failed": []}
        self._patch(monkeypatch, ok)
        res = _client().post("/admin/polls/series/publish-due")
        assert res.status_code == 200 and res.json() == ok

    def test_500_con_resumen_si_una_serie_falla(self, monkeypatch):
        bad = {"editions": {"monthly": "2026-10", "weekly": "2026-W41"}, "published": [], "skipped": [], "failed": ["a"], "audit_failed": []}
        self._patch(monkeypatch, bad)
        res = _client().post("/admin/polls/series/publish-due")
        assert res.status_code == 500 and res.json() == bad

    def test_500_si_se_perdio_un_audit(self, monkeypatch):
        bad = {"editions": {"monthly": "2026-10", "weekly": "2026-W41"}, "published": ["a"], "skipped": [], "failed": [], "audit_failed": ["a"]}
        self._patch(monkeypatch, bad)
        assert _client().post("/admin/polls/series/publish-due").status_code == 500

    def test_sin_key_responde_401(self):
        app = FastAPI()
        app.include_router(polls_series_admin.router)
        res = TestClient(app).post("/admin/polls/series/publish-due")
        assert res.status_code == 401
