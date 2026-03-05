"""
BEACON PROTOCOL — Tests unitarios: War Room
============================================
Valida el coordinador forense sin Supabase, sin Redis, sin .env.

Cobertura:
  T1 — Importación y creación no crashean sin dependencias externas.
  T2 — Votos orgánicos y diversos → veredicto CLEAN.
  T3 — Alta tasa de DISPLACED voters → alerta HIGH_DISPLACED_VOTER_RATE.
  T4 — Votos a >10/segundo → alerta VOTE_BOMB_SPEED.
  T5 — escalate_to_panic_gate llama a PanicGate con parámetros correctos.

Tests adicionales de robustez:
  T6 — Lista vacía de votos → CLEAN con totales en cero.
  T7 — El escalado NO baja el nivel si ya está en RED.
  T8 — Nivel inválido en escalate lanza ValueError.

"Lo que no se testea, no existe."
"""

import pytest

from app.forensics.judgement.war_room import (
    WarRoom,
    VERDICT_CLEAN,
    VERDICT_SUSPICIOUS,
    VERDICT_COORDINATED_ATTACK,
)


# ─── Helpers ──────────────────────────────────────────────────────────────

class MockPanicGate:
    """Doble de prueba para PanicGateExtreme (sin Redis)."""

    def __init__(self, initial_level: str = "GREEN") -> None:
        self._level = initial_level
        self.switch_calls: list[dict] = []

    async def get_security_level(self) -> str:
        return self._level

    async def switch_security_level(
        self,
        new_level: str,
        triggered_by: str = "SYSTEM",
        reason: str = "",
    ) -> dict:
        self.switch_calls.append(
            {"new_level": new_level, "triggered_by": triggered_by, "reason": reason}
        )
        self._level = new_level
        return {
            "status": "success",
            "previous_level": "GREEN",
            "new_level": new_level,
            "triggered_by": triggered_by,
            "reason": reason,
        }


def make_vote(
    dna_score: int = 80,
    score: float = 7.0,
    timestamp_epoch: float = 1000.0,
) -> dict:
    """Factoría de votos sintéticos para tests."""
    return {
        "dna_score": dna_score,
        "score": score,
        "timestamp_epoch": timestamp_epoch,
    }


# ═══════════════════════════════════════════
#  T1: Importación y creación sin dependencias externas
# ═══════════════════════════════════════════

class TestWarRoomImport:
    """T1 — La importación y creación no explotan sin Supabase ni Redis."""

    def test_import_and_instantiate_no_dependencies(self):
        """
        WarRoom() se puede importar e instanciar sin .env, sin Supabase,
        sin Redis. El _panic_gate permanece None hasta el primer escalado.
        """
        room = WarRoom()
        assert room is not None
        assert room._panic_gate is None, "Sin inyección, _panic_gate debe ser None (lazy)"


# ═══════════════════════════════════════════
#  T2 – T4: Lógica de análisis de patrones (sin I/O)
# ═══════════════════════════════════════════

class TestAnalyzeVotePattern:
    """Tests 2, 3 y 4: heurísticas de detección de patrones anómalos."""

    def test_clean_diverse_votes_return_clean_verdict(self):
        """
        T2 — Votos con dna_score alto, scores variados y tiempos espaciados
        → veredicto CLEAN, sin alertas.
        """
        room = WarRoom()
        votes = [
            make_vote(dna_score=90, score=8.0, timestamp_epoch=1000.0),
            make_vote(dna_score=85, score=5.5, timestamp_epoch=1010.0),
            make_vote(dna_score=92, score=7.0, timestamp_epoch=1020.0),
            make_vote(dna_score=78, score=4.0, timestamp_epoch=1030.0),
            make_vote(dna_score=88, score=9.0, timestamp_epoch=1040.0),
        ]
        result = room.analyze_vote_pattern(votes)

        assert result["verdict"] == VERDICT_CLEAN, (
            f"código: WAR_T2_001 — Votos orgánicos deben dar CLEAN, recibido {result['verdict']}"
        )
        assert result["alerts"] == [], (
            f"código: WAR_T2_002 — No debe haber alertas, recibidas: {result['alerts']}"
        )
        assert result["confidence"] >= 0.9, (
            "código: WAR_T2_003 — Confianza de CLEAN debe ser ≥ 0.9"
        )
        assert result["total_votes"] == 5
        assert result["displaced_rate"] == 0.0

    def test_high_displaced_rate_triggers_alert(self):
        """
        T3 — 4 de 5 votos con dna_score ≤ 30 (DISPLACED).
        → alerta HIGH_DISPLACED_VOTER_RATE y veredicto SUSPICIOUS o COORDINATED_ATTACK.
        """
        room = WarRoom()
        votes = [
            make_vote(dna_score=10, score=10.0, timestamp_epoch=1000.0),
            make_vote(dna_score=20, score=10.0, timestamp_epoch=1060.0),
            make_vote(dna_score=15, score=10.0, timestamp_epoch=1120.0),
            make_vote(dna_score=25, score=10.0, timestamp_epoch=1180.0),
            make_vote(dna_score=80, score=6.0,  timestamp_epoch=1240.0),  # único humano
        ]
        result = room.analyze_vote_pattern(votes)

        assert "HIGH_DISPLACED_VOTER_RATE" in result["alerts"], (
            "código: WAR_T3_001 — Debe detectar alta tasa de DISPLACED"
        )
        assert result["verdict"] in (VERDICT_SUSPICIOUS, VERDICT_COORDINATED_ATTACK), (
            f"código: WAR_T3_002 — Veredicto inesperado: {result['verdict']}"
        )
        assert result["displaced_rate"] > 0.5, (
            "código: WAR_T3_003 — displaced_rate debe reflejar la proporción real"
        )

    def test_vote_bomb_speed_detected(self):
        """
        T4 — 20 votos en 1 segundo (20 votos/seg > umbral de 10/seg).
        → alerta VOTE_BOMB_SPEED.
        """
        room = WarRoom()
        # 20 votos entre t=1000.0 y t=1000.95 → ~21 votos/seg
        votes = [
            make_vote(dna_score=80, score=9.0, timestamp_epoch=1000.0 + i * 0.05)
            for i in range(20)
        ]
        result = room.analyze_vote_pattern(votes)

        assert "VOTE_BOMB_SPEED" in result["alerts"], (
            "código: WAR_T4_001 — Debe detectar bomba de votos"
        )
        assert result["verdict"] in (VERDICT_SUSPICIOUS, VERDICT_COORDINATED_ATTACK), (
            f"código: WAR_T4_002 — Veredicto inesperado: {result['verdict']}"
        )

    def test_empty_votes_returns_clean(self):
        """
        T6 — Lista vacía → CLEAN con total_votes=0 y displaced_rate=0.0.
        """
        room = WarRoom()
        result = room.analyze_vote_pattern([])

        assert result["verdict"] == VERDICT_CLEAN
        assert result["total_votes"] == 0
        assert result["displaced_rate"] == 0.0
        assert result["alerts"] == []


# ═══════════════════════════════════════════
#  T5: Escalado al Panic Gate con mock
# ═══════════════════════════════════════════

class TestEscalateToPanicGate:
    """T5 – T8: comportamiento de escalado con PanicGate inyectado (sin Redis)."""

    @pytest.mark.asyncio
    async def test_escalate_calls_panic_gate_with_correct_params(self):
        """
        T5 — escalate_to_panic_gate("RED", ...) llama a
        switch_security_level con new_level="RED" y triggered_by correcto.
        """
        mock_gate = MockPanicGate(initial_level="GREEN")
        room = WarRoom(panic_gate_instance=mock_gate)

        result = await room.escalate_to_panic_gate(
            threat_level="RED",
            reason="Bomba de votos coordinada detectada",
            triggered_by="WAR_ROOM_TEST",
        )

        assert result["status"] == "success", (
            f"código: WAR_T5_001 — Status inesperado: {result['status']}"
        )
        assert result["new_level"] == "RED", (
            "código: WAR_T5_002 — El nivel debe haberse elevado a RED"
        )
        assert len(mock_gate.switch_calls) == 1, (
            "código: WAR_T5_003 — switch_security_level debe llamarse exactamente 1 vez"
        )
        call = mock_gate.switch_calls[0]
        assert call["new_level"] == "RED"
        assert call["triggered_by"] == "WAR_ROOM_TEST"
        assert "Bomba" in call["reason"]

    @pytest.mark.asyncio
    async def test_escalate_does_not_downgrade_from_red(self):
        """
        T7 — Si el nivel ya es RED, intentar escalar a YELLOW
        devuelve no_change sin llamar a switch_security_level.
        """
        mock_gate = MockPanicGate(initial_level="RED")
        room = WarRoom(panic_gate_instance=mock_gate)

        result = await room.escalate_to_panic_gate(
            threat_level="YELLOW",
            reason="Intento de bajar nivel vía escalate",
        )

        assert result["status"] == "no_change", (
            "código: WAR_T7_001 — No debe bajar el nivel de seguridad"
        )
        assert len(mock_gate.switch_calls) == 0, (
            "código: WAR_T7_002 — switch_security_level NO debe llamarse"
        )

    @pytest.mark.asyncio
    async def test_escalate_invalid_level_raises_value_error(self):
        """
        T8 — Nivel inválido (ej. "GREEN") → ValueError explicativa.
        escalate solo acepta "YELLOW" o "RED".
        """
        mock_gate = MockPanicGate()
        room = WarRoom(panic_gate_instance=mock_gate)

        with pytest.raises(ValueError, match="'YELLOW' o 'RED'"):
            await room.escalate_to_panic_gate(
                threat_level="GREEN",
                reason="Intentando bajar a GREEN vía escalate",
            )
