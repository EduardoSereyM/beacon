"""
BEACON PROTOCOL — Identity Service (El Gestor de Ascensión)
=============================================================
Gestiona la verificación de identidad y el ascenso de rangos.

Sistema de 2 rangos (v1):
  BASIC    → Solo email verificado. Voto pesa 0.5x.
  VERIFIED → 6 campos completos: RUT + birth_year + gender + country + region + commune.
             Voto pesa 1.0x.

Funciones públicas:
  - verify_rut()                 → Hashea el RUT y reevalúa el rango
  - update_demographic_profile() → Actualiza campos demográficos y reevalúa rango

Helper privado:
  - _evaluate_rank()             → VERIFIED si los 5 campos están presentes, sino BASIC

Trazabilidad: Cada ascensión y actualización se registra
en el AuditLogger inmutable. El Escriba no olvida.

"Entregar tu identidad es apostar por la verdad.
 A cambio, Beacon te da un asiento en la Mesa de la Integridad."
"""

from datetime import datetime
from typing import Optional

from app.core.database import get_async_supabase_client
from app.core.audit_logger import audit_bus
from app.core.security.rut_validator import validate_rut, hash_rut
from app.domain.enums import UserRank, VerificationLevel


# ─── Helper privado: evaluación de rango ─────────────────────────────────────

async def _evaluate_rank(supabase, user_id: str) -> str:
    """
    Evalúa si un ciudadano cumple los requisitos para VERIFIED.

    Requisitos (todos obligatorios):
      1. rut_hash presente (RUT verificado con Módulo 11)
      2. birth_year presente
      3. gender presente
      4. country presente
      5. region presente
      6. commune presente

    Returns:
        'VERIFIED' si todos los campos están presentes, 'BASIC' en caso contrario.
    """
    result = await (
        supabase.table("users")
        .select("rut_hash, birth_year, gender, country, region, commune")
        .eq("id", user_id)
        .single()
        .execute()
    )

    if not result.data:
        return UserRank.BASIC

    u = result.data
    all_fields_present = all([
        u.get("rut_hash"),
        u.get("birth_year"),
        u.get("gender"),
        u.get("country"),
        u.get("region"),
        u.get("commune"),
    ])

    return UserRank.VERIFIED if all_fields_present else UserRank.BASIC


# ─── verify_rut ──────────────────────────────────────────────────────────────

async def verify_rut(user_id: str, rut: str) -> dict:
    """
    El Rito de Paso: valida el RUT y reevalúa el rango del ciudadano.

    Flujo:
      1. Valida el dígito verificador (Módulo 11)
      2. Genera el rut_hash (SHA-256 + salt)
      3. Verifica que el RUT no esté duplicado (unicidad)
      4. Actualiza rut_hash + is_rut_verified en users
      5. Evalúa si ahora cumple todos los campos para VERIFIED
      6. Si sí → rank=VERIFIED; si no → rank=BASIC (con RUT guardado)
      7. Descarta el RUT en texto plano inmediatamente
      8. Registra en AuditLogger

    Args:
        user_id: UUID del ciudadano en Supabase
        rut: RUT chileno en cualquier formato (ej: "12.345.678-9")

    Returns:
        Diccionario con el nuevo estatus del ciudadano

    Raises:
        ValueError: Si el RUT es inválido o ya está registrado
    """
    supabase = get_async_supabase_client()

    # ─── Paso 1: Validación del Dígito Verificador ───
    if not validate_rut(rut):
        await audit_bus.alog_event(
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
    existing = await (
        supabase.table("users")
        .select("id")
        .eq("rut_hash", rut_hashed)
        .execute()
    )

    if existing.data:
        await audit_bus.alog_event(
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

    # ─── Paso 4: Persistir rut_hash ───
    await (
        supabase.table("users")
        .update({
            "rut_hash": rut_hashed,
            "is_rut_verified": True,
            "updated_at": datetime.utcnow().isoformat(),
        })
        .eq("id", user_id)
        .execute()
    )

    # ─── Paso 5: Evaluar rango post-verificación ───
    new_rank = await _evaluate_rank(supabase, user_id)

    # Calcular nuevo integrity_score según rango alcanzado
    new_integrity = 0.75 if new_rank == UserRank.VERIFIED else 0.6

    await (
        supabase.table("users")
        .update({
            "rank": new_rank,
            "integrity_score": new_integrity,
            "updated_at": datetime.utcnow().isoformat(),
        })
        .eq("id", user_id)
        .execute()
    )

    # ─── Paso 6: Audit Log ───
    await audit_bus.alog_event(
        actor_id=user_id,
        action="USER_VERIFIED_RUT",
        entity_type="USER",
        entity_id=user_id,
        details={
            "previous_rank": "BASIC",
            "new_rank": new_rank,
            "new_integrity_score": new_integrity,
            "verification_level": VerificationLevel.RUT,
            "verified_to_verified": new_rank == UserRank.VERIFIED,
        },
    )

    await audit_bus.alog_event(
        actor_id=user_id,
        action="USER_RANK_CHANGED",
        entity_type="USER",
        entity_id=user_id,
        details={
            "from": "BASIC",
            "to": new_rank,
            "reason": "RUT_VERIFICATION",
        },
    )

    if new_rank == UserRank.VERIFIED:
        message = (
            "¡Eres VERIFICADO! Tu voto ahora vale el doble (1.0x). "
            "Gracias por apostar por la verdad."
        )
    else:
        message = (
            "RUT verificado correctamente. "
            "Completa tu perfil (año de nacimiento, país, región, comuna) "
            "para ascender a VERIFICADO y que tu voto valga 1.0x."
        )

    return {
        "status": "success",
        "new_rank": new_rank,
        "integrity_score": new_integrity,
        "is_verified": new_rank == UserRank.VERIFIED,
        "message": message,
    }


# ─── update_demographic_profile ──────────────────────────────────────────────

async def update_demographic_profile(
    user_id: str,
    age_range: Optional[str] = None,
    birth_year: Optional[int] = None,
    gender: Optional[str] = None,
    country: Optional[str] = None,
    region: Optional[str] = None,
    commune: Optional[str] = None,
) -> dict:
    """
    Actualiza el perfil demográfico del ciudadano.
    Cada dato entregado:
      - Alimenta la "Mina de Oro" (segmentación B2B)
      - Aumenta el integrity_score (+0.02 por campo nuevo)
      - Puede desencadenar el ascenso automático a VERIFIED

    El ascenso a VERIFIED ocurre si tras la actualización se cumplen los 6 campos:
      rut_hash + birth_year + gender + country + region + commune

    Args:
        user_id: UUID del ciudadano
        age_range:  Rango etario (ej: "25-34") — solo estadística, no afecta rango
        birth_year: Año de nacimiento (ej: 1990) — requerido para VERIFIED
        gender:     Género (ej: "Femenino") — requerido para VERIFIED
        country:    País (ej: "Chile") — requerido para VERIFIED
        region:     Región (ej: "Metropolitana") — requerido para VERIFIED
        commune:    Comuna (ej: "Providencia") — requerido para VERIFIED

    Returns:
        Diccionario con el resultado de la actualización y el nuevo rango
    """
    supabase = get_async_supabase_client()

    # Construir solo los campos que se van a actualizar
    update_data: dict = {"updated_at": datetime.utcnow().isoformat()}
    fields_updated: list[str] = []

    field_map = {
        "age_range":  age_range,
        "birth_year": birth_year,
        "gender":     gender,
        "country":    country,
        "region":     region,
        "commune":    commune,
    }
    for field, value in field_map.items():
        if value is not None:
            update_data[field] = value
            fields_updated.append(field)

    fields_count = len(fields_updated)

    # Boost de integrity_score por campos completados
    if fields_count > 0:
        user_row = await (
            supabase.table("users")
            .select("integrity_score")
            .eq("id", user_id)
            .single()
            .execute()
        )
        if user_row.data:
            current_score = float(user_row.data.get("integrity_score", 0.5))
            # Solo contamos los campos relevantes para VERIFIED (no age_range)
            verified_fields = [f for f in fields_updated if f != "age_range"]
            boost = len(verified_fields) * 0.02
            update_data["integrity_score"] = round(min(1.0, current_score + boost), 4)

    # Persistir campos demográficos
    await (
        supabase.table("users")
        .update(update_data)
        .eq("id", user_id)
        .execute()
    )

    # ─── Reevaluar rango post-actualización ───
    new_rank = await _evaluate_rank(supabase, user_id)
    previous_rank_row = await (
        supabase.table("users")
        .select("rank")
        .eq("id", user_id)
        .single()
        .execute()
    )
    previous_rank = previous_rank_row.data.get("rank", "BASIC") if previous_rank_row.data else "BASIC"

    rank_changed = new_rank != previous_rank
    if rank_changed:
        await (
            supabase.table("users")
            .update({"rank": new_rank})
            .eq("id", user_id)
            .execute()
        )

    # ─── Audit Log ───
    await audit_bus.alog_event(
        actor_id=user_id,
        action="PROFILE_DEMOGRAPHIC_UPDATED",
        entity_type="USER",
        entity_id=user_id,
        details={
            "fields_updated": fields_updated,
            "fields_count": fields_count,
            "rank_changed": rank_changed,
            "new_rank": new_rank,
        },
    )

    if rank_changed and new_rank == UserRank.VERIFIED:
        await audit_bus.alog_event(
            actor_id=user_id,
            action="USER_RANK_CHANGED",
            entity_type="USER",
            entity_id=user_id,
            details={
                "from": previous_rank,
                "to": UserRank.VERIFIED,
                "reason": "DEMOGRAPHICS_COMPLETE",
            },
        )
        message = (
            f"¡Perfil completo! {fields_count} campo(s) actualizado(s). "
            "Has ascendido a VERIFICADO — tu voto ahora vale 1.0x. 🎉"
        )
    else:
        message = (
            f"Perfil actualizado. {fields_count} campo(s) registrado(s). "
            "Tu poder de voto aumentará cuando completes todos los campos."
        )

    return {
        "status": "success",
        "fields_updated": fields_count,
        "new_rank": new_rank,
        "rank_changed": rank_changed,
        "message": message,
    }
