"""
BEACON PROTOCOL — Stealth Ban (Silencio Estratégico)
=====================================================
El Shadow Mode es el arma invisible del sistema:
el usuario sospechoso cree que sus votos cuentan,
pero jamás afectan el ranking público.

¿Por qué Shadow Ban y no un ban directo?
─────────────────────────────────────────
Si le decimos al bot que fue detectado:
  1. Cambia de estrategia inmediatamente
  2. Crea nuevas cuentas con fingerprints distintos
  3. Perdemos la oportunidad de estudiar su comportamiento

Con Shadow Mode:
  1. El bot sigue votando → nosotros seguimos recolectando data
  2. El ranking público permanece PURO
  3. Tenemos un laboratorio forense de comportamiento anómalo

Flujo:
  Voto llega → DNA Scanner → is_shadow_banned? → Guardar con is_counted=False
                                                   ↓
                              El usuario VE su voto en su perfil ✓
                              El ranking público NO lo incluye ✗

"No le digas al enemigo que lo ves. Déjalo actuar.
 Cada movimiento suyo es evidencia para nosotros."
"""

from datetime import datetime
from typing import Optional, Dict, Any, List

from app.core.audit_logger import audit_bus


class StealthBanEngine:
    """
    Motor de Shadow Ban que filtra votos sospechosos
    sin que el usuario lo sepa.

    Reglas de activación:
      1. El DNAScanner clasificó al usuario como DISPLACED
      2. El anomaly_detector detectó comportamiento anómalo
      3. El Overlord activó el shadow ban manualmente
      4. El integrity_score cayó por debajo del umbral (0.2)
    """

    def __init__(self, shadow_ban_threshold: float = 0.2):
        """
        Args:
            shadow_ban_threshold: Si el integrity_score del usuario
                cae por debajo de este valor, se activa el shadow ban.
                Default: 0.2 (coincide con config_params.SHADOW_BAN_THRESHOLD)

                ¿Por qué 0.2?
                Un usuario con integrity_score < 0.2 ha acumulado
                suficientes señales negativas para ser considerado
                una amenaza para la integridad del ranking.
        """
        self.threshold = shadow_ban_threshold

    def should_count_vote(self, user: dict, dna_result: dict = None) -> Dict[str, Any]:
        """
        Decide si un voto debe contarse en el ranking público.

        El voto SIEMPRE se guarda en la base de datos (para que el
        usuario lo vea en su perfil), pero el campo is_counted
        determina si afecta al ranking.

        Args:
            user: Diccionario con datos del usuario votante
            dna_result: Resultado del DNA Scanner (opcional)

        Returns:
            {
                "is_counted": bool,     # ¿Afecta al ranking?
                "reason": str|None,     # Razón del shadow ban
                "alerts": list,         # Alertas forenses
                "user_sees": str,       # Mensaje que ve el usuario
            }
        """
        alerts = []
        reason = None

        # ─── Verificación 1: Shadow Ban explícito ───
        if user.get("is_shadow_banned", False):
            reason = "EXPLICIT_SHADOW_BAN"
            alerts.append("USER_IS_SHADOW_BANNED")

        # ─── Verificación 2: Integrity Score bajo el umbral ───
        integrity = user.get("integrity_score", 0.5)
        if integrity < self.threshold:
            reason = reason or "LOW_INTEGRITY_SCORE"
            alerts.append(f"INTEGRITY_BELOW_THRESHOLD_{self.threshold}")

        # ─── Verificación 3: Cuenta no verificada (solo email) ───
        verification = user.get("verification_level", 1)
        if verification < 2:
            # Los BRONZE no están baneados, pero sus votos
            # pesan menos (esto se maneja en bayesian_ranking)
            pass

        # ─── Verificación 4: DNA Scanner detectó anomalía ───
        if dna_result:
            classification = dna_result.get("classification", "HUMAN")
            if classification == "DISPLACED":
                reason = reason or "DNA_DISPLACED"
                alerts.append("DNA_SCANNER_DISPLACED")
            elif classification == "SUSPICIOUS":
                dna_score = dna_result.get("score", 100)
                if dna_score < 40:
                    reason = reason or "DNA_HIGHLY_SUSPICIOUS"
                    alerts.append(f"DNA_SCORE_CRITICAL_{dna_score}")

        # ─── Verificación 5: Cuenta desactivada (soft delete) ───
        if not user.get("is_active", True):
            reason = reason or "ACCOUNT_DEACTIVATED"
            alerts.append("ACCOUNT_INACTIVE")

        # ─── Decisión Final ───
        is_counted = reason is None

        if not is_counted:
            # Registrar en audit log para análisis forense
            audit_bus.log_event(
                actor_id=user.get("id", "unknown"),
                action="VOTE_SHADOW_FILTERED",
                entity_type="VOTE",
                entity_id=user.get("id", "unknown"),
                details={
                    "reason": reason,
                    "alerts": alerts,
                    "integrity_score": integrity,
                    "is_shadow_banned": user.get("is_shadow_banned", False),
                },
            )

        return {
            "is_counted": is_counted,
            "reason": reason,
            "alerts": alerts,
            # El usuario SIEMPRE ve éxito (Shadow Mode)
            "user_sees": "Tu voto ha sido registrado exitosamente.",
        }

    def apply_shadow_ban(self, user_id: str, reason: str) -> Dict[str, Any]:
        """
        Activa el shadow ban para un usuario.
        El usuario NO recibe ninguna notificación.

        Casos de uso:
          - El anomaly_detector encontró patrones de brigada
          - El Overlord lo activó manualmente
          - El sistema detectó multicuenta

        Args:
            user_id: UUID del ciudadano a silenciar
            reason: Razón del shadow ban (para el audit log)

        Returns:
            Datos para actualizar en Supabase
        """
        # Registrar en audit (inmutable, forense)
        audit_bus.log_security_event(
            actor_id="SYSTEM",
            action="SHADOW_BAN_APPLIED",
            entity_type="USER",
            entity_id=user_id,
            severity="HIGH",
            details={
                "reason": reason,
                "applied_at": datetime.utcnow().isoformat(),
                "note": "El usuario NO fue notificado (Shadow Mode activo)",
            },
        )

        return {
            "user_id": user_id,
            "update_data": {
                "is_shadow_banned": True,
                "updated_at": datetime.utcnow().isoformat(),
            },
        }

    def lift_shadow_ban(self, user_id: str, lifted_by: str) -> Dict[str, Any]:
        """
        Levanta el shadow ban de un usuario.
        Solo el Overlord o un proceso automático de rehabilitación
        puede ejecutar esta acción.

        Args:
            user_id: UUID del ciudadano a rehabilitar
            lifted_by: ID del admin o "SYSTEM" si es automático
        """
        audit_bus.log_security_event(
            actor_id=lifted_by,
            action="SHADOW_BAN_LIFTED",
            entity_type="USER",
            entity_id=user_id,
            severity="MEDIUM",
            details={
                "lifted_at": datetime.utcnow().isoformat(),
                "lifted_by": lifted_by,
            },
        )

        return {
            "user_id": user_id,
            "update_data": {
                "is_shadow_banned": False,
                "updated_at": datetime.utcnow().isoformat(),
            },
        }

    def filter_counted_votes(self, votes: List[dict]) -> List[dict]:
        """
        Filtra una lista de votos para el cálculo de ranking.
        Solo retorna votos con is_counted=True.

        Uso: El bayesian_ranking.py solo debe recibir
        votos filtrados por este método.
        """
        return [v for v in votes if v.get("is_counted", True)]


# ─── Instancia global del Motor de Silencio ───
shadow_engine = StealthBanEngine()
"""
Singleton del motor de shadow ban.
Uso: from app.core.security.stealth_ban import shadow_engine
"""
