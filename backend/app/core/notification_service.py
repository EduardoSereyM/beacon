"""
BEACON PROTOCOL — Notification Service (El Heraldo del Búnker)
==============================================================
Notificaciones admin para eventos críticos del sistema.

Sin tabla nueva: usa audit_logs con entity_type='notification' (append-only).

Eventos cubiertos:
  A — NEW_USER_REGISTERED   → nuevo ciudadano registrado
  B — SHADOW_BAN_APPLIED    → shadow ban activado
  C — POLL_CREATED          → nueva encuesta creada

SMTP: si las variables no están configuradas, solo escribe en audit_logs.
"El Heraldo avisa. El Escriba registra. El búnker no olvida."
"""

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict

logger = logging.getLogger("beacon.notifications")

# ── Etiquetas legibles por evento ──────────────────────────────────────────
EVENT_LABELS: Dict[str, str] = {
    "NEW_USER_REGISTERED": "Nuevo usuario registrado",
    "SHADOW_BAN_APPLIED":  "Shadow Ban activado",
    "POLL_CREATED":        "Nueva encuesta creada",
}


# ── SMTP (sync, ejecutado en thread executor) ──────────────────────────────

def _send_smtp_sync(subject: str, body: str) -> bool:
    """
    Envía un email vía SMTP estándar (TLS en puerto 587).
    Llamar solo desde run_in_executor para no bloquear el event loop.

    Returns:
        True si el email fue enviado, False si SMTP no está configurado o falla.
    """
    # Import lazy para evitar ciclos en arranque
    from app.core.config import settings  # noqa: PLC0415

    missing = [
        v for v in (
            settings.ADMIN_EMAIL,
            settings.SMTP_HOST,
            settings.SMTP_USER,
            settings.SMTP_PASSWORD,
        ) if not v
    ]
    if missing:
        logger.debug("SMTP no configurado → solo audit_log (faltan %d vars)", len(missing))
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[BEACON] {subject}"
    msg["From"]    = settings.SMTP_USER
    msg["To"]      = settings.ADMIN_EMAIL
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        # Puerto 465 → SSL desde el inicio (SMTP_SSL)
        # Puerto 587 → STARTTLS (SMTP + starttls)
        if settings.SMTP_PORT == 465:
            import ssl
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=ctx) as smtp:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                smtp.sendmail(settings.SMTP_USER, settings.ADMIN_EMAIL, msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                smtp.sendmail(settings.SMTP_USER, settings.ADMIN_EMAIL, msg.as_string())
        logger.info("📧 Email enviado | subject=%s", subject)
        return True
    except Exception as exc:
        logger.error("❌ SMTP error | subject=%s | %s", subject, exc)
        return False


# ── Función principal (async) ──────────────────────────────────────────────

async def send_admin_notification(
    event_type: str,
    subject: str,
    message: str,
    entity_id: str,
    details: Dict[str, Any],
) -> None:
    """
    Notifica al admin de un evento crítico:
      1. Escribe en audit_logs con entity_type='notification' (inmutable).
      2. Envía email SMTP en thread executor (no bloquea el event loop).

    Args:
        event_type: Clave del evento (NEW_USER_REGISTERED, SHADOW_BAN_APPLIED, POLL_CREATED)
        subject:    Asunto del email
        message:    Texto corto descriptivo
        entity_id:  ID de la entidad afectada (user_id, poll_id, etc.)
        details:    Metadatos adicionales (se almacenan en details JSONB)

    No lanza excepciones: errores se registran en logs del servidor.
    """
    # ─── 1. Audit log inmutable ───────────────────────────────────────────
    from app.core.audit_logger import audit_bus  # noqa: PLC0415

    try:
        await audit_bus.alog_event(
            actor_id="SYSTEM",
            action=event_type,
            entity_type="notification",
            entity_id=entity_id,
            details={
                "subject": subject,
                "message": message,
                "label":   EVENT_LABELS.get(event_type, event_type),
                **details,
            },
        )
    except Exception as exc:
        logger.error("❌ Error escribiendo notificación en audit_logs: %s", exc)

    # ─── 2. Email SMTP (fire-and-forget en executor) ──────────────────────
    body = (
        f"{message}\n\n"
        f"Detalles:\n"
        + "\n".join(f"  {k}: {v}" for k, v in details.items())
        + "\n\n---\nBEACON Protocol — Motor de Integridad\n"
        f"Evento: {event_type} | Entidad: {entity_id}"
    )
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _send_smtp_sync, subject, body)
    except Exception as exc:
        logger.error("❌ Error en executor SMTP: %s", exc)
