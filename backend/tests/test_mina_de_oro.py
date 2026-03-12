"""
BEACON PROTOCOL — Tests: Mina de Oro + Vote Engine + Bonus Quirúrgico
======================================================================
Valida los 3 pilares:
  1. Cálculo de valor por usuario (BASIC/VERIFIED × integrity_score)
  2. Voto único (upsert: último voto persiste, shadow mode DNA<70)
  3. Bonus territorial selectivo (solo PERSON + jurisdicción + VERIFIED)

"Lo que no se testea, no existe."
"""

from app.core.valuation.user_asset_calculator import UserAssetCalculator
from app.services.voting.vote_engine import (
    VoteEngine,
    VotePayload,
)


# ═══════════════════════════════════════════
#  TEST 1: La Mina de Oro — Cálculo de valor por usuario
# ═══════════════════════════════════════════

class TestUserAssetCalculator:
    """Valida la valoración de usuarios por rango + integridad. Sistema v1: BASIC/VERIFIED."""

    def setup_method(self):
        self.calc = UserAssetCalculator()

    def test_basic_base_values(self):
        """BASIC con integrity_score=1.0 → $0.50 × 1.2 = $0.60."""
        user = {"rank": "BASIC", "integrity_score": 1.0}
        value = self.calc.calculate_usd_value(user)
        assert value == 0.60, f"BASIC base = {value}, esperado $0.60"

    def test_verified_with_rut(self):
        """VERIFIED con RUT verificado → valor > BASIC."""
        user = {"rank": "VERIFIED", "integrity_score": 0.9, "rut_hash": "abc123"}
        value = self.calc.calculate_usd_value(user)
        # VERIFIED $5.00 × (0.9×1.2) + rut(3.0) = $5.40 + $3.0 = $8.40
        assert value > 5.0, f"VERIFIED con RUT = ${value}, debe ser > $5.00"

    def test_verified_complete_profile(self):
        """VERIFIED con datos completos → mayor valor."""
        user = {
            "rank": "VERIFIED", "integrity_score": 0.95,
            "commune": "Santiago", "age_range": "30-40",
            "region": "RM", "rut_hash": "xyz789",
        }
        value = self.calc.calculate_usd_value(user)
        # VERIFIED $5.00 × (0.95×1.2) + data(5.0+1.0) + rut(3.0) = $5.70 + $9.0 = $14.70
        assert value > 12.0, f"VERIFIED completo = ${value}, debe ser > $12.00"

    def test_verified_max_value(self):
        """VERIFIED con integridad perfecta → valor máximo del tier."""
        user = {
            "rank": "VERIFIED", "integrity_score": 1.0,
            "commune": "Viña del Mar", "age_range": "40-50",
            "region": "Valparaíso", "rut_hash": "hash",
        }
        value = self.calc.calculate_usd_value(user)
        # VERIFIED $5.00 × (1.0×1.2) + data(6.0) + rut(3.0) = $6.0 + $9.0 = $15.0
        assert value > 14.0, f"VERIFIED max = ${value}, debe ser > $14.00"

    def test_integrity_score_reduces_value(self):
        """Integrity 0.0 → valor mínimo (solo bonos, sin base)."""
        high = self.calc.calculate_usd_value({"rank": "VERIFIED", "integrity_score": 1.0})
        low = self.calc.calculate_usd_value({"rank": "VERIFIED", "integrity_score": 0.1})
        assert high > low, "Mayor integridad debe generar mayor valor"

    def test_total_platform_value(self):
        """Cálculo de AUM para múltiples usuarios."""
        users = [
            {"rank": "BASIC",    "integrity_score": 0.5},
            {"rank": "VERIFIED", "integrity_score": 0.8},
            {"rank": "VERIFIED", "integrity_score": 0.95},
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
            user_rank="VERIFIED",
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
            user_rank="BASIC",
        )
        payload_v2 = VotePayload(
            user_id="user-002",
            entity_id="entity-002",
            entity_type="PERSON",
            sliders={"transparencia": 5, "gestion": 5, "coherencia": 5},
            user_rank="BASIC",
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
                user_rank="BASIC",
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
            user_rank="BASIC",
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
      2. user.rank == VERIFIED (identidad completa)
      3. user.comuna_id == entity.jurisdiction_id
    """

    def setup_method(self):
        self.engine = VoteEngine()

    def test_verified_local_person_gets_bonus(self):
        """VERIFIED + PERSON + local → bonus territorial aplicado."""
        payload = VotePayload(
            user_id="verified-local",
            entity_id="alcalde-valpo",
            entity_type="PERSON",
            sliders={"transparencia": 4, "gestion": 4, "coherencia": 4},
            user_rank="VERIFIED",
            user_comuna_id=101,
            entity_jurisdiction_id=101,
        )
        result = self.engine.process_vote(payload)
        assert result.is_local is True
        assert result.territorial_bonus > 1.0
        assert result.effective_weight == 1.0 * result.territorial_bonus

    def test_verified_nonlocal_person_no_bonus(self):
        """VERIFIED + PERSON pero otra comuna → sin bonus."""
        payload = VotePayload(
            user_id="verified-nonlocal",
            entity_id="alcalde-stgo",
            entity_type="PERSON",
            sliders={"transparencia": 4, "gestion": 4, "coherencia": 4},
            user_rank="VERIFIED",
            user_comuna_id=101,
            entity_jurisdiction_id=202,
        )
        result = self.engine.process_vote(payload)
        assert result.is_local is False
        assert result.territorial_bonus == 1.0

    def test_verified_local_more_impact_than_verified_nonlocal(self):
        """TEST CRÍTICO: VERIFIED local > VERIFIED no-local (peso 1.0×1.5 > 1.0×1.0)."""
        engine = VoteEngine()

        local_result = engine.process_vote(VotePayload(
            user_id="verified-a",
            entity_id="entity-crit",
            entity_type="PERSON",
            sliders={"transparencia": 4, "gestion": 4, "coherencia": 4},
            user_rank="VERIFIED",
            user_comuna_id=101,
            entity_jurisdiction_id=101,
        ))

        engine_2 = VoteEngine()
        nonlocal_result = engine_2.process_vote(VotePayload(
            user_id="verified-b",
            entity_id="entity-crit",
            entity_type="PERSON",
            sliders={"transparencia": 4, "gestion": 4, "coherencia": 4},
            user_rank="VERIFIED",
            user_comuna_id=999,
            entity_jurisdiction_id=101,
        ))

        assert local_result.effective_weight > nonlocal_result.effective_weight, (
            f"VERIFIED local ({local_result.effective_weight}) debe superar a "
            f"VERIFIED no-local ({nonlocal_result.effective_weight})"
        )

    def test_basic_local_no_bonus(self):
        """BASIC + PERSON + local → SIN bonus (requiere VERIFIED)."""
        payload = VotePayload(
            user_id="basic-local",
            entity_id="alcalde-valpo",
            entity_type="PERSON",
            sliders={"transparencia": 4},
            user_rank="BASIC",
            user_comuna_id=101,
            entity_jurisdiction_id=101,
        )
        result = self.engine.process_vote(payload)
        assert result.is_local is False, (
            "BASIC no debe recibir bonus territorial (requiere VERIFIED)"
        )
        assert result.territorial_bonus == 1.0

    def test_company_local_no_bonus(self):
        """VERIFIED + COMPANY + local → SIN bonus (no es PERSON)."""
        payload = VotePayload(
            user_id="verified-empresa",
            entity_id="empresa-001",
            entity_type="COMPANY",
            sliders={"calidad": 4},
            user_rank="VERIFIED",
            user_comuna_id=101,
            entity_jurisdiction_id=101,
        )
        result = self.engine.process_vote(payload)
        assert result.is_local is False, (
            "COMPANY no debe recibir bonus territorial (solo PERSON)"
        )

    def test_person_without_jurisdiction_no_bonus(self):
        """VERIFIED + PERSON pero sin jurisdicción → SIN bonus."""
        payload = VotePayload(
            user_id="verified-no-juris",
            entity_id="figure-publica",
            entity_type="PERSON",
            sliders={"transparencia": 4},
            user_rank="VERIFIED",
            user_comuna_id=101,
            entity_jurisdiction_id=None,
        )
        result = self.engine.process_vote(payload)
        assert result.is_local is False
        assert result.territorial_bonus == 1.0
