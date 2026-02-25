"""
BEACON PROTOCOL — Tests: Mina de Oro + Vote Engine + Bonus Quirúrgico
======================================================================
Valida los 3 pilares:
  1. Cálculo de valor por usuario (BRONZE→DIAMOND × integrity_score)
  2. Voto único (upsert: último voto persiste, shadow mode DNA<70)
  3. Bonus territorial selectivo (solo PERSON + jurisdicción + SILVER+)

"Lo que no se testea, no existe."
"""

import pytest

from app.core.valuation.user_asset_calculator import UserAssetCalculator
from app.services.voting.vote_engine import (
    VoteEngine,
    VotePayload,
    TERRITORIAL_ELIGIBLE_RANKS,
    JURISDICTIONAL_ENTITY_TYPES,
)


# ═══════════════════════════════════════════
#  TEST 1: La Mina de Oro — Cálculo de valor por usuario
# ═══════════════════════════════════════════

class TestUserAssetCalculator:
    """Valida la valoración de usuarios por rango + integridad."""

    def setup_method(self):
        self.calc = UserAssetCalculator()

    def test_bronze_base_values(self):
        """BRONZE con integrity_score=1.0 → $0.50 × 1.2 = $0.60."""
        user = {"rank": "BRONZE", "integrity_score": 1.0}
        value = self.calc.calculate_usd_value(user)
        assert value == 0.60, f"BRONZE base = {value}, esperado $0.60"

    def test_silver_with_rut(self):
        """SILVER con RUT verificado → valor > BRONZE."""
        user = {"rank": "SILVER", "integrity_score": 0.9, "rut_hash": "abc123"}
        value = self.calc.calculate_usd_value(user)
        assert value > 5.0, f"SILVER con RUT = ${value}, debe ser > $5.00"

    def test_gold_complete_profile(self):
        """GOLD con datos completos → mayor valor."""
        user = {
            "rank": "GOLD", "integrity_score": 0.95,
            "commune": "Santiago", "age_range": "30-40",
            "region": "RM", "rut_hash": "xyz789",
        }
        value = self.calc.calculate_usd_value(user)
        assert value > 25.0, f"GOLD completo = ${value}, debe ser > $25.00"

    def test_diamond_max_value(self):
        """DIAMOND con integridad perfecta → valor máximo."""
        user = {
            "rank": "DIAMOND", "integrity_score": 1.0,
            "commune": "Viña del Mar", "age_range": "40-50",
            "region": "Valparaíso", "rut_hash": "hash",
        }
        value = self.calc.calculate_usd_value(user)
        assert value > 100.0, f"DIAMOND max = ${value}, debe ser > $100.00"

    def test_integrity_score_reduces_value(self):
        """Integrity 0.0 → valor mínimo (solo bonos, sin base)."""
        high = self.calc.calculate_usd_value({"rank": "GOLD", "integrity_score": 1.0})
        low = self.calc.calculate_usd_value({"rank": "GOLD", "integrity_score": 0.1})
        assert high > low, "Mayor integridad debe generar mayor valor"

    def test_total_platform_value(self):
        """Cálculo de AUM para múltiples usuarios."""
        users = [
            {"rank": "BRONZE", "integrity_score": 0.5},
            {"rank": "SILVER", "integrity_score": 0.8},
            {"rank": "GOLD", "integrity_score": 0.95},
        ]
        result = self.calc.calculate_total_platform_value(users)
        assert result["total_usd"] > 0
        assert result["user_count"] == 3
        assert "by_tier" in result


# ═══════════════════════════════════════════
#  TEST 2: Vote Engine — Voto único (upsert)
# ═══════════════════════════════════════════

class TestVoteEngineUpsert:
    """Valida que solo el último voto del usuario persiste."""

    def setup_method(self):
        self.engine = VoteEngine()

    def test_first_vote_creates(self):
        """Primer voto → was_updated=False."""
        payload = VotePayload(
            user_id="user-001",
            entity_id="entity-001",
            entity_type="PERSON",
            sliders={"transparencia": 4, "gestion": 3, "coherencia": 5},
            user_rank="GOLD",
        )
        result = self.engine.process_vote(payload)
        assert result.success is True
        assert result.was_updated is False
        assert result.raw_average == 4.0  # (4+3+5)/3

    def test_second_vote_updates(self):
        """Segundo voto del mismo usuario→entidad → was_updated=True."""
        payload_v1 = VotePayload(
            user_id="user-002",
            entity_id="entity-002",
            entity_type="PERSON",
            sliders={"transparencia": 2, "gestion": 2, "coherencia": 2},
            user_rank="SILVER",
        )
        payload_v2 = VotePayload(
            user_id="user-002",
            entity_id="entity-002",
            entity_type="PERSON",
            sliders={"transparencia": 5, "gestion": 5, "coherencia": 5},
            user_rank="SILVER",
        )

        self.engine.process_vote(payload_v1)
        result = self.engine.process_vote(payload_v2)

        assert result.was_updated is True
        assert result.raw_average == 5.0  # Solo el último voto

    def test_only_one_vote_persists(self):
        """Después de 3 votos, solo 1 persiste por usuario→entidad."""
        for i in range(3):
            self.engine.process_vote(VotePayload(
                user_id="user-003",
                entity_id="entity-003",
                entity_type="COMPANY",
                sliders={"calidad": i + 1},
                user_rank="BRONZE",
            ))

        vote = self.engine.get_user_vote("user-003", "entity-003")
        assert vote is not None
        assert vote["sliders"]["calidad"] == 3  # Último valor

    def test_shadow_mode_dna_below_70(self):
        """DNA score < 70 → is_counted=False (Shadow Mode)."""
        payload = VotePayload(
            user_id="bot-001",
            entity_id="entity-001",
            entity_type="PERSON",
            sliders={"transparencia": 5, "gestion": 5, "coherencia": 5},
            user_rank="BRONZE",
            dna_score=40,  # BOT
        )
        result = self.engine.process_vote(payload)

        assert result.success is True  # El "bot" cree que votó exitosamente
        assert result.is_counted is False  # Pero NO se cuenta
        assert result.shadow_reason == "DNA_SCORE_BELOW_THRESHOLD"

    def test_human_vote_is_counted(self):
        """DNA score >= 70 → is_counted=True."""
        payload = VotePayload(
            user_id="human-001",
            entity_id="entity-001",
            entity_type="PERSON",
            sliders={"transparencia": 4},
            dna_score=85,
        )
        result = self.engine.process_vote(payload)
        assert result.is_counted is True


# ═══════════════════════════════════════════
#  TEST 3: Bonus territorial quirúrgico
# ═══════════════════════════════════════════

class TestTerritorialBonusSelectivo:
    """
    Valida que el bonus 1.5x SOLO se aplica cuando:
      1. entity_type == PERSON con jurisdicción
      2. user.rank >= SILVER
      3. user.comuna_id == entity.jurisdiction_id
    """

    def setup_method(self):
        self.engine = VoteEngine()

    def test_gold_local_person_gets_bonus(self):
        """GOLD + PERSON + local → bonus territorial aplicado."""
        payload = VotePayload(
            user_id="gold-local",
            entity_id="alcalde-valpo",
            entity_type="PERSON",
            sliders={"transparencia": 4, "gestion": 4, "coherencia": 4},
            user_rank="GOLD",
            user_comuna_id=101,
            entity_jurisdiction_id=101,
        )
        result = self.engine.process_vote(payload)
        assert result.is_local is True
        assert result.territorial_bonus > 1.0
        assert result.effective_weight == 2.5 * result.territorial_bonus

    def test_gold_nonlocal_person_no_bonus(self):
        """GOLD + PERSON pero otra comuna → sin bonus."""
        payload = VotePayload(
            user_id="gold-nonlocal",
            entity_id="alcalde-stgo",
            entity_type="PERSON",
            sliders={"transparencia": 4, "gestion": 4, "coherencia": 4},
            user_rank="GOLD",
            user_comuna_id=101,
            entity_jurisdiction_id=202,
        )
        result = self.engine.process_vote(payload)
        assert result.is_local is False
        assert result.territorial_bonus == 1.0

    def test_gold_local_more_impact_than_gold_nonlocal(self):
        """TEST CRÍTICO: GOLD local > GOLD no-local (peso 2.5×1.5 > 2.5×1.0)."""
        engine = VoteEngine()

        local_result = engine.process_vote(VotePayload(
            user_id="gold-a",
            entity_id="entity-crit",
            entity_type="PERSON",
            sliders={"transparencia": 4, "gestion": 4, "coherencia": 4},
            user_rank="GOLD",
            user_comuna_id=101,
            entity_jurisdiction_id=101,
        ))

        engine_2 = VoteEngine()
        nonlocal_result = engine_2.process_vote(VotePayload(
            user_id="gold-b",
            entity_id="entity-crit",
            entity_type="PERSON",
            sliders={"transparencia": 4, "gestion": 4, "coherencia": 4},
            user_rank="GOLD",
            user_comuna_id=999,
            entity_jurisdiction_id=101,
        ))

        assert local_result.effective_weight > nonlocal_result.effective_weight, (
            f"GOLD local ({local_result.effective_weight}) debe superar a "
            f"GOLD no-local ({nonlocal_result.effective_weight})"
        )

    def test_bronze_local_no_bonus(self):
        """BRONZE + PERSON + local → SIN bonus (rango insuficiente)."""
        payload = VotePayload(
            user_id="bronze-local",
            entity_id="alcalde-valpo",
            entity_type="PERSON",
            sliders={"transparencia": 4},
            user_rank="BRONZE",
            user_comuna_id=101,
            entity_jurisdiction_id=101,
        )
        result = self.engine.process_vote(payload)
        assert result.is_local is False, (
            "BRONZE no debe recibir bonus territorial (requiere SILVER+)"
        )
        assert result.territorial_bonus == 1.0

    def test_company_local_no_bonus(self):
        """GOLD + COMPANY + local → SIN bonus (no es PERSON)."""
        payload = VotePayload(
            user_id="gold-empresa",
            entity_id="empresa-001",
            entity_type="COMPANY",
            sliders={"calidad": 4},
            user_rank="GOLD",
            user_comuna_id=101,
            entity_jurisdiction_id=101,
        )
        result = self.engine.process_vote(payload)
        assert result.is_local is False, (
            "COMPANY no debe recibir bonus territorial (solo PERSON)"
        )

    def test_person_without_jurisdiction_no_bonus(self):
        """GOLD + PERSON pero sin jurisdicción → SIN bonus."""
        payload = VotePayload(
            user_id="gold-no-juris",
            entity_id="figure-publica",
            entity_type="PERSON",
            sliders={"transparencia": 4},
            user_rank="GOLD",
            user_comuna_id=101,
            entity_jurisdiction_id=None,
        )
        result = self.engine.process_vote(payload)
        assert result.is_local is False
        assert result.territorial_bonus == 1.0
