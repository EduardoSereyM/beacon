"""
BEACON PROTOCOL — Tests: snapshot de ediciones cerradas, tendencia y eventos anotados
=====================================================================================
Snapshot idempotente, supresión por n mínimo, corte por template_version, mezcla de
snapshot y cálculo en vivo, y los endpoints públicos/admin.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.admin import series_events_admin
from app.api.v1.admin.require_admin import require_admin_role
from app.api.v1.endpoints import series as series_endpoints
from app.core.polls_series import series_publisher, series_snapshot
from app.core.polls_series.series_snapshot import SNAPSHOT_GRACE, build_snapshot_row, snapshot_closed_editions
from app.core.polls_series.series_trend import MIN_N, load_series_trend
from tests.fake_supabase import FakeSupabase

NOW = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)
QUESTIONS = [
    {"id": "q1", "text": "¿Aprueba?", "type": "multiple_choice", "options": ["Aprueba", "Desaprueba"], "order_index": 0},
    {"id": "q2", "text": "Nota", "type": "scale", "scale_points": 7, "scale_min": None, "scale_max": None, "order_index": 1},
]
SERIES = {"id": "s-1", "slug": "pulso-semanal", "title": "Pulso", "cadence": "weekly", "category": "politica",
          "context": None, "is_active": True, "template_version": 1, "questions": QUESTIONS}


def _poll(pid, edition, starts, ends, version=1):
    return {"id": pid, "slug": f"pulso-semanal-{edition.lower()}", "series_id": "s-1", "edition": edition,
            "starts_at": starts.isoformat(), "ends_at": ends.isoformat(), "template_version": version,
            "questions": QUESTIONS}


CLOSED_END = NOW - timedelta(days=2)
POLL_CLOSED = _poll("p-40", "2026-W40", NOW - timedelta(days=9), CLOSED_END)
POLL_OPEN = _poll("p-41", "2026-W41", NOW - timedelta(days=1), NOW + timedelta(days=6))


def _votes(n_verified, n_basic=0, approve_ratio=0.5):
    votes = []
    for i in range(n_verified + n_basic):
        approves = i < int((n_verified + n_basic) * approve_ratio)
        votes.append({
            "option_value": json.dumps({"q1": "Aprueba" if approves else "Desaprueba", "q2": "5"}),
            "voter_rank": "VERIFIED" if i < n_verified else "BASIC",
        })
    return votes


def _sb(polls, votes_by_poll=None):
    sb = FakeSupabase([SERIES], polls)
    sb.db["poll_votes"] = [{"poll_id": pid, **v} for pid, vs in (votes_by_poll or {}).items() for v in vs]
    return sb


@pytest.fixture(autouse=True)
def _audit(monkeypatch):
    events = []

    async def fake_alog_event(**kwargs):
        events.append(kwargs)

    monkeypatch.setattr(series_snapshot.audit_bus, "alog_event", fake_alog_event)
    return events


# ═══ Snapshot ═══

class TestBuildSnapshotRow:
    def test_separa_verificados_de_totales_por_pregunta(self):
        row = build_snapshot_row(POLL_CLOSED, _votes(40, 10))
        assert row["total_votes"] == 50 and row["verified_votes"] == 40
        assert row["results_verified"][0]["total_votes"] == 40
        assert row["results_total"][0]["total_votes"] == 50
        assert row["results_total"][1]["results"][0]["average"] == 5.0  # escala por puntos, sin romper

    def test_conserva_edicion_y_version(self):
        row = build_snapshot_row({**POLL_CLOSED, "template_version": 3}, [])
        assert (row["edition"], row["template_version"], row["poll_id"]) == ("2026-W40", 3, "p-40")


class TestSnapshotClosedEditions:
    @pytest.mark.asyncio
    async def test_fotografia_solo_la_cerrada_y_audita(self, _audit):
        sb = _sb([POLL_CLOSED, POLL_OPEN], {"p-40": _votes(40)})
        out = await snapshot_closed_editions(sb, "admin-1", NOW)
        assert out == {"snapshotted": ["pulso-semanal-2026-w40"], "snapshot_failed": []}
        assert [r["poll_id"] for r in sb.db["poll_results_snapshot"]] == ["p-40"]
        assert [e["action"] for e in _audit] == ["SERIES_EDITION_SNAPSHOT"]
        assert _audit[0]["raise_on_error"] is True

    @pytest.mark.asyncio
    async def test_idempotente(self, _audit):
        sb = _sb([POLL_CLOSED], {"p-40": _votes(40)})
        await snapshot_closed_editions(sb, "admin-1", NOW)
        out = await snapshot_closed_editions(sb, "admin-1", NOW)
        assert out["snapshotted"] == [] and len(sb.db["poll_results_snapshot"]) == 1 and len(_audit) == 1

    @pytest.mark.asyncio
    async def test_respeta_el_margen_tras_el_cierre(self):
        just_closed = _poll("p-x", "2026-W39", NOW - timedelta(days=8), NOW - SNAPSHOT_GRACE + timedelta(minutes=1))
        sb = _sb([just_closed])
        assert (await snapshot_closed_editions(sb, "admin-1", NOW))["snapshotted"] == []

    @pytest.mark.asyncio
    async def test_audit_caido_se_reporta_como_fallo(self, monkeypatch):
        async def boom(**_):
            raise RuntimeError("audit caído")

        monkeypatch.setattr(series_snapshot.audit_bus, "alog_event", boom)
        sb = _sb([POLL_CLOSED], {"p-40": _votes(40)})
        out = await snapshot_closed_editions(sb, "admin-1", NOW)
        assert out["snapshot_failed"] == ["pulso-semanal-2026-w40"] and out["snapshotted"] == []

    @pytest.mark.asyncio
    async def test_publish_due_incluye_el_snapshot(self):
        sb = _sb([POLL_CLOSED], {"p-40": _votes(40)})
        summary = await series_publisher.publish_due_series(sb, "admin-1", now=NOW)
        assert summary["snapshotted"] == ["pulso-semanal-2026-w40"] and summary["snapshot_failed"] == []


# ═══ Tendencia ═══

class TestTrend:
    @pytest.mark.asyncio
    async def test_usa_snapshot_para_cerradas_y_vivo_para_la_abierta(self):
        sb = _sb([POLL_CLOSED, POLL_OPEN], {"p-40": _votes(40), "p-41": _votes(35)})
        await snapshot_closed_editions(sb, "admin-1", NOW)
        # Los votos de la cerrada cambian DESPUÉS del snapshot: el trend debe seguir mostrando el snapshot.
        sb.db["poll_votes"] = [v for v in sb.db["poll_votes"] if v["poll_id"] != "p-40"]
        trend = await load_series_trend(sb, SERIES, 52, NOW)
        closed, open_ = trend["points"]
        assert [p["edition"] for p in trend["points"]] == ["2026-W40", "2026-W41"]
        assert closed["verified_votes"] == 40 and closed["is_open"] is False
        assert open_["verified_votes"] == 35 and open_["is_open"] is True

    @pytest.mark.asyncio
    async def test_grupo_bajo_el_minimo_no_publica_resultados(self):
        sb = _sb([POLL_OPEN], {"p-41": _votes(MIN_N - 1, 10)})
        q = (await load_series_trend(sb, SERIES, 52, NOW))["points"][0]["questions"][0]
        assert q["verified"] == {"n": MIN_N - 1, "suppressed": True, "results": None}
        assert q["total"]["suppressed"] is False and q["total"]["results"] is not None  # 39 respuestas

    @pytest.mark.asyncio
    async def test_exactamente_el_minimo_si_publica(self):
        sb = _sb([POLL_OPEN], {"p-41": _votes(MIN_N)})
        q = (await load_series_trend(sb, SERIES, 52, NOW))["points"][0]["questions"][0]
        assert q["verified"]["suppressed"] is False and q["verified"]["results"][0]["option"] == "Aprueba"

    @pytest.mark.asyncio
    async def test_expone_template_version_para_cortar_la_linea(self):
        sb = _sb([POLL_CLOSED, {**POLL_OPEN, "template_version": 2}], {})
        versions = [p["template_version"] for p in (await load_series_trend(sb, SERIES, 52, NOW))["points"]]
        assert versions == [1, 2]

    @pytest.mark.asyncio
    async def test_escala_expone_sus_limites(self):
        sb = _sb([POLL_OPEN], {"p-41": _votes(MIN_N)})
        scale = (await load_series_trend(sb, SERIES, 52, NOW))["points"][0]["questions"][1]
        assert (scale["type"], scale["scale_min"], scale["scale_max"]) == ("scale", 1, 7)

    @pytest.mark.asyncio
    async def test_eventos_propios_y_generales_dentro_del_rango(self):
        sb = _sb([POLL_CLOSED, POLL_OPEN])
        sb.db["series_events"] = [
            {"series_id": "s-1", "event_date": "2026-10-10", "label": "Propio"},
            {"series_id": None, "event_date": "2026-10-08", "label": "General"},
            {"series_id": "s-1", "event_date": "2020-01-01", "label": "Antes del rango"},
            {"series_id": "s-otra", "event_date": "2026-10-09", "label": "Otra serie"},
        ]
        events = (await load_series_trend(sb, SERIES, 52, NOW))["events"]
        assert [e["label"] for e in events] == ["General", "Propio"]

    @pytest.mark.asyncio
    async def test_serie_sin_ediciones(self):
        trend = await load_series_trend(_sb([]), SERIES, 52, NOW)
        assert trend["points"] == [] and trend["events"] == [] and trend["min_n"] == MIN_N


# ═══ Endpoints ═══

def _public_client(monkeypatch, sb):
    monkeypatch.setattr(series_endpoints, "get_async_supabase_client", lambda: sb)
    app = FastAPI()
    app.include_router(series_endpoints.router)
    return TestClient(app)


class TestPublicEndpoints:
    def test_trend_200_con_cache_control(self, monkeypatch):
        client = _public_client(monkeypatch, _sb([POLL_OPEN], {"p-41": _votes(MIN_N)}))
        res = client.get("/series/pulso-semanal/trend")
        assert res.status_code == 200
        assert "max-age=60" in res.headers["cache-control"]
        assert res.json()["series"]["cadence"] == "weekly" and len(res.json()["points"]) == 1

    def test_trend_404(self, monkeypatch):
        assert _public_client(monkeypatch, _sb([])).get("/series/no-existe/trend").status_code == 404

    def test_limit_fuera_de_rango_422(self, monkeypatch):
        client = _public_client(monkeypatch, _sb([]))
        assert client.get("/series/pulso-semanal/trend?limit=0").status_code == 422
        assert client.get("/series/pulso-semanal/trend?limit=105").status_code == 422

    def test_lista_solo_series_activas_sin_exponer_preguntas(self, monkeypatch):
        sb = _sb([])
        sb.db["poll_series"].append({**SERIES, "id": "s-2", "slug": "pausada", "is_active": False})
        items = _public_client(monkeypatch, sb).get("/series").json()["items"]
        assert [i["slug"] for i in items] == ["pulso-semanal"]


# ═══ Eventos anotados (admin) ═══

@pytest.fixture
def events_env(monkeypatch, _audit):
    sb = FakeSupabase([SERIES])
    monkeypatch.setattr(series_events_admin, "get_async_supabase_client", lambda: sb)
    app = FastAPI()
    app.include_router(series_events_admin.router)
    app.dependency_overrides[require_admin_role] = lambda: {"user_id": "admin-1"}
    return TestClient(app), sb


class TestSeriesEventsAdmin:
    def test_crea_evento_general_y_audita(self, events_env, _audit):
        client, sb = events_env
        res = client.post("/admin/series-events", json={"event_date": "2026-10-08", "label": "  Cambio de gabinete "})
        assert res.status_code == 201
        assert sb.db["series_events"][0]["label"] == "Cambio de gabinete" and sb.db["series_events"][0]["series_id"] is None
        assert [e["action"] for e in _audit] == ["OVERLORD_ACTION_CREATE_SERIES_EVENT"]

    def test_serie_inexistente_404(self, events_env):
        client, sb = events_env
        res = client.post("/admin/series-events", json={"series_id": "nada", "event_date": "2026-10-08", "label": "x"})
        assert res.status_code == 404 and sb.db.get("series_events", []) == []

    def test_valida_etiqueta_y_fecha(self, events_env):
        client, _ = events_env
        assert client.post("/admin/series-events", json={"event_date": "2026-10-08", "label": ""}).status_code == 422
        assert client.post("/admin/series-events", json={"event_date": "2026-10-08", "label": "x" * 121}).status_code == 422
        assert client.post("/admin/series-events", json={"event_date": "no-es-fecha", "label": "x"}).status_code == 422

    def test_elimina_y_audita(self, events_env, _audit):
        client, sb = events_env
        client.post("/admin/series-events", json={"series_id": "s-1", "event_date": "2026-10-08", "label": "Hito"})
        event_id = sb.db["series_events"][0]["id"]
        assert client.delete(f"/admin/series-events/{event_id}").status_code == 200
        assert sb.db["series_events"] == []
        assert [e["action"] for e in _audit][-1] == "OVERLORD_ACTION_DELETE_SERIES_EVENT"
        assert client.delete(f"/admin/series-events/{event_id}").status_code == 404

    def test_lista_filtra_por_serie(self, events_env):
        client, _ = events_env
        client.post("/admin/series-events", json={"series_id": "s-1", "event_date": "2026-10-08", "label": "A"})
        client.post("/admin/series-events", json={"event_date": "2026-10-09", "label": "B"})
        assert len(client.get("/admin/series-events").json()["items"]) == 2
        assert [e["label"] for e in client.get("/admin/series-events?series_id=s-1").json()["items"]] == ["A"]
