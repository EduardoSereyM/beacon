"""
BEACON PROTOCOL — Identity Service (El Gestor de Ascensión)
=============================================================
Aquí ocurre la magia de la meritocracia:
el usuario entrega datos y Beacon le entrega Poder.

Funciones:
  - verify_rut(): El rito de paso de BRONZE → SILVER
  - update_demographic_profile(): La "Mina de Oro" de segmentación

Trazabilidad: Cada ascensión y actualización se registra
en el AuditLogger inmutable. El Escriba no olvida.

"Entregar tu RUT es apostar por la verdad.
 A cambio, Beacon te da un asiento en la Mesa de la Integridad."
"""

from datetime import datetime
from typing import Optional

from app.core.database import get_supabase_client
from app.core.audit_logger import audit_bus
from app.core.security.rut_validator import validate_rut, hash_rut
from app.domain.enums import UserRank, VerificationLevel


async def verify_rut(user_id: str, rut: str) -> dict:
    """
    El Rito de Paso: valida el RUT y promueve al ciudadano.

    Flujo:
      1. Valida el dígito verificador (Módulo 11)
      2. Genera el rut_hash (SHA-256)
      3. Verifica que el RUT no esté duplicado (unicidad)
      4. Actualiza el rango a SILVER con integrity_score = 0.75
      5. Descarta el RUT en texto plano inmediatamente
      6. Notifica al AuditLogger que un ciudadano fue verificado

    Args:
        user_id: UUID del ciudadano en Supabase
        rut: RUT chileno en cualquier formato (ej: "12.345.678-9")

    Returns:
        Diccionario con el nuevo estatus del ciudadano

    Raises:
        ValueError: Si el RUT es inválido o ya está registrado
    """
    supabase = get_supabase_client()

    # ─── Paso 1: Validación del Dígito Verificador ───
    if not validate_rut(rut):
        # Registrar intento fallido en audit
        audit_bus.log_event(
            actor_id=user_id,
            action="RUT_VALIDATION_FAILED",
            entity_type="USER",
            entity_id=user_id,
            details={"reason": "INVALID_CHECK_DIGIT"},
        )
        raise ValueError(
            "RUT inválido. El dígito verificador no coincide. "
            "Asegúrate de ingresar un RUT chileno válido."
        )

    # ─── Paso 2: Generar Hash (el RUT plano muere aquí) ───
    rut_hashed = hash_rut(rut)

    # ─── Paso 3: Verificar Unicidad ───
    existing = (
        supabase.table("users")
        .select("id")
        .eq("rut_hash", rut_hashed)
        .execute()
    )

    if existing.data:
        # Posible intento de multicuenta
        audit_bus.log_event(
            actor_id=user_id,
            action="RUT_DUPLICATE_ATTEMPT",
            entity_type="USER",
            entity_id=user_id,
            details={
                "existing_user_id": existing.data[0]["id"],
                "alert": "POSSIBLE_MULTI_ACCOUNT",
            },
        )
        raise ValueError(
            "Este RUT ya está asociado a otra cuenta. "
            "Si crees que es un error, contacta al Overlord."
        )

    # ─── Paso 4: Ascensión a SILVER ───
    update_data = {
        "rut_hash": rut_hashed,
        "is_verified": True,
        "verification_level": VerificationLevel.RUT,
        "rank": UserRank.SILVER,
        "integrity_score": 0.75,
        "updated_at": datetime.utcnow().isoformat(),
    }

    result = (
        supabase.table("users")
        .update(update_data)
        .eq("id", user_id)
        .execute()
    )

    if result.data:
        # ─── Paso 5: Registrar Ascensión en Audit Log ───
        audit_bus.log_event(
            actor_id=user_id,
            action="USER_VERIFIED_RUT",
            entity_type="USER",
            entity_id=user_id,
            details={
                "previous_rank": "BRONZE",
                "new_rank": UserRank.SILVER,
                "new_integrity_score": 0.75,
                "verification_level": VerificationLevel.RUT,
            },
        )

        audit_bus.log_event(
            actor_id=user_id,
            action="USER_RANK_CHANGED",
            entity_type="USER",
            entity_id=user_id,
            details={
                "from": "BRONZE",
                "to": UserRank.SILVER,
                "reason": "RUT_VERIFICATION",
            },
        )

        return {
            "status": "success",
            "new_rank": UserRank.SILVER,
            "integrity_score": 0.75,
            "message": (
                "¡Bienvenido, Ciudadano de Plata! "
                "Tu voto ahora pesa 1.5x. "
                "Completa tu perfil demográfico para seguir subiendo."
            ),
        }

    raise Exception("Error al actualizar el ciudadano en Supabase")


async def update_demographic_profile(
    user_id: str,
    commune: Optional[str] = None,
    region: Optional[str] = None,
    age_range: Optional[str] = None,
) -> dict:
    """
    Actualiza el perfil demográfico del ciudadano.
    Cada dato entregado alimenta la "Mina de Oro"
    y acerca al usuario al rango GOLD.

    La segmentación (commune, region, age_range) permite:
      - Vender data de alta fidelidad a conglomerados (sin PII)
      - Calcular coherencia territorial para detectar brigadas
      - Aumentar el poder de voto del ciudadano comprometido

    Args:
        user_id: UUID del ciudadano
        commune: Comuna (ej: "Providencia")
        region: Región (ej: "Metropolitana")
        age_range: Rango etario (ej: "25-34")

    Returns:
        Diccionario con el resultado de la actualización
    """
    supabase = get_supabase_client()

    # Construir solo los campos que se van a actualizar
    update_data = {"updated_at": datetime.utcnow().isoformat()}
    fields_updated = []

    if commune is not None:
        update_data["commune"] = commune
        fields_updated.append("commune")
    if region is not None:
        update_data["region"] = region
        fields_updated.append("region")
    if age_range is not None:
        update_data["age_range"] = age_range
        fields_updated.append("age_range")

    fields_provided = len(fields_updated)

    # Boost de integrity_score por completar perfil
    if fields_provided > 0:
        user = (
            supabase.table("users")
            .select("integrity_score")
            .eq("id", user_id)
            .execute()
        )

        if user.data:
            current_score = user.data[0].get("integrity_score", 0.5)
            new_score = min(1.0, current_score + (fields_provided * 0.02))
            update_data["integrity_score"] = new_score

    result = (
        supabase.table("users")
        .update(update_data)
        .eq("id", user_id)
        .execute()
    )

    if result.data:
        # Registrar actualización demográfica en el Audit Log
        audit_bus.log_event(
            actor_id=user_id,
            action="PROFILE_DEMOGRAPHIC_UPDATED",
            entity_type="USER",
            entity_id=user_id,
            details={
                "fields_updated": fields_updated,
                "fields_count": fields_provided,
            },
        )

        return {
            "status": "success",
            "fields_updated": fields_provided,
            "message": (
                f"Perfil actualizado. {fields_provided} campo(s) registrado(s). "
                "Tu poder de voto ha aumentado."
            ),
        }

    raise Exception("Error al actualizar el perfil demográfico")
