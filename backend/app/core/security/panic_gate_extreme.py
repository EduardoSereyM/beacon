"""
BEACON PROTOCOL — Panic Gate Extreme (El Botón Rojo)
=====================================================
Sistema de estados de emergencia que se propaga en milisegundos
a toda la infraestructura mediante Redis.

Estados de Seguridad:
  🟢 GREEN  → Operación normal. Filtros estándar activos.
  🟡 YELLOW → Alerta moderada. CAPTCHA al 20% de peticiones sospechosas.
                Se activa cuando la tasa de anomalía supera el 5%.
  🔴 RED    → Emergencia total. CAPTCHA obligatorio global.
                Bloqueo de IPs de Data Centers. Rate limiting extremo.
                Se activa ante ataques coordinados o ráfagas masivas.

¿Por qué Redis y no la base de datos?
──────────────────────────────────────
  - PostgreSQL: ~5-20ms de latencia → inaceptable en emergencia
  - Redis: ~0.5ms de latencia → propagación instantánea
  - Todos los workers/pods leen el mismo estado en tiempo real
  - Si Redis cae, el sistema DEFAULTS a YELLOW (fail-safe)

Flujo de activación:
  Anomaly Detector → threshold superado → switch_security_level()
                                              ↓
                                    Redis: SET beacon:security_level "RED"
                                              ↓
                                    Todos los endpoints leen el estado
                                    en el próximo request (~1ms)

"Cuando el búnker se cierra, no se discute. Se obedece."
"""

from datetime import datetime
from typing import Optional, Dict, Any, List

from app.core.audit_logger import audit_bus


# ─── Constantes de Estado ───
SECURITY_GREEN = "GREEN"
SECURITY_YELLOW = "YELLOW"
SECURITY_RED = "RED"

# Clave de Redis para el estado de seguridad global
REDIS_SECURITY_KEY = "beacon:security_level"
REDIS_PANIC_HISTORY = "beacon:panic_history"
REDIS_BLOCKED_IPS = "beacon:blocked_ips"

# Umbrales de anomalía para transición automática
YELLOW_ANOMALY_THRESHOLD = 0.05   # 5% de requests sospechosos → YELLOW
RED_ANOMALY_THRESHOLD = 0.15      # 15% de requests sospechosos → RED

# User-agent patterns de Data Centers (bloqueo en RED)
DATACENTER_UA_PATTERNS = [
    "python-requests",
    "python-urllib",
    "go-http-client",
    "java/",
    "curl/",
    "wget/",
    "httpie/",
    "postman",
    "insomnia",
]

# ISP/ASN conocidos de Data Centers (bloqueo en RED)
DATACENTER_ISP_KEYWORDS = [
    "amazon",
    "aws",
    "google cloud",
    "digitalocean",
    "linode",
    "vultr",
    "hetzner",
    "ovh",
    "azure",
    "cloudflare workers",
]


class PanicGateExtreme:
    """
    Controlador de estados de emergencia con propagación vía Redis.

    ¿Por qué "Extreme"?
    Porque en modo RED, el sistema toma medidas drásticas sin
    consultar: CAPTCHA global, bloqueo de IPs, rate limiting
    extremo. La integridad del ranking es más importante que
    la comodidad de un usuario potencialmente falso.
    """

    def __init__(self, redis_client=None):
        """
        Args:
            redis_client: Instancia del RedisWrapper async.
                Si es None, el sistema opera en modo degradado
                (siempre YELLOW como fail-safe).
        """
        self._redis = redis_client
        self._fallback_level = SECURITY_YELLOW  # Fail-safe si Redis cae

    def set_redis_client(self, redis_client) -> None:
        """Inyecta el cliente Redis (para inicialización lazy)."""
        self._redis = redis_client

    async def get_security_level(self) -> str:
        """
        Lee el estado de seguridad actual desde Redis.

        Returns:
            "GREEN", "YELLOW", o "RED"

        Si Redis no está disponible → retorna YELLOW (fail-safe).
        Esto es intencional: ante la duda, CAPTCHA moderado > sin protección.
        """
        if not self._redis:
            return self._fallback_level

        try:
            level = await self._redis.get(REDIS_SECURITY_KEY)
            if level and level in (SECURITY_GREEN, SECURITY_YELLOW, SECURITY_RED):
                return level
            # Si no hay valor → inicializar en GREEN
            await self._redis.set(REDIS_SECURITY_KEY, SECURITY_GREEN)
            return SECURITY_GREEN
        except Exception:
            # Redis caído → fail-safe
            return self._fallback_level

    async def switch_security_level(
        self,
        new_level: str,
        triggered_by: str = "SYSTEM",
        reason: str = "",
    ) -> Dict[str, Any]:
        """
        Cambia el estado de seguridad global.

        Esta acción se propaga a TODA la infraestructura en ~1ms
        porque todos los endpoints leen de Redis.

        Args:
            new_level: "GREEN", "YELLOW", o "RED"
            triggered_by: ID del actor (admin o "SYSTEM")
            reason: Justificación del cambio

        Returns:
            Diccionario con el cambio realizado
        """
        if new_level not in (SECURITY_GREEN, SECURITY_YELLOW, SECURITY_RED):
            raise ValueError(f"Nivel inválido: {new_level}. Usa GREEN, YELLOW o RED.")

        previous_level = await self.get_security_level()

        if not self._redis:
            return {
                "status": "degraded",
                "message": "Redis no disponible. Operando en modo fail-safe (YELLOW).",
            }

        # ─── Actualizar en Redis (propagación instantánea) ───
        await self._redis.set(REDIS_SECURITY_KEY, new_level)

        # Registrar en historial de Redis
        timestamp = datetime.utcnow().isoformat()
        history_entry = f"{timestamp}|{previous_level}→{new_level}|{triggered_by}|{reason}"
        await self._redis.sadd(REDIS_PANIC_HISTORY, history_entry)

        # ─── Registrar en Audit Log inmutable ───
        severity = "LOW" if new_level == SECURITY_GREEN else (
            "MEDIUM" if new_level == SECURITY_YELLOW else "CRITICAL"
        )

        audit_bus.log_security_event(
            actor_id=triggered_by,
            action="SECURITY_LEVEL_CHANGED",
            entity_type="SYSTEM",
            entity_id="GLOBAL",
            severity=severity,
            details={
                "previous_level": previous_level,
                "new_level": new_level,
                "reason": reason,
                "timestamp": timestamp,
            },
        )

        return {
            "status": "success",
            "previous_level": previous_level,
            "new_level": new_level,
            "triggered_by": triggered_by,
            "reason": reason,
            "propagation": "instant (Redis)",
        }

    async def evaluate_threat_level(
        self,
        total_requests: int,
        suspicious_requests: int,
    ) -> Dict[str, Any]:
        """
        Evalúa automáticamente si debe cambiar el nivel de seguridad
        basándose en la tasa de anomalía del último minuto.

        Flujo:
          1. Calcula tasa de anomalía = suspicious / total
          2. Si > 15% → RED
          3. Si > 5% → YELLOW
          4. Si < 5% → GREEN

        Args:
            total_requests: Total de requests en el último minuto
            suspicious_requests: Requests marcados como sospechosos

        Returns:
            Resultado de la evaluación con acción tomada (si aplica)
        """
        if total_requests <= 0:
            return {"action": "NONE", "anomaly_rate": 0.0, "level": "GREEN"}

        anomaly_rate = suspicious_requests / total_requests
        current_level = await self.get_security_level()
        recommended_level = current_level

        if anomaly_rate >= RED_ANOMALY_THRESHOLD:
            recommended_level = SECURITY_RED
        elif anomaly_rate >= YELLOW_ANOMALY_THRESHOLD:
            recommended_level = SECURITY_YELLOW
        else:
            recommended_level = SECURITY_GREEN

        action = "NONE"
        if recommended_level != current_level:
            result = await self.switch_security_level(
                new_level=recommended_level,
                triggered_by="THREAT_EVALUATOR",
                reason=f"Anomaly rate: {anomaly_rate:.2%} ({suspicious_requests}/{total_requests})",
            )
            action = f"SWITCHED_TO_{recommended_level}"

        return {
            "action": action,
            "anomaly_rate": round(anomaly_rate, 4),
            "previous_level": current_level,
            "current_level": recommended_level,
            "total_requests": total_requests,
            "suspicious_requests": suspicious_requests,
        }

    def get_captcha_policy(self, security_level: str, dna_score: int = 100) -> Dict[str, Any]:
        """
        Determina si un request específico debe mostrar CAPTCHA.

        Args:
            security_level: Estado actual (GREEN, YELLOW, RED)
            dna_score: Score del DNA Scanner (0-100)

        Returns:
            {
                "require_captcha": bool,
                "captcha_type": str|None,  # "simple" o "advanced"
                "reason": str,
            }
        """
        if security_level == SECURITY_GREEN:
            # GREEN: CAPTCHA solo para DISPLACED confirmados
            if dna_score <= 30:
                return {
                    "require_captcha": True,
                    "captcha_type": "simple",
                    "reason": "DNA_SCORE_LOW_IN_GREEN",
                }
            return {"require_captcha": False, "captcha_type": None, "reason": "GREEN_MODE"}

        elif security_level == SECURITY_YELLOW:
            # YELLOW: CAPTCHA al 20% de sospechosos (DNA < 70)
            if dna_score < 70:
                return {
                    "require_captcha": True,
                    "captcha_type": "simple",
                    "reason": "YELLOW_SUSPICIOUS_DNA",
                }
            return {"require_captcha": False, "captcha_type": None, "reason": "YELLOW_CLEAN"}

        else:  # RED
            # RED: CAPTCHA obligatorio para TODOS
            captcha_type = "advanced" if dna_score < 50 else "simple"
            return {
                "require_captcha": True,
                "captcha_type": captcha_type,
                "reason": "RED_GLOBAL_ENFORCEMENT",
            }

    def is_datacenter_request(self, user_agent: str, isp_name: str = "") -> bool:
        """
        Detecta si un request proviene de un Data Center.
        En modo RED, estos requests son bloqueados.

        Args:
            user_agent: User-Agent del request
            isp_name: Nombre del ISP (si está disponible)

        Returns:
            True si el request proviene de un Data Center
        """
        ua_lower = user_agent.lower()
        isp_lower = isp_name.lower()

        # Verificar User-Agent
        for pattern in DATACENTER_UA_PATTERNS:
            if pattern in ua_lower:
                return True

        # Verificar ISP
        for keyword in DATACENTER_ISP_KEYWORDS:
            if keyword in isp_lower:
                return True

        return False

    async def block_ip(self, ip: str, reason: str) -> None:
        """
        Bloquea una IP en Redis (propagación instantánea).
        Solo se usa en modo RED.
        """
        if self._redis:
            await self._redis.sadd(REDIS_BLOCKED_IPS, ip)
            audit_bus.log_security_event(
                actor_id="PANIC_GATE",
                action="IP_BLOCKED",
                entity_type="NETWORK",
                entity_id=ip,
                severity="HIGH",
                details={"reason": reason, "ip": ip},
            )

    async def is_ip_blocked(self, ip: str) -> bool:
        """Verifica si una IP está bloqueada."""
        if not self._redis:
            return False
        return await self._redis.sismember(REDIS_BLOCKED_IPS, ip)


# ─── Instancia global del Botón Rojo ───
panic_gate = PanicGateExtreme()
"""
Singleton del sistema de emergencia.
Uso: from app.core.security.panic_gate_extreme import panic_gate

IMPORTANTE: Llamar panic_gate.set_redis_client(redis) durante
el startup de la aplicación (en main.py).
"""
