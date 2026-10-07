"""
BEACON PROTOCOL — Tests: límites de escala con scale_points y scale_min/max en None
====================================================================================
Regresión del 500 en GET /polls/by-slug/<edición> del Barómetro: la pregunta de
escala por puntos se guarda con scale_min/scale_max = None y `dict.get(clave, 1)`
devolvía None.
"""

import json


from app.api.v1.endpoints.polls import _aggregate, _aggregate_by_question
from app.core.polls.scale import scale_bounds

POR_PUNTOS = {
    "id": "q1", "text": "Nota", "type": "scale", "order_index": 0,
    "scale_points": 7, "scale_min": None, "scale_max": None,
    "scale_labels": ["1", "2", "3", "4", "5", "6", "7"],
}


class TestScaleBounds:
    def test_por_puntos_con_extremos_en_none(self):
        assert scale_bounds(POR_PUNTOS) == (1, 7)

    def test_por_extremos(self):
        assert scale_bounds({"scale_min": 2, "scale_max": 8}) == (2, 8)

    def test_extremos_ganan_sobre_puntos(self):
        assert scale_bounds({"scale_min": 1, "scale_max": 4, "scale_points": 7}) == (1, 4)

    def test_sin_datos_usa_1_a_5(self):
        assert scale_bounds({}) == (1, 5)


class TestAggregateConScalePoints:
    def test_agregado_por_pregunta_no_revienta_y_cubre_los_7_puntos(self):
        poll = {"questions": [POR_PUNTOS]}
        votes = [{"option_value": "5", "voter_rank": "VERIFIED"}, {"option_value": "7", "voter_rank": "BASIC"}]
        out = _aggregate_by_question(poll, votes)[0]
        assert [r["option"] for r in out["results"]] == ["1", "2", "3", "4", "5", "6", "7"]
        assert out["results"][0]["average"] == 6.0
        assert (out["scale_min"], out["scale_max"]) == (1, 7)

    def test_agregado_de_una_pregunta(self):
        poll = {"questions": [POR_PUNTOS]}
        res = _aggregate(poll, [{"option_value": "3", "voter_rank": "VERIFIED"}])
        assert len(res) == 7 and res[2]["count"] == 1

    def test_multi_pregunta_con_escala_por_puntos(self):
        poll = {"questions": [
            {"id": "a", "text": "¿Aprueba?", "type": "multiple_choice", "options": ["Sí", "No"], "order_index": 0},
            {**POR_PUNTOS, "id": "b", "order_index": 1},
        ]}
        votes = [{"option_value": json.dumps({"a": "Sí", "b": "6"}), "voter_rank": "VERIFIED"}]
        by_q = _aggregate_by_question(poll, votes)
        assert by_q[0]["results"][0] == {"option": "Sí", "count": 1, "pct": 100.0}
        assert by_q[1]["results"][0]["average"] == 6.0
