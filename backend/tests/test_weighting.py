"""
BEACON PROTOCOL — Tests: ponderación (raking, recorte, compuertas)
===================================================================
Datos sintéticos y deterministas. Verifican que los pesos devuelven las proporciones
objetivo, que ningún votante domina, y que bajo las compuertas NO se publica nada.
"""

import random
from dataclasses import replace

import pytest

from app.core.weighting.config import DEFAULT_CONFIG
from app.core.weighting.engine import compute_weights
from app.core.weighting.raking import weighted_shares
from app.core.weighting.stats import design_effect, kish_n_eff
from app.core.weighting.targets import Targets

TARGETS = Targets(
    version="test-1",
    source="sintético",
    marginals={
        "sex": {"M": 0.49, "F": 0.51},
        "age": {"18-34": 0.30, "35-54": 0.38, "55+": 0.32},
        "zone": {"norte": 0.20, "centro": 0.55, "sur": 0.25},
    },
)


def _sample(n, sex=(0.65, 0.35), age=(0.45, 0.38, 0.17), zone=(0.2, 0.6, 0.2), seed=7):
    rng = random.Random(seed)
    return [
        {
            "sex": rng.choices(["M", "F"], sex)[0],
            "age": rng.choices(["18-34", "35-54", "55+"], age)[0],
            "zone": rng.choices(["norte", "centro", "sur"], zone)[0],
        }
        for _ in range(n)
    ]


class TestTargets:
    def test_proporciones_deben_sumar_uno(self):
        with pytest.raises(ValueError, match="suman"):
            Targets(version="x", source="x", marginals={"sex": {"M": 0.5, "F": 0.6}})

    def test_proporcion_no_positiva_rechazada(self):
        with pytest.raises(ValueError, match="> 0"):
            Targets(version="x", source="x", marginals={"sex": {"M": 1.0, "F": 0.0}})

    def test_sin_variables_rechazado(self):
        with pytest.raises(ValueError):
            Targets(version="x", source="x", marginals={})


class TestStats:
    def test_pesos_iguales_n_eff_es_n(self):
        assert kish_n_eff([1.0] * 50) == pytest.approx(50)
        assert design_effect([1.0] * 50) == pytest.approx(1)

    def test_pesos_desiguales_bajan_n_eff(self):
        weights = [1.0] * 50 + [5.0] * 5
        assert kish_n_eff(weights) < len(weights)
        assert design_effect(weights) > 1

    def test_vacio(self):
        assert kish_n_eff([]) == 0.0 and design_effect([]) == 0.0


class TestRaking:
    def test_las_proporciones_ponderadas_igualan_las_objetivo(self):
        respondents = _sample(600)
        result = compute_weights(respondents, TARGETS)
        assert result.status == "ok"
        weights = [w for w in result.weights if w is not None]
        for variable, target in TARGETS.marginals.items():
            shares = weighted_shares(respondents, weights, variable)
            for category, goal in target.items():
                assert shares[category] == pytest.approx(goal, abs=2e-3)

    def test_pesos_promedio_uno_y_dentro_del_recorte(self):
        result = compute_weights(_sample(600), TARGETS)
        weights = [w for w in result.weights if w is not None]
        assert sum(weights) / len(weights) == pytest.approx(1.0, abs=1e-6)
        assert min(weights) >= DEFAULT_CONFIG.trim_low - 1e-9
        assert max(weights) <= DEFAULT_CONFIG.trim_high + 1e-9

    def test_ponderar_cuesta_precision_y_se_informa(self):
        result = compute_weights(_sample(600), TARGETS)
        assert result.n_eff is not None and result.n_eff < 600
        assert result.design_effect > 1

    def test_es_determinista(self):
        a = compute_weights(_sample(600), TARGETS)
        b = compute_weights(_sample(600), TARGETS)
        assert a.weights == b.weights and a.n_eff == b.n_eff

    def test_muestra_ya_balanceada_da_pesos_cercanos_a_uno(self):
        balanced = _sample(2000, sex=(0.49, 0.51), age=(0.30, 0.38, 0.32), zone=(0.20, 0.55, 0.25), seed=11)
        result = compute_weights(balanced, TARGETS)
        assert result.status == "ok" and result.design_effect < 1.1


class TestDatosFaltantes:
    def test_pesos_alineados_con_la_entrada_y_excluidos_informados(self):
        respondents = _sample(600)
        respondents[3]["age"] = None          # dato faltante
        respondents[10]["sex"] = "Otro"       # fuera de las categorías objetivo
        del respondents[20]["zone"]           # variable ausente
        result = compute_weights(respondents, TARGETS)
        assert result.status == "ok"
        assert len(result.weights) == 600
        assert [result.weights[i] for i in (3, 10, 20)] == [None, None, None]
        assert result.n_excluded == 3 and result.n_complete == 597 and result.n_input == 600
        assert all(w is not None for i, w in enumerate(result.weights) if i not in (3, 10, 20))


class TestCompuertas:
    def test_pocos_casos_completos_no_se_pondera(self):
        result = compute_weights(_sample(DEFAULT_CONFIG.min_complete - 1), TARGETS)
        assert result.status == "unavailable"
        assert any("se requieren al menos 200" in reason for reason in result.reasons)
        assert result.weights == [None] * (DEFAULT_CONFIG.min_complete - 1)

    def test_categoria_con_menos_de_min_cell_no_se_pondera(self):
        rows = _sample(400, zone=(0.5, 0.5, 0.0))      # nadie en «sur»
        result = compute_weights(rows, TARGETS)
        assert result.status == "unavailable"
        assert any("«zone»" in reason and "sur" in reason for reason in result.reasons)

    def test_desbalance_extremo_no_converge_y_no_se_publica(self):
        rows = _sample(600, sex=(0.97, 0.03))          # exigiría pesos > 3 para las mujeres
        result = compute_weights(rows, TARGETS)
        assert result.status == "unavailable"
        assert any("no alcanzó" in reason for reason in result.reasons)
        assert all(w is None for w in result.weights)

    def test_n_efectivo_bajo_no_se_publica(self):
        strict = replace(DEFAULT_CONFIG, min_n_eff=590.0)
        result = compute_weights(_sample(600), TARGETS, strict)
        assert result.status == "unavailable"
        assert any("tamaño muestral efectivo" in reason for reason in result.reasons)

    def test_produccion_de_hoy_4_verificados_no_se_pondera(self):
        result = compute_weights(_sample(4), TARGETS)
        assert result.status == "unavailable" and result.n_complete == 4


class TestMeta:
    def test_meta_no_expone_pesos_ni_datos_individuales(self):
        meta = compute_weights(_sample(600), TARGETS).meta()
        assert "weights" not in meta
        assert meta["status"] == "ok" and meta["targets_version"] == "test-1" and meta["config_version"] == 1
        assert meta["n_input"] == 600 and meta["n_eff"] < 600
