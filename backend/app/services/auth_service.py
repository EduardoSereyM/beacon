"""
BEACON PROTOCOL — Auth Service (El Rito de Iniciación)
=======================================================
Gestiona el nacimiento de un usuario en el búnker.
Asegura que el rut_hash sea su única identidad inmutable.

Reglas de Oro:
  - Todo usuario nuevo nace con rango BRONZE
  - verification_level inicia en 1 (Email)
  - El DNAScanner se ejecuta ANTES de persistir
  - Cada registro se escribe en el audit_log inmutable

"Entrar es fácil. Escalar es la prueba."
"""

from datetime import datetime
from typing import Optional
from passlib.context import CryptContext

from app.core.database import get_async_supabase_client
from app.core.audit_logger import audit_bus
from app.core.security.dna_scanner import gatekeeper
from app.domain.enums import UserRank, VerificationLevel
from app.domain.schemas.user import UserCreate


# ─── Bcrypt para hashing de contraseñas ───
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hashea la contraseña con bcrypt. Trunca a 72 bytes (límite duro de bcrypt)."""
    truncated = password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
    return pwd_context.hash(truncated)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica una contraseña contra su hash bcrypt."""
    return pwd_context.verify(plain_password, hashed_password)


async def register_user(user_data: UserCreate, request_metadata: dict = None) -> dict:
    """
    Registra un nuevo ciudadano en el Búnker Beacon.

    Flujo:
      1. Ejecuta el DNA Scanner sobre los metadatos del request
      2. Hashea la contraseña con bcrypt
      3. Crea el registro en la tabla 'users' de Supabase
      4. El ciudadano nace como BRONZE con integrity_score = 0.5
      5. Registra el evento en el audit_log inmutable

    Args:
        user_data: Schema UserCreate validado por Pydantic
        request_metadata: Metadatos capturados del request (IP, UA, timing)

    Returns:
        Diccionario con el usuario creado, rango y resultado del DNA scan

    Raises:
        Exception: Si el email ya existe o hay error en Supabase
    """
    supabase = get_async_supabase_client()

    # ─── 1. Análisis Forense del DNA Scanner ───
    dna_result = {"score": 100, "classification": "HUMAN", "alerts": []}
    if request_metadata:
        dna_result = gatekeeper.scan_request(request_metadata)

    if dna_result["classification"] == "DISPLACED":
        raise Exception("Error en la validación de seguridad (DISPLACED).")

    # ─── 2. Registro en Supabase Auth (Admin API con email auto-confirmado) ───
    # Se usa admin.create_user (service_role) para confirmar email inmediatamente.
    # sign_up() deja al usuario sin confirmar → sign_in_with_password devuelve 400.
    auth_response = await supabase.auth.admin.create_user({
        "email": user_data.email,
        "password": user_data.password,
        "email_confirm": True,
    })

    if not auth_response.user:
        raise Exception("Falla al generar identidad en Supabase Auth")
         
    auth_user_id = auth_response.user.id

    # ─── 3. Preparar datos para inserción en schema público ───
    new_user = {
        "id": auth_user_id,
        "email": user_data.email,
        "full_name": user_data.full_name,
        "hashed_password": hash_password(user_data.password), # Fallback interno
        "password_history": [hash_password(user_data.password)], # Control de rotación (fase 2)
        "rank": UserRank.BRONZE,
        "integrity_score": 0.5,
        "reputation_score": 0.0,
        "verification_level": VerificationLevel.EMAIL,
        "created_at": datetime.utcnow().isoformat(),
        "role": "user"
    }

    # Campos demográficos extendidos (Mina de Oro desde el registro)
    if hasattr(user_data, "country") and user_data.country:
        new_user["country"] = user_data.country
    if hasattr(user_data, "commune") and user_data.commune:
        new_user["commune"] = user_data.commune
    if hasattr(user_data, "region") and user_data.region:
        new_user["region"] = user_data.region
    if hasattr(user_data, "age_range") and user_data.age_range:
        new_user["age_range"] = user_data.age_range

    # ─── Audit: Intento de registro ───
    audit_bus.log_event(
        actor_id="ANONYMOUS",
        action="IDENTITY_REGISTRATION_ATTEMPT",
        entity_type="USER",
        entity_id=user_data.email,
        details={
            "dna_score": dna_result["score"],
            "dna_classification": dna_result["classification"],
            "ip": request_metadata.get("ip", "unknown") if request_metadata else "unknown",
            "has_commune": bool(new_user.get("commune")),
            "has_region": bool(new_user.get("region")),
        },
    )

    # ─── 3. Insertar en Supabase ───
    result = await supabase.table("users").insert(new_user).execute()

    if result.data:
        user = result.data[0]
        user_id = user["id"]

        # ─── 4. Registrar en el Audit Log (inmutable) ───
        audit_bus.log_event(
            actor_id=user_id,
            action="USER_REGISTERED",
            entity_type="USER",
            entity_id=user_id,
            details={
                "rank": UserRank.BRONZE,
                "dna_score": dna_result["score"],
                "dna_classification": dna_result["classification"],
                "dna_alerts": dna_result["alerts"],
                "ip": request_metadata.get("ip", "unknown") if request_metadata else "unknown",
            },
        )

        return {
            "status": "success",
            "user_id": user_id,
            "rank": UserRank.BRONZE,
            "integrity_score": 0.5,
            "dna_classification": dna_result["classification"],
            "message": "Ciudadano registrado. Nivel: BRONZE. Verifica tu RUT para ascender.",
        }

    raise Exception("Error al registrar el ciudadano en Supabase")


# login_user() fue removida en PR-07.
# La autenticación real ocurre en el endpoint POST /login vía
# supabase.auth.sign_in_with_password(), que devuelve el JWT de Supabase.
# Esta función bcrypt-based quedó obsoleta desde que migramos a Supabase Auth.


async def get_user_by_id(user_id: str) -> Optional[dict]:
    """
    Obtiene un ciudadano por su ID.
    Usado internamente por los servicios del búnker.
    """
    supabase = get_async_supabase_client()

    result = await (
        supabase.table("users")
        .select("*")
        .eq("id", user_id)
        .execute()
    )

    return result.data[0] if result.data else None


async def change_citizen_password(user_id: str, new_password: str) -> bool:
    """
    Cambia la contraseña de un ciudadano con doble escritura:
      1. Supabase Auth (fuente de verdad de autenticación)
      2. Tabla users: hashed_password + password_history (historial interno)

    La escritura en Supabase Auth usa la Admin API (service_role),
    por lo que nunca se expone la contraseña nueva al cliente.

    Verifica que el ciudadano no reutilice ninguna de sus últimas 3 contraseñas.

    Args:
        user_id: UUID del ciudadano
        new_password: Nueva contraseña en texto plano (se descarta tras el hash)

    Raises:
        ValueError: Si el usuario no existe o reutilizó contraseña reciente
    """
    supabase = get_async_supabase_client()

    user = await get_user_by_id(user_id)
    if not user:
        raise ValueError("Usuario no encontrado")

    history = user.get("password_history", [])

    # Verificar que no se reutilicen las últimas 3 contraseñas
    for past_hash in history[-3:]:
        if verify_password(new_password, past_hash):
            raise ValueError(
                "Directiva de Seguridad: No puedes reutilizar tus últimas 3 contraseñas."
            )

    new_hash = hash_password(new_password)
    new_history = history + [new_hash]

    # ─── 1. Sincronizar con Supabase Auth (fuente de verdad) ───
    # Usar Admin API para no requerir la contraseña actual.
    # NUNCA se registra new_password en texto plano.
    try:
        await supabase.auth.admin.update_user_by_id(
            user_id,
            {"password": new_password},
        )
    except Exception as e:
        # Si Supabase Auth falla, abortamos para no crear divergencia
        audit_bus.log_event(
            actor_id=user_id,
            action="IDENTITY_PASSWORD_CHANGE_FAILED",
            entity_type="USER",
            entity_id=user_id,
            details={"stage": "SUPABASE_AUTH", "error": str(e)},
        )
        raise ValueError("Error al actualizar la contraseña en Supabase Auth.") from e

    # ─── 2. Actualizar tabla users (historial interno) ───
    await supabase.table("users").update({
        "hashed_password": new_hash,
        "password_history": new_history,
    }).eq("id", user_id).execute()

    # ─── 3. Audit Log inmutable (sin contraseña en plano) ───
    audit_bus.log_event(
        actor_id=user_id,
        action="IDENTITY_PASSWORD_CHANGED",
        entity_type="USER",
        entity_id=user_id,
        details={"rotated": True, "history_depth": len(new_history)},
    )

    return True
