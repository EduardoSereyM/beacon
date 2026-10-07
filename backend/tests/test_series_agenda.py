"""
BEACON PROTOCOL — Tests: series de tipo «agenda» (opciones curadas por edición)
================================================================================
"""

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.admin import polls_series_admin, series_agenda_admin
from app.api.v1.admin.require_admin import require_admin_role
from app.core.polls_series import series_publisher
from app.core.polls_series.series_agenda import AwaitingOptions, edition_questions
from app.core.polls_series.series_publisher import publish_due_series, publish_series_edition
from app.core.polls_series.series_window import current_edition, is_valid_edition, next_edition
from tests.fake_supabase import FakeSupabase

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)      # lunes 5-oct-2026 → semana 2026-W41
FIXED = ["Otra noticia", "No sabe / No responde"]
AGENDA = {
    "id": "s-ag", "slug": "agenda-semanal", "title": "Agenda Beacon", "context": None, "tags": [], "category": "general",
    "requires_auth": True, "template_version": 1, "is_active": True, "cadence": "weekly", "kind": "agenda",
    "questions": [{"id": "q1", "text": "¿Cuál fue la noticia más importante de la semana?", "type": "multiple_choice", "options": FIXED}],
}
TRACKER = {**AGENDA, "id": "s-tr", "slug": "pulso", "kind": "tracker",
           "questions": [{"id": "q9", "text": "¿Aprueba?", "type": "multiple_choice", "options": ["Sí", "No"]}]}
WEEK_OPTIONS = ["Alza de combustibles", "Cadena nacional", "Marcha estudiantil"]


@pytest.fixture(autouse=True)
def _audit(monkeypatch):
    events = []

    async def fake(**kwargs):
        events.append(kwargs)

    monkeypatch.setattr(series_publisher.audit_bus, "alog_event", fake)
    monkeypatch.setattr(series_agenda_admin.audit_bus, "alog_event", fake)
    monkeypatch.setattr(polls_series_admin.audit_bus, "alog_event", fake)
    return events


class TestWindowHelpers:
    @pytest.mark.parametrize("edition, expected", [
        ("2026-W41", "2026-W42"), ("2026-W52", "2026-W53"), ("2026-W53", "2027-W01"), ("2025-W52", "2026-W01"),
    ])
    def test_semana_siguiente(self, edition, expected):
        assert next_edition(edition, "weekly") == expected

    @pytest.mark.parametrize("edition, expected", [("2026-10", "2026-11"), ("2026-12", "2027-01")])
    def test_mes_siguiente(self, edition, expected):
        assert next_edition(edition, "monthly") == expected

    @pytest.mark.parametrize("edition, cadence, valid", [
        ("2026-W41", "weekly", True), ("2026-W53", "weekly", True), ("2027-W53", "weekly", False),
        ("2026-W00", "weekly", False), ("2026-10", "weekly", False), ("2026-10", "monthly", True),
        ("2026-13", "monthly", False), ("2026-W41", "monthly", False), ("hoy", "weekly", False),
    ])
    def test_formato_valido_segun_cadencia(self, edition, cadence, valid):
        assert is_valid_edition(edition, cadence) is valid


class TestEditionQuestions:
    def test_las_opciones_de_la_semana_van_antes_de_las_fijas(self):
        q = edition_questions(AGENDA["questions"], WEEK_OPTIONS)[0]
        assert q["options"] == [*WEEK_OPTIONS, *FIXED] and q["id"] == "q1"

    def test_no_duplica_una_fija_repetida_por_el_editor(self):
        q = edition_questions(AGENDA["questions"], ["Otra noticia", "Cadena nacional"])[0]
        assert q["options"] == ["Otra noticia", "Cadena nacional", "No sabe / No responde"]

    def test_no_modifica_la_plantilla(self):
        edition_questions(AGENDA["questions"], WEEK_OPTIONS)
        assert AGENDA["questions"][0]["options"] == FIXED

    def test_plantilla_sin_opcion_multiple_se_rechaza(self):
        with pytest.raises(ValueError):
            edition_questions([{"id": "q", "text": "x", "type": "scale"}], WEEK_OPTIONS)


class TestPublisher:
    @pytest.mark.asyncio
    async def test_sin_opciones_no_se_publica_y_se_informa_sin_fallar(self):
        sb = FakeSupabase([AGENDA])
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary["awaiting_options"] == ["agenda-semanal"]
        assert summary["published"] == [] and summary["failed"] == [] and sb.db["polls"] == []

    @pytest.mark.asyncio
    async def test_con_opciones_publica_con_las_de_esa_semana(self):
        sb = FakeSupabase([AGENDA])
        sb.db["series_edition_options"] = [{"series_id": "s-ag", "edition": "2026-W41", "options": WEEK_OPTIONS}]
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary["published"] == ["agenda-semanal"] and summary["awaiting_options"] == []
        assert sb.db["polls"][0]["questions"][0]["options"] == [*WEEK_OPTIONS, *FIXED]

    @pytest.mark.asyncio
    async def test_opciones_de_otra_semana_no_cuentan(self):
        sb = FakeSupabase([AGENDA])
        sb.db["series_edition_options"] = [{"series_id": "s-ag", "edition": "2026-W42", "options": WEEK_OPTIONS}]
        assert (await publish_due_series(sb, "admin-1", now=NOW))["awaiting_options"] == ["agenda-semanal"]

    @pytest.mark.asyncio
    async def test_segunda_ejecucion_no_duplica(self):
        sb = FakeSupabase([AGENDA])
        sb.db["series_edition_options"] = [{"series_id": "s-ag", "edition": "2026-W41", "options": WEEK_OPTIONS}]
        await publish_due_series(sb, "admin-1", now=NOW)
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary["skipped"] == ["agenda-semanal"] and len(sb.db["polls"]) == 1

    @pytest.mark.asyncio
    async def test_una_serie_tracker_no_se_ve_afectada(self):
        sb = FakeSupabase([TRACKER, AGENDA])
        summary = await publish_due_series(sb, "admin-1", now=NOW)
        assert summary["published"] == ["pulso"] and summary["awaiting_options"] == ["agenda-semanal"]
        assert sb.db["polls"][0]["questions"][0]["options"] == ["Sí", "No"]

    @pytest.mark.asyncio
    async def test_publish_series_edition_lanza_awaiting_options(self):
        with pytest.raises(AwaitingOptions):
            await publish_series_edition(FakeSupabase([AGENDA]), AGENDA, "2026-W41", "admin-1")


@pytest.fixture
def env(monkeypatch):
    sb = FakeSupabase([AGENDA, TRACKER])
    for module in (series_agenda_admin, polls_series_admin):
        monkeypatch.setattr(module, "get_async_supabase_client", lambda: sb)
    app = FastAPI()
    app.include_router(series_agenda_admin.router)
    app.include_router(polls_series_admin.router)
    app.dependency_overrides[require_admin_role] = lambda: {"user_id": "admin-1"}
    return TestClient(app), sb


def _editions():
    cur = current_edition(datetime.now(timezone.utc), "weekly")
    return cur, next_edition(cur, "weekly")


def _put(client, edition, options=WEEK_OPTIONS, series="s-ag"):
    return client.put(f"/admin/polls/series/{series}/editions/{edition}/options", json={"options": options})


class TestAdminOptions:
    def test_define_las_opciones_y_audita(self, env, _audit):
        client, sb = env
        _, nxt = _editions()
        res = _put(client, nxt)
        assert res.status_code == 200 and res.json()["options"] == WEEK_OPTIONS
        assert sb.db["series_edition_options"][0]["options"] == WEEK_OPTIONS
        assert _audit[-1]["action"] == "OVERLORD_ACTION_SET_SERIES_EDITION_OPTIONS" and _audit[-1]["details"]["replaced"] is False

    def test_volver_a_definirlas_las_reemplaza_sin_duplicar_fila(self, env, _audit):
        client, sb = env
        _, nxt = _editions()
        _put(client, nxt)
        _put(client, nxt, ["Otra A", "Otra B"])
        assert len(sb.db["series_edition_options"]) == 1 and sb.db["series_edition_options"][0]["options"] == ["Otra A", "Otra B"]
        assert _audit[-1]["details"]["replaced"] is True

    def test_limpia_espacios(self, env):
        client, sb = env
        _put(client, _editions()[1], ["  Alza de combustibles ", "Cadena nacional"])
        assert sb.db["series_edition_options"][0]["options"] == ["Alza de combustibles", "Cadena nacional"]

    def test_serie_inexistente_404_y_tracker_400(self, env):
        client, _ = env
        assert _put(client, _editions()[1], series="nada").status_code == 404
        assert _put(client, _editions()[1], series="s-tr").status_code == 400

    def test_edicion_invalida_400(self, env):
        client, _ = env
        assert _put(client, "2026-10").status_code == 400          # formato mensual en una serie semanal
        assert _put(client, "2027-W53").status_code == 400         # semana que no existe

    def test_edicion_pasada_400(self, env):
        assert _put(env[0], "2000-W01").status_code == 400

    def test_edicion_ya_publicada_409(self, env):
        client, sb = env
        cur, _ = _editions()
        sb.db["polls"].append({"id": "p1", "series_id": "s-ag", "edition": cur})
        assert _put(client, cur).status_code == 409 and sb.db.get("series_edition_options", []) == []

    @pytest.mark.parametrize("options", [
        ["Una sola"], ["Repetida", "repetida"], ["ab", "Válida larga"], ["x" * 141, "Válida larga"],
        [f"Opción {i}" for i in range(9)], [],
    ])
    def test_validacion_422(self, env, options):
        assert _put(env[0], _editions()[1], options).status_code == 422

    def test_upcoming_muestra_la_en_curso_y_la_siguiente(self, env):
        client, sb = env
        cur, nxt = _editions()
        _put(client, nxt)
        data = client.get("/admin/polls/series/s-ag/upcoming").json()
        assert [e["edition"] for e in data["editions"]] == [cur, nxt]
        assert data["editions"][0]["options"] is None and data["editions"][1]["options"] == WEEK_OPTIONS
        assert data["editions"][0]["published"] is False
        assert client.get("/admin/polls/series/s-tr/upcoming").status_code == 400


class TestCreateAgenda:
    BODY = {"title": "Agenda Beacon", "kind": "agenda", "cadence": "weekly", "questions": [
        {"text": "¿Cuál fue la noticia más importante?", "type": "multiple_choice", "options": FIXED}]}

    def test_crea_una_serie_agenda(self, env):
        client, sb = env
        res = client.post("/admin/polls/series", json=self.BODY)
        assert res.status_code == 201 and res.json()["series"]["kind"] == "agenda"

    def test_por_defecto_es_tracker(self, env):
        client, _ = env
        body = {k: v for k, v in self.BODY.items() if k != "kind"}
        assert client.post("/admin/polls/series", json=body).json()["series"]["kind"] == "tracker"

    def test_agenda_exige_una_pregunta_de_opcion_unica(self, env):
        client, _ = env
        two = {**self.BODY, "questions": self.BODY["questions"] * 2}
        scale = {**self.BODY, "questions": [{"text": "Nota", "type": "scale", "scale_points": 7}]}
        multi = {**self.BODY, "questions": [{**self.BODY["questions"][0], "allow_multiple": True}]}
        assert [client.post("/admin/polls/series", json=b).status_code for b in (two, scale, multi)] == [400, 400, 400]

    def test_kind_invalido_422(self, env):
        assert env[0].post("/admin/polls/series", json={**self.BODY, "kind": "otro"}).status_code == 422
