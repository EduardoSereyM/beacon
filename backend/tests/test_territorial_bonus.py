"""
BEACON PROTOCOL — Tests: Vínculo Territorial + Bonus 1.5x
===========================================================
Valida que:
  1. verify_territoriality detecta correctamente votos locales
  2. El bonus 1.5x se aplica en el motor de ranking
  3. Un voto local GOLD tiene más impacto que un voto no-local GOLD
  4. La cascada PROFILE → GEOIP → UNKNOWN funciona

"La verdad de un territorio la definen quienes lo habitan."
"""

import pytest

from app.services.geo_logic import (
    verify_territoriality,
    apply_territorial_bonus,
    LOCAL_VOTE_BONUS,
)
from app.logic.bayesian_ranking import BayesianRankingEngine


# ═══════════════════════════════════════════
#  TEST 1: Verificación Territorial
# ═══════════════════════════════════════════

class TestVerifyTerritoriality:
    """Valida la lógica de matching comuna → jurisdicción."""

    def test_local_vote_detected(self):
        """Misma comuna → is_local = True."""
        result = verify_territoriality(
            user_comuna_id=101,
            entity_jurisdiction_id=101,
        )
        assert result.is_local is True
        assert result.bonus_applied == LOCAL_VOTE_BONUS
        assert result.source == "PROFILE"

    def test_non_local_vote(self):
        """Comunas diferentes → is_local = False."""
        result = verify_territoriality(
            user_comuna_id=101,
            entity_jurisdiction_id=202,
        )
        assert result.is_local is False
        assert result.bonus_applied == 1.0

    def test_geoip_fallback(self):
        """Sin perfil, usa GeoIP como fallback."""
        result = verify_territoriality(
            user_comuna_id=None,
            entity_jurisdiction_id=303,
            geoip_comuna_id=303,
        )
        assert result.is_local is True
        assert result.source == "GEOIP"
        assert result.bonus_applied == LOCAL_VOTE_BONUS

    def test_no_data_no_bonus(self):
        """Sin datos de comuna ni GeoIP → no aplica bonus."""
        result = verify_territoriality(
            user_comuna_id=None,
            entity_jurisdiction_id=101,
            geoip_comuna_id=None,
        )
        assert result.is_local is False
        assert result.source == "UNKNOWN"
        assert result.bonus_applied == 1.0

    def test_entity_without_jurisdiction(self):
        """Entidad sin jurisdicción (ej: POLL) → no aplica bonus."""
        result = verify_territoriality(
            user_comuna_id=101,
            entity_jurisdiction_id=None,
        )
        assert result.is_local is False
        assert result.bonus_applied == 1.0

    def test_profile_takes_priority_over_geoip(self):
        """PROFILE tiene prioridad sobre GEOIP (incluso si difieren)."""
        result = verify_territoriality(
            user_comuna_id=101,
            entity_jurisdiction_id=101,
            geoip_comuna_id=999,  # GeoIP dice otra comuna
        )
        assert result.is_local is True
        assert result.source == "PROFILE"


# ═══════════════════════════════════════════
#  TEST 2: Bonus en Motor de Ranking
# ═══════════════════════════════════════════

class TestTerritorialBonusInRanking:
    """Valida que el bonus 1.5x se integra correctamente en el ranking."""

    def setup_method(self):
        self.engine = BayesianRankingEngine(
            confidence_threshold=30,
            global_mean=3.0,
            volume_saturation=100,
        )

    def test_local_vote_increases_score(self):
        """is_local=True debe producir un score 1.5x mayor."""
        score_no_local = self.engine.calculate_final_score(
            n_votes=50,
            raw_average=4.5,
            reputation_weight=2.5,
            is_local=False,
        )
        score_local = self.engine.calculate_final_score(
            n_votes=50,
            raw_average=4.5,
            reputation_weight=2.5,
            is_local=True,
        )

        ratio = score_local["final_score"] / score_no_local["final_score"]
        assert abs(ratio - 1.5) < 0.001, (
            f"El score local debe ser 1.5x el no-local. Ratio: {ratio:.3f}"
        )

    def test_result_includes_territorial_fields(self):
        """El desglose debe incluir is_local, territorial_bonus, effective_weight."""
        result = self.engine.calculate_final_score(
            n_votes=50,
            raw_average=4.0,
            is_local=True,
        )
        assert "is_local" in result
        assert "territorial_bonus" in result
        assert "effective_weight" in result
        assert result["is_local"] is True
        assert result["territorial_bonus"] == 1.5

    def test_default_is_not_local(self):
        """Por defecto, is_local=False y bonus=1.0."""
        result = self.engine.calculate_final_score(
            n_votes=50,
            raw_average=4.0,
        )
        assert result["is_local"] is False
        assert result["territorial_bonus"] == 1.0


# ═══════════════════════════════════════════
#  TEST 3: GOLD local > GOLD no-local (Test CRÍTICO)
# ═══════════════════════════════════════════

class TestGoldLocalVsGoldNonLocal:
    """
    Test mandatorio: demuestra que un voto local de un
    usuario GOLD tiene más impacto que un voto no-local
    del mismo rango.

    Escenario:
      - Entidad A: 50 votos, promedio 4.2, evaluada por GOLD LOCAL
      - Entidad B: 50 votos, promedio 4.2, evaluada por GOLD NO-LOCAL
      - Resultado: Score A > Score B (la localidad importa)
    """

    def test_gold_local_beats_gold_nonlocal(self):
        """
        Mismo rango GOLD (2.5x), mismos votos, mismo promedio.
        La diferencia la hace el bonus territorial 1.5x.
        """
        engine = BayesianRankingEngine()
        GOLD_WEIGHT = 2.5

        score_local = engine.calculate_final_score(
            n_votes=50,
            raw_average=4.2,
            reputation_weight=GOLD_WEIGHT,
            is_local=True,
        )

        score_nonlocal = engine.calculate_final_score(
            n_votes=50,
            raw_average=4.2,
            reputation_weight=GOLD_WEIGHT,
            is_local=False,
        )

        assert score_local["final_score"] > score_nonlocal["final_score"], (
            f"GOLD local ({score_local['final_score']}) debe superar a "
            f"GOLD no-local ({score_nonlocal['final_score']})"
        )

        # Verificar que la diferencia es exactamente 1.5x
        ratio = score_local["final_score"] / score_nonlocal["final_score"]
        assert abs(ratio - 1.5) < 0.001, (
            f"La diferencia debe ser exactamente 1.5x. Ratio real: {ratio:.4f}"
        )

        # Desglose para trazabilidad (Directives 2026 §11)
        assert score_local["effective_weight"] == GOLD_WEIGHT * 1.5
        assert score_nonlocal["effective_weight"] == GOLD_WEIGHT * 1.0

    def test_apply_territorial_bonus_function(self):
        """Valida la función auxiliar apply_territorial_bonus."""
        assert apply_territorial_bonus(2.5, is_local=True) == 2.5 * 1.5
        assert apply_territorial_bonus(2.5, is_local=False) == 2.5
        assert apply_territorial_bonus(1.0, is_local=True) == 1.5
        assert apply_territorial_bonus(1.0, is_local=False) == 1.0
