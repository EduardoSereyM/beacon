"""
BEACON PROTOCOL — Audit Logger (El Escriba del Búnker)
=======================================================
Sistema append-only (solo escritura) de auditoría inmutable.
Una vez que un evento entra, nadie (ni siquiera el Overlord)
puede borrarlo sin dejar rastro.

Registra:
  - Registros de ciudadanos
  - Cambios de rango (ascensos y degradaciones)
  - Detección de fraude y brigadas
  - Cambios de nivel de seguridad
  - Acciones administrativas del Overlord
  - Veredictos y Shadow Bans

"Lo que entra al log, nunca sale.
 El Escriba no olvida, no perdona, no edita."
"""

from datetime import datetime
from typing import Dict, Any
import logging

# NOTA: los imports de database se hacen de forma lazy (dentro de los métodos),
# para no disparar config.py → Settings() → lectura del .env al importar el módulo.
# Esto permite tests unitarios sin Supabase ni variables de entorno.

logger = logging.getLogger("beacon.audit")


class AuditLogger:
    """
    Logger de auditoría inmutable (append-only).
    Escribe directamente en la tabla 'audit_logs' de Supabase.
    
    Esta tabla NO tiene operaciones UPDATE ni DELETE.
    Solo INSERT. El rastro de sangre es eterno.
    """

    def __init__(self):
        # Lazy: no conecta a Supabase al importar el módulo.
        # La conexión se abre en el primer log_event, no antes.
        # Esto permite importar audit_bus en tests unitarios sin .env.
        self._client = None

    @property
    def client(self):
        """
        Obtiene el cliente Supabase, inicializándolo solo en el primer uso.
        El import de database (y por ende de config/settings) ocurre aquí,
        no al cargar el módulo.
        """
        if self._client is None:
            from app.core.database import get_supabase_client
            self._client = get_supabase_client()
        return self._client

    def log_event(
        self,
        actor_id: str,
        action: str,
        entity_type: str,
        entity_id: str,
        details: Dict[str, Any],
    ) -> None:
        """
        Registra un evento crítico en la bitácora inmutable.

        Args:
            actor_id: UUID del ciudadano que ejecutó la acción
            action: Tipo de acción (AuditAction enum)
            entity_type: Tipo de entidad afectada (PERSON, COMPANY, etc.)
            entity_id: ID de la entidad afectada
            details: Diccionario con metadatos adicionales (JSONB)

        Ejemplos:
            # Registro de ciudadano
            audit_bus.log_event(
                actor_id=user_id,
                action="USER_REGISTERED",
                entity_type="USER",
                entity_id=user_id,
                details={"rank": "BRONZE", "ip": "190.x.x.x"}
            )

            # Detección de brigada
            audit_bus.log_event(
                actor_id="SYSTEM",
                action="BRIGADE_DETECTED",
                entity_type="EVENT",
                entity_id=event_id,
                details={"ips_involved": 15, "pattern": "COORDINATED"}
            )
        """
        payload = {
            "actor_id": actor_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": details,
            "created_at": datetime.utcnow().isoformat(),
        }

        try:
            self.client.table("audit_logs").insert(payload).execute()
            logger.info(
                f"📜 AUDIT | {action} | actor={actor_id} | "
                f"entity={entity_type}:{entity_id}"
            )
        except Exception as e:
            # El audit NUNCA debe detener el flujo principal
            # Pero registramos el error en los logs del servidor
            logger.error(
                f"❌ AUDIT WRITE FAILED | {action} | {e}",
                exc_info=True,
            )

    async def alog_event(
        self,
        actor_id: str,
        action: str,
        entity_type: str,
        entity_id: str,
        details: Dict[str, Any],
    ) -> None:
        """
        Versión async de log_event para usar dentro de endpoints async.
        Usa el cliente async de Supabase para no bloquear el event loop.
        """
        payload = {
            "actor_id": actor_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": details,
            "created_at": datetime.utcnow().isoformat(),
        }

        try:
            from app.core.database import get_async_supabase_client
            supabase = get_async_supabase_client()
            await supabase.table("audit_logs").insert(payload).execute()
            logger.info(
                f"📜 AUDIT | {action} | actor={actor_id} | "
                f"entity={entity_type}:{entity_id}"
            )
        except Exception as e:
            logger.error(
                f"❌ AUDIT WRITE FAILED | {action} | {e}",
                exc_info=True,
            )

    def log_security_event(
        self,
        action: str,
        details: Dict[str, Any],
    ) -> None:
        """
        Registra eventos de seguridad del sistema
        (no asociados a un usuario específico).
        
        Usado por: panic_gate.py, network_cluster_detector.py
        """
        self.log_event(
            actor_id="SYSTEM",
            action=action,
            entity_type="SECURITY",
            entity_id="GLOBAL",
            details=details,
        )


# ─── Instancia global del Escriba ───
audit_bus = AuditLogger()
