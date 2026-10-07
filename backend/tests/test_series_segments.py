"""
BEACON PROTOCOL — Tests: resultados por segmento de una edición
================================================================
Cálculo puro, supresión por n, interruptor de la posición política, snapshot, cargador y endpoint.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import series as series_endpoints
from app.core.config import settings
from app.core.polls_series import series_snapshot
from app.core.polls_series.privacy import MIN_N
from app.core.polls_series.series_analysis import analyze_edition
from app.core.polls_series.series_segments import compute_segments
from app.core.polls_series.series_segments_loader import load_edition_segments
from app.core.polls_series.series_snapshot import snapshot_closed_editions
from tests.fake_supabase import FakeSupabase

NOW = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)
QUESTION = {"id": "q1", "text": "¿Aprueba?", "type": "multiple_choice", "options": ["Aprueba", "Desaprueba"], "order_index": 0}
SERIES = {"id": "s-1", "slug": "pulso", "title": "Pulso", "cadence": "weekly", "category": "politica",
          "context": None, "is_active": True, "template_version": 1, "questions": [QUESTION]}
POLL_OPEN = {"id": "p-1", "slug": "pulso-2026-w41", "series_id": "s-1", "edition": "2026-W41",
             "starts_at": (NOW - timedelta(days=2)).isoformat(), "ends_at": (NOW + timedelta(days=5)).isoformat(),
             "template_version": 1, "questions": [QUESTION]}
POLL_CLOSED = {**POLL_OPEN, "id": "p-0", "slug": "pulso-2026-w40", "edition": "2026-W40",
               "starts_at": (NOW - timedelta(days=9)).isoformat(), "ends_at": (NOW - timedelta(days=2)).isoformat()}


def _population(poll_id="p-1"):
    """100 votantes verificados: 60 hombres (30 aprueban) y 40 mujeres (10 aprueban); 60 Metropolitana, 40 Sur."""
    users, votes = [], []
    for i in range(100):
        man = i < 60
        users.append({
            "id": f"u{i}", "gender": "Masculino" if man else "Femenino", "birth_year": 1980 if i % 2 else 1960,
            "region": "Metropolitana" if i < 60 else "Biobío",
            "political_position": "Centro" if i < 50 else ("Derecha" if i < 70 else None),
        })
        approves = (i < 30) if man else (60 <= i < 70)
        votes.append({"poll_id": poll_id, "user_id": f"u{i}", "voter_rank": "VERIFIED",
                      "option_value": "Aprueba" if approves else "Desaprueba"})
    return users, votes


def _by_user(users):
    return {u["id"]: u for u in users}


def _group(segments, variable, key):
    segment = next(s for s in segments if s["variable"] == variable)
    return next(g for g in segment["groups"] if g["key"] == key)


@pytest.fixture(autouse=True)
def _audit(monkeypatch):
    async def fake(**_kwargs):
        return None

    monkeypatch.setattr(series_snapshot.audit_bus, "alog_event", fake)


class TestComputeSegments:
    def test_cuenta_y_resultados_por_sexo(self):
        users, votes = _population()
        segments = compute_segments(_by_user(users), POLL_OPEN, votes, 2026)
        men, women = _group(segments, "sex", "Masculino"), _group(segments, "sex", "Femenino")
        assert (men["n"], women["n"]) == (60, 40)
        assert men["questions"][0]["results"][0] == {"option": "Aprueba", "count": 30, "pct": 50.0}
        assert women["questions"][0]["results"][0]["pct"] == 25.0

    def test_zona_y_edad(self):
        users, votes = _population()
        segments = compute_segments(_by_user(users), POLL_OPEN, votes, 2026)
        assert (_group(segments, "zone", "Metropolitana")["n"], _group(segments, "zone", "Sur")["n"]) == (60, 40)
        assert _group(segments, "zone", "Norte")["n"] == 0
        assert _group(segments, "age", "35-54")["n"] == 50 and _group(segments, "age", "55+")["n"] == 50

    def test_grupo_bajo_el_minimo_no_publica_resultados(self):
        users, votes = _population()
        segments = compute_segments(_by_user(users), POLL_OPEN, votes[:70], 2026)       # solo 10 mujeres
        women = _group(segments, "sex", "Femenino")
        assert women["n"] == 10 and women["questions"][0] == {
            "question_id": "q1", "type": "multiple_choice", "n": 10, "suppressed": True, "results": None}

    def test_exactamente_el_minimo_si_publica(self):
        users, votes = _population()
        men = [v for v in votes if int(v["user_id"][1:]) < MIN_N]
        row = _group(compute_segments(_by_user(users), POLL_OPEN, men, 2026), "sex", "Masculino")["questions"][0]
        assert row["suppressed"] is False and row["results"] is not None

    def test_dato_faltante_excluye_de_esa_variable_pero_no_de_las_demas(self):
        users, votes = _population()
        users[0]["gender"] = None
        segments = compute_segments(_by_user(users), POLL_OPEN, votes, 2026)
        assert _group(segments, "sex", "Masculino")["n"] == 59
        assert _group(segments, "zone", "Metropolitana")["n"] == 60

    def test_la_posicion_politica_no_se_calcula_si_esta_apagada(self):
        users, votes = _population()
        assert [s["variable"] for s in compute_segments(_by_user(users), POLL_OPEN, votes, 2026)] == ["sex", "age", "zone"]

    def test_la_posicion_politica_se_calcula_si_esta_encendida(self):
        users, votes = _population()
        segments = compute_segments(_by_user(users), POLL_OPEN, votes, 2026, include_political=True)
        assert [s["variable"] for s in segments][-1] == "political"
        assert (_group(segments, "political", "Centro")["n"], _group(segments, "political", "Derecha")["n"]) == (50, 20)
        assert _group(segments, "political", "Izquierda")["n"] == 0

    def test_no_expone_ids_ni_datos_individuales(self):
        users, votes = _population()
        text = json.dumps(compute_segments(_by_user(users), POLL_OPEN, votes, 2026, include_political=True))
        assert "user_id" not in text and '"u1"' not in text and "birth_year" not in text and "region" not in text

    def test_escala_incluye_sus_limites(self):
        scale = {"id": "q", "text": "Nota", "type": "scale", "scale_points": 7, "order_index": 0}
        users, votes = _population()
        votes = [{**v, "option_value": "5"} for v in votes]
        row = _group(compute_segments(_by_user(users), {**POLL_OPEN, "questions": [scale]}, votes, 2026), "sex", "Masculino")["questions"][0]
        assert (row["type"], row["scale_min"], row["scale_max"]) == ("scale", 1, 7)


class TestSwitch:
    def test_apagado_por_defecto(self):
        assert settings.SERIES_POLITICAL_SEGMENT_ENABLED is False

    @pytest.mark.asyncio
    async def test_analyze_edition_respeta_el_interruptor(self, monkeypatch):
        users, votes = _population()
        sb = FakeSupabase([SERIES], [dict(POLL_OPEN)])
        sb.db["users"], sb.db["poll_votes"] = users, votes
        off = await analyze_edition(sb, POLL_OPEN, votes)
        monkeypatch.setattr(settings, "SERIES_POLITICAL_SEGMENT_ENABLED", True)
        on = await analyze_edition(sb, POLL_OPEN, votes)
        assert "political" not in [s["variable"] for s in off.segments]
        assert "political" in [s["variable"] for s in on.segments]


def _sb(polls=(POLL_OPEN,), snapshots=()):
    users, votes = _population()
    sb = FakeSupabase([SERIES], [dict(p) for p in polls])
    sb.db["users"], sb.db["poll_votes"] = users, votes
    sb.db["poll_results_snapshot"] = [dict(s) for s in snapshots]
    return sb


class TestSnapshotAndLoader:
    @pytest.mark.asyncio
    async def test_el_snapshot_guarda_los_segmentos(self):
        users, votes = _population("p-0")
        sb = _sb(polls=(POLL_CLOSED,))
        sb.db["poll_votes"] = votes
        await snapshot_closed_editions(sb, "admin-1", NOW)
        row = sb.db["poll_results_snapshot"][0]
        assert [s["variable"] for s in row["results_segments"]] == ["sex", "age", "zone"]

    @pytest.mark.asyncio
    async def test_edicion_abierta_se_calcula_en_vivo(self):
        out = await load_edition_segments(_sb(), SERIES, None, NOW)
        assert out["edition"] == "2026-W41" and out["is_open"] is True and out["min_n"] == MIN_N
        assert _group(out["segments"], "sex", "Masculino")["n"] == 60

    @pytest.mark.asyncio
    async def test_edicion_cerrada_lee_el_snapshot_y_no_recalcula(self):
        stored = [{"variable": "sex", "label": "Sexo", "groups": [{"key": "Masculino", "label": "Hombres", "n": 999, "questions": []}]}]
        sb = _sb(polls=(POLL_CLOSED,), snapshots=({"poll_id": "p-0", "results_segments": stored},))
        out = await load_edition_segments(sb, SERIES, "2026-W40", NOW)
        assert out["segments"] == stored

    @pytest.mark.asyncio
    async def test_snapshot_anterior_a_la_migracion_se_recalcula(self):
        sb = _sb(polls=(POLL_CLOSED,), snapshots=({"poll_id": "p-0", "results_segments": None},))
        sb.db["poll_votes"] = [{**v, "poll_id": "p-0"} for v in sb.db["poll_votes"]]
        out = await load_edition_segments(sb, SERIES, "2026-W40", NOW)
        assert _group(out["segments"], "sex", "Femenino")["n"] == 40

    @pytest.mark.asyncio
    async def test_oculta_la_politica_si_esta_apagada_aunque_el_snapshot_la_tenga(self):
        stored = [{"variable": "sex", "label": "Sexo", "groups": []}, {"variable": "political", "label": "Posición política", "groups": []}]
        sb = _sb(polls=(POLL_CLOSED,), snapshots=({"poll_id": "p-0", "results_segments": stored},))
        out = await load_edition_segments(sb, SERIES, "2026-W40", NOW)
        assert [s["variable"] for s in out["segments"]] == ["sex"]

    @pytest.mark.asyncio
    async def test_edicion_inexistente(self):
        assert await load_edition_segments(_sb(), SERIES, "2025-W01", NOW) is None


def _client(monkeypatch, sb):
    monkeypatch.setattr(series_endpoints, "get_async_supabase_client", lambda: sb)
    app = FastAPI()
    app.include_router(series_endpoints.router)
    return TestClient(app)


class TestEndpoint:
    def test_200_por_defecto_la_edicion_mas_reciente_con_cache(self, monkeypatch):
        res = _client(monkeypatch, _sb()).get("/series/pulso/segments")
        assert res.status_code == 200 and "max-age=60" in res.headers["cache-control"]
        assert res.json()["edition"] == "2026-W41"

    def test_edicion_pedida(self, monkeypatch):
        sb = _sb(polls=(POLL_OPEN, POLL_CLOSED))
        res = _client(monkeypatch, sb).get("/series/pulso/segments?edition=2026-W40")
        assert res.status_code == 200 and res.json()["edition"] == "2026-W40"

    def test_404_serie_y_edicion(self, monkeypatch):
        client = _client(monkeypatch, _sb())
        assert client.get("/series/no-existe/segments").status_code == 404
        assert client.get("/series/pulso/segments?edition=2025-W01").status_code == 404

    @pytest.mark.parametrize("edition", ["hoy", "2026-13-01", "2026-w41", "' OR 1=1"])
    def test_422_edicion_con_formato_invalido(self, monkeypatch, edition):
        assert _client(monkeypatch, _sb()).get("/series/pulso/segments", params={"edition": edition}).status_code == 422
