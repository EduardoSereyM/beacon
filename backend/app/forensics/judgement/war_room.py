"""
BEACON PROTOCOL — War Room (La Sala de Juicio)
===============================================
Coordinador forense de patrones de votación y escalado de amenazas.

Analiza lotes de votos en busca de señales de ataque coordinado y
decide si el nivel de seguridad global debe elevarse mediante el
Panic Gate Extreme.

Heurísticas activas (v1 — expandibles vía meta_dna_analyzer):
  H1 — Tasa de DISPLACED voters:   > 50 % de votos con dna_score ≤ 30.
  H2 — Bomba de votos:             > 10 votos / segundo en la ventana.
  H3 — Varianza cero (mecánica):   varianza de scores < 0.1 con ≥ 5 votos.

Interfaz pública:
  analyze_vote_pattern(votes)         → veredicto (sin I/O)
  escalate_to_panic_gate(level, msg)  → eleva nivel de seguridad (async)

Módulo diseñado para importación sin .env, sin Supabase y sin Redis:
  La dependencia con PanicGateExtreme se inyecta o se importa de forma
  lazy (solo al primer uso real de escalate_to_panic_gate).

"La sala de guerra no juzga individuos. Juzga patrones."
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ─── Constantes de veredicto ───────────────────────────────────────────────

VERDICT_CLEAN = "CLEAN"
VERDICT_SUSPICIOUS = "SUSPICIOUS"
VERDICT_COORDINATED_ATTACK = "COORDINATED_ATTACK"

# ─── Umbrales heurísticos ─────────────────────────────────────────────────

DISPLACED_RATE_THRESHOLD = 0.50  # H1: > 50 % displaced → alerta
VOTE_BOMB_RPS_THRESHOLD = 10.0   # H2: > 10 votos/seg → bomba
ZERO_VARIANCE_EPSILON = 0.10     # H3: varianza < 0.10 con ≥ 5 votos → anomalía
MIN_VOTES_FOR_VARIANCE = 5       # mínimo de votos para aplicar H3

# Orden para "solo escalar, nunca bajar"
_LEVEL_ORDER: dict[str, int] = {"GREEN": 0, "YELLOW": 1, "RED": 2}


class WarRoom:
    """
    Sala de Juicio Forense BEACON.

    Analiza patrones de votación sospechosos y coordina el escalado
    al Panic Gate Extreme cuando los umbrales de amenaza se superan.

    Args:
        panic_gate_instance: Instancia de PanicGateExtreme (DI para tests).
            Si es None, se importa el singleton global de forma lazy
            al primer uso de escalate_to_panic_gate().
    """

    def __init__(self, panic_gate_instance: Any = None) -> None:
        # Lazy: la importación real ocurre solo si no se inyecta en tests.
        self._panic_gate = panic_gate_instance

    # ── Interfaz pública ──────────────────────────────────────────────────

    def analyze_vote_pattern(
        self, votes: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """
        Analiza un lote de votos en busca de patrones anómalos.

        Opera sin I/O: pura lógica determinista, apta para tests
        unitarios sin Supabase ni Redis.

        Args:
            votes: Lista de dicts, cada uno con campos opcionales:
                - dna_score       (int, 0–100)   Score del DNA Scanner.
                - score           (float, 1–10)  Calificación emitida.
                - timestamp_epoch (float)         Tiempo Unix del voto.

        Returns:
            {
                "verdict":            CLEAN | SUSPICIOUS | COORDINATED_ATTACK,
                "confidence":         float  (0.0 – 1.0),
                "alerts":             list[str],
                "recommended_action": str,
                "total_votes":        int,
                "displaced_rate":     float,
            }
        """
        if not votes:
            return {
                "verdict": VERDICT_CLEAN,
                "confidence": 1.0,
                "alerts": [],
                "recommended_action": "NONE",
                "total_votes": 0,
                "displaced_rate": 0.0,
            }

        alerts: list[str] = []
        n = len(votes)

        # ── H1: Tasa de DISPLACED voters ──────────────────────────────────
        displaced_count = sum(
            1 for v in votes if v.get("dna_score", 100) <= 30
        )
        displaced_rate = displaced_count / n
        if displaced_rate > DISPLACED_RATE_THRESHOLD:
            alerts.append("HIGH_DISPLACED_VOTER_RATE")
            logger.warning(
                "WarRoom H1: %.1f%% displaced voters en muestra de %d votos.",
                displaced_rate * 100,
                n,
            )

        # ── H2: Velocidad de voto (bomba de votos) ────────────────────────
        timestamps = sorted(
            v["timestamp_epoch"]
            for v in votes
            if "timestamp_epoch" in v
        )
        if len(timestamps) >= 2:
            time_span = timestamps[-1] - timestamps[0]
            if time_span > 0:
                rps = n / time_span
                if rps > VOTE_BOMB_RPS_THRESHOLD:
                    alerts.append("VOTE_BOMB_SPEED")
                    logger.warning(
                        "WarRoom H2: %.1f votos/segundo detectados en %d votos.",
                        rps,
                        n,
                    )

        # ── H3: Varianza cero (coordinación mecánica) ─────────────────────
        if n >= MIN_VOTES_FOR_VARIANCE:
            scores = [float(v.get("score", 5.0)) for v in votes]
            mean = sum(scores) / n
            variance = sum((s - mean) ** 2 for s in scores) / n
            if variance < ZERO_VARIANCE_EPSILON:
                alerts.append("ZERO_VARIANCE_ANOMALY")
                logger.warning(
                    "WarRoom H3: varianza=%.4f < %.2f con %d votos.",
                    variance,
                    ZERO_VARIANCE_EPSILON,
                    n,
                )

        # ── Veredicto final ───────────────────────────────────────────────
        num_alerts = len(alerts)
        if num_alerts >= 2:
            verdict = VERDICT_COORDINATED_ATTACK
            confidence = 0.90
            recommended_action = "ESCALATE_TO_PANIC_GATE"
        elif num_alerts == 1:
            verdict = VERDICT_SUSPICIOUS
            confidence = 0.60
            recommended_action = "MONITOR_AND_SHADOW_BAN"
        else:
            verdict = VERDICT_CLEAN
            confidence = 0.95
            recommended_action = "NONE"

        return {
            "verdict": verdict,
            "confidence": confidence,
            "alerts": alerts,
            "recommended_action": recommended_action,
            "total_votes": n,
            "displaced_rate": round(displaced_rate, 3),
        }

    async def escalate_to_panic_gate(
        self,
        threat_level: str,
        reason: str,
        triggered_by: str = "WAR_ROOM",
    ) -> dict[str, Any]:
        """
        Escala una amenaza al Panic Gate Extreme.

        Solo eleva el nivel de seguridad (GREEN→YELLOW o GREEN/YELLOW→RED).
        Nunca lo reduce: para bajar usa panic_gate.switch_security_level()
        directamente.

        Args:
            threat_level: "YELLOW" o "RED".
            reason:       Justificación textual del escalado.
            triggered_by: ID del actor (default "WAR_ROOM").

        Returns:
            Resultado de PanicGateExtreme.switch_security_level()
            o {"status": "no_change", ...} si ya está en nivel igual o mayor.

        Raises:
            ValueError: Si threat_level no es "YELLOW" ni "RED".
        """
        valid_escalation_levels = {"YELLOW", "RED"}
        if threat_level not in valid_escalation_levels:
            raise ValueError(
                "escalate_to_panic_gate solo acepta 'YELLOW' o 'RED'. "
                f"Recibido: '{threat_level}'. "
                "Para bajar el nivel usa panic_gate.switch_security_level() directamente."
            )

        # Lazy import del singleton global (evita crash al importar sin .env)
        if self._panic_gate is None:
            from app.core.security.panic_gate_extreme import panic_gate  # noqa: PLC0415
            self._panic_gate = panic_gate

        current_level = await self._panic_gate.get_security_level()

        # Solo escalar, nunca bajar
        if _LEVEL_ORDER.get(threat_level, 0) <= _LEVEL_ORDER.get(current_level, 0):
            logger.info(
                "WarRoom: nivel actual %s ya es >= %s. Escalado omitido.",
                current_level,
                threat_level,
            )
            return {
                "status": "no_change",
                "current_level": current_level,
                "requested_level": threat_level,
                "reason": "Already at equal or higher security level",
            }

        logger.warning(
            "WarRoom: escalando %s → %s. Motivo: %s",
            current_level,
            threat_level,
            reason,
        )

        result = await self._panic_gate.switch_security_level(
            new_level=threat_level,
            triggered_by=triggered_by,
            reason=reason,
        )
        return result


# ─── Singleton global de la War Room ─────────────────────────────────────

war_room = WarRoom()
"""
Instancia global de la Sala de Juicio.
Uso:
    from app.forensics.judgement.war_room import war_room
    result = war_room.analyze_vote_pattern(votes)
    await war_room.escalate_to_panic_gate("RED", reason="Ataque coordinado")
"""
