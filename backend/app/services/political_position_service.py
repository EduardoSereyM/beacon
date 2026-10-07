"""
BEACON PROTOCOL — Posición política autodeclarada (dato sensible)
==================================================================
Guarda o borra la posición política de un ciudadano.

Reglas:
  - Opcional: nunca es requisito para verificarse ni para votar.
  - Solo con consentimiento expreso (lo exige el schema y un CHECK en la base).
  - El audit_log registra QUE se informó o se borró, jamás el valor.
  - Uso exclusivamente agregado (ver migración 028).
"""

from datetime import datetime, timezone

from app.core.audit_logger import audit_bus
from app.core.database import get_async_supabase_client


async def set_political_position(user_id: str, position: str | None) -> dict:
    """Guarda `position` (con marca de consentimiento) o, si es None, borra dato y consentimiento."""
    supabase = get_async_supabase_client()
    now = datetime.now(timezone.utc).isoformat()
    changes = {
        "political_position": position,
        "political_position_consent_at": now if position is not None else None,
        "updated_at": now,
    }
    await supabase.table("users").update(changes).eq("id", user_id).execute()

    await audit_bus.alog_event(
        actor_id=user_id,
        action="POLITICAL_POSITION_SET" if position is not None else "POLITICAL_POSITION_CLEARED",
        entity_type="USER",
        entity_id=user_id,
        details={},          # sin el valor: es dato sensible
    )
    return {"political_position": position}
