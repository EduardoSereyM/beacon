"""
BEACON PROTOCOL — Tests: ponderación de ediciones de series (demografía, marginales, tendencia)
================================================================================================
"""

import json
import random
from datetime import datetime, timedelta, timezone

import pytest

from app.core.polls.aggregation import aggregate_by_question
from app.core.polls_series import series_snapshot
from app.core.polls_series.series_snapshot import snapshot_closed_editions
from app.core.polls_series.series_trend import load_series_trend
from app.core.polls_series.series_weighting import weight_edition
from app.core.weighting.demographics import age_band, respondent_from_user, sex_from_gender, zone_from_region
from app.core.weighting.engine import compute_weights
from app.core.weighting.targets_loader import DATA_FILE, load_targets
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


@pytest.fixture(autouse=True)
def _audit(monkeypatch):
    async def fake(**_kwargs):
        return None

    monkeypatch.setattr(series_snapshot.audit_bus, "alog_event", fake)


# ═══ Demografía ═══

class TestDemographics:
    @pytest.mark.parametrize("region, zone", [
        ("Metropolitana", "Metropolitana"), ("Región Metropolitana de Santiago", "Metropolitana"),
        ("Arica y Parinacota", "Norte"), ("Tarapacá", "Norte"), ("Coquimbo", "Norte"),
        ("Valparaíso", "Centro"), ("O'Higgins", "Centro"), ("Maule", "Centro"),
        ("Ñuble", "Sur"), ("Biobío", "Sur"), ("La Araucanía", "Sur"), ("Magallanes", "Sur"),
        ("  los ríos ", "Sur"), ("Atlántida", None), ("", None), (None, None),
    ])
    def test_zona(self, region, zone):
        assert zone_from_region(region) == zone

    def test_las_16_regiones_del_formulario_tienen_zona(self):
        regions = ["Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo", "Valparaíso", "Metropolitana",
                   "O'Higgins", "Maule", "Ñuble", "Biobío", "La Araucanía", "Los Ríos", "Los Lagos", "Aysén", "Magallanes"]
        assert all(zone_from_region(r) for r in regions)

    @pytest.mark.parametrize("gender, sex", [
        ("Masculino", "Masculino"), ("femenino", "Femenino"), ("No binario", None), ("Prefiero no decir", None), (None, None),
    ])
    def test_sexo(self, gender, sex):
        assert sex_from_gender(gender) == sex

    @pytest.mark.parametrize("birth, band", [
        (2008, "18-34"), (1992, "18-34"), (1991, "35-54"), (1972, "35-54"), (1971, "55+"),
        (2010, None), (1800, None), (None, None), (True, None), ("1990", None),
    ])
    def test_grupo_de_edad(self, birth, band):
        assert age_band(birth, 2026) == band

    def test_respondiente_incompleto_deja_none_en_lo_que_falta(self):
        r = respondent_from_user({"region": "Maule", "gender": "No binario", "birth_year": 1980}, 2026)
        assert r == {"zone": "Centro", "sex": None, "age": "35-54"}


# ═══ Marginales del Censo 2024 ═══

class TestTargetsFile:
    def test_carga_y_valida(self):
        t = load_targets()
        assert t.version == "censo2024-18plus-v1" and set(t.variables) == {"zone", "sex", "age"}
        assert set(t.marginals["zone"]) == {"Norte", "Centro", "Metropolitana", "Sur"}

    def test_trae_fuente_citable_y_hash(self):
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        assert raw["source_url"].startswith("https://censo2024.ine.gob.cl/")
        assert len(raw["source_sha256"]) == 64 and "Censo" in raw["source"]

    def test_los_conteos_publicados_cuadran_con_las_proporciones(self):
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        for variable, counts in raw["counts"].items():
            assert abs(sum(counts.values()) - raw["adult_population"]) <= 3        # redondeo de conteos
            for category, count in counts.items():
                assert raw["marginals"][variable][category] == pytest.approx(count / raw["adult_population"], abs=1e-5)

    def test_magnitudes_plausibles(self):
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        assert 13_000_000 < raw["adult_population"] < 15_500_000      # ~78 % de los 18,48 M censados
        assert 0.38 < raw["marginals"]["zone"]["Metropolitana"] < 0.43
        assert raw["marginals"]["sex"]["Femenino"] > raw["marginals"]["sex"]["Masculino"]


# ═══ Agregación ponderada ═══

class TestWeightedAggregation:
    VOTES = [{"option_value": "Aprueba"}, {"option_value": "Aprueba"}, {"option_value": "Desaprueba"}]

    def test_sin_pesos_no_cambia(self):
        poll = {"questions": [QUESTION]}
        assert aggregate_by_question(poll, self.VOTES) == aggregate_by_question(poll, self.VOTES, [1.0, 1.0, 1.0])

    def test_pct_ponderado_y_conteo_sin_ponderar(self):
        out = aggregate_by_question({"questions": [QUESTION]}, self.VOTES, [1.0, 1.0, 2.0])[0]
        assert [r["pct"] for r in out["results"]] == [50.0, 50.0]            # (1+1)/4 y 2/4
        assert [r["count"] for r in out["results"]] == [2, 1] and out["total_votes"] == 3

    def test_promedio_ponderado_en_escala(self):
        scale = {"id": "q", "text": "Nota", "type": "scale", "scale_points": 7, "order_index": 0}
        votes = [{"option_value": "2"}, {"option_value": "6"}]
        out = aggregate_by_question({"questions": [scale]}, votes, [3.0, 1.0])[0]
        assert out["results"][0]["average"] == 3.0                           # (2*3 + 6*1) / 4

    def test_largo_de_pesos_incorrecto(self):
        with pytest.raises(ValueError):
            aggregate_by_question({"questions": [QUESTION]}, self.VOTES, [1.0])


# ═══ Ponderación de una edición ═══

def _electorate(n, seed=3):
    """Votantes verificados con demografía sesgada (55 % RM, 65 % hombres, jóvenes) y voto correlacionado con la zona."""
    rng = random.Random(seed)
    users, votes = [], []
    for i in range(n):
        region = rng.choices(["Metropolitana", "Arica y Parinacota", "Valparaíso", "Biobío"], [0.55, 0.10, 0.15, 0.20])[0]
        users.append({
            "id": f"u{i}", "region": region, "gender": rng.choices(["Masculino", "Femenino"], [0.65, 0.35])[0],
            "birth_year": rng.choices([2000, 1980, 1960], [0.45, 0.38, 0.17])[0],
        })
        approve = 0.6 if region == "Metropolitana" else 0.3
        votes.append({"poll_id": "p-1", "user_id": f"u{i}", "voter_rank": "VERIFIED",
                      "option_value": "Aprueba" if rng.random() < approve else "Desaprueba"})
    return users, votes


def _sb(users, votes, polls=(POLL_OPEN,)):
    sb = FakeSupabase([SERIES], [dict(p) for p in polls])
    sb.db["users"], sb.db["poll_votes"] = users, votes
    return sb


class TestWeightEdition:
    @pytest.mark.asyncio
    async def test_pondera_y_coincide_con_el_calculo_independiente(self):
        users, votes = _electorate(400)
        results, meta = await weight_edition(_sb(users, votes), POLL_OPEN, votes)
        assert meta["status"] == "ok" and meta["targets_version"] == "censo2024-18plus-v1"

        respondents = [respondent_from_user(u, 2026) for u in users]
        weights = compute_weights(respondents, load_targets()).weights
        expected = sum(w for v, w in zip(votes, weights, strict=True) if v["option_value"] == "Aprueba") / sum(weights)
        assert results[0]["results"][0]["pct"] == pytest.approx(expected * 100, abs=0.06)

    @pytest.mark.asyncio
    async def test_la_ponderacion_corrige_el_sesgo_de_composicion(self):
        users, votes = _electorate(400)
        results, _ = await weight_edition(_sb(users, votes), POLL_OPEN, votes)
        raw = sum(v["option_value"] == "Aprueba" for v in votes) / len(votes) * 100
        assert abs(results[0]["results"][0]["pct"] - raw) > 1.0       # RM sobrerrepresentada y aprueba más

    @pytest.mark.asyncio
    async def test_pocos_votantes_no_se_pondera(self):
        users, votes = _electorate(4)
        results, meta = await weight_edition(_sb(users, votes), POLL_OPEN, votes)
        assert results is None and meta["status"] == "unavailable" and meta["n_complete"] <= 4
        assert meta["reasons"] and "weights" not in meta

    @pytest.mark.asyncio
    async def test_votos_basicos_y_sin_usuario_no_cuentan(self):
        users, votes = _electorate(400)
        extra = [{"poll_id": "p-1", "user_id": None, "voter_rank": "VERIFIED", "option_value": "Aprueba"},
                 {"poll_id": "p-1", "user_id": "u0", "voter_rank": "BASIC", "option_value": "Aprueba"}]
        _, meta = await weight_edition(_sb(users, votes + extra), POLL_OPEN, votes + extra)
        assert meta["n_input"] == 401 and meta["n_excluded"] == 1       # solo el VERIFIED sin usuario


# ═══ Snapshot y tendencia ═══

def _no_user_ids(payload) -> bool:
    text = json.dumps(payload)
    return "user_id" not in text and '"u1"' not in text and "birth_year" not in text and "gender" not in text


class TestTrendWeighted:
    @pytest.mark.asyncio
    async def test_edicion_abierta_expone_grupo_ponderado_y_metadatos(self):
        users, votes = _electorate(400)
        trend = await load_series_trend(_sb(users, votes), SERIES, 52, NOW)
        point = trend["points"][0]
        assert point["weighting"]["status"] == "ok" and point["weighting"]["n_eff"] < point["weighting"]["n_complete"]
        weighted = point["questions"][0]["weighted"]
        assert weighted["suppressed"] is False and weighted["results"][0]["option"] == "Aprueba"
        assert _no_user_ids(trend)

    @pytest.mark.asyncio
    async def test_sin_datos_suficientes_el_ponderado_queda_no_disponible_con_motivo(self):
        users, votes = _electorate(10)
        point = (await load_series_trend(_sb(users, votes), SERIES, 52, NOW))["points"][0]
        assert point["weighting"]["status"] == "unavailable" and point["weighting"]["reasons"]
        assert point["questions"][0]["weighted"] == {"n": 0, "suppressed": True, "results": None}

    @pytest.mark.asyncio
    async def test_snapshot_guarda_ponderacion_y_la_tendencia_la_lee_de_ahi(self):
        users, votes = _electorate(400)
        votes = [{**v, "poll_id": "p-0"} for v in votes]
        sb = _sb(users, votes, polls=(POLL_CLOSED,))
        await snapshot_closed_editions(sb, "admin-1", NOW)
        row = sb.db["poll_results_snapshot"][0]
        assert row["results_weighted"] is not None and row["weighting_meta"]["status"] == "ok"

        sb.db["users"] = []         # aunque la demografía cambie después, el cierre queda como se fotografió
        point = (await load_series_trend(sb, SERIES, 52, NOW))["points"][0]
        assert point["weighting"] == row["weighting_meta"]
        assert point["questions"][0]["weighted"]["suppressed"] is False
        assert _no_user_ids(point)

    @pytest.mark.asyncio
    async def test_snapshot_anterior_a_la_migracion_queda_no_disponible(self):
        sb = _sb([], [], polls=(POLL_CLOSED,))
        sb.db["poll_results_snapshot"] = [{
            "poll_id": "p-0", "series_id": "s-1", "edition": "2026-W40", "template_version": 1, "total_votes": 40,
            "verified_votes": 40,
            "results_total": [{"question_id": "q1", "question_text": "¿Aprueba?", "question_type": "multiple_choice", "total_votes": 40, "results": []}],
            "results_verified": [{"question_id": "q1", "question_text": "¿Aprueba?", "question_type": "multiple_choice", "total_votes": 40, "results": []}],
        }]
        point = (await load_series_trend(sb, SERIES, 52, NOW))["points"][0]
        assert point["weighting"] is None and point["questions"][0]["weighted"]["suppressed"] is True
