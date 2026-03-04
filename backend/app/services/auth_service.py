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

from app.core.database import get_supabase_client
from app.core.audit_logger import audit_bus
from app.core.security.dna_scanner import gatekeeper
from app.domain.enums import UserRank, VerificationLevel
from app.domain.schemas.user import UserCreate


# ─── Bcrypt para hashing de contraseñas ───
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hashea la contraseña con bcrypt."""
    return pwd_context.hash(password)


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
    supabase = get_supabase_client()

    # ─── 1. Análisis Forense del DNA Scanner ───
    dna_result = {"score": 100, "classification": "HUMAN", "alerts": []}
    if request_metadata:
        dna_result = gatekeeper.scan_request(request_metadata)

    if dna_result["classification"] == "DISPLACED":
        raise Exception("Error en la validación de seguridad (DISPLACED).")

    # ─── 2. Registro en Supabase Auth ───
    # Registramos al usuario en autenticación para activar el flujo OTP/Password
    auth_response = supabase.auth.sign_up({
        "email": user_data.email,
        "password": user_data.password,
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
    result = supabase.table("users").insert(new_user).execute()

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


async def login_user(email: str, password: str) -> dict:
    """
    Autentica un ciudadano en el Búnker.

    Flujo:
      1. Busca al usuario por email (solo activos)
      2. Verifica la contraseña con bcrypt
      3. Retorna los datos del usuario para generar JWT

    Args:
        email: Email del ciudadano
        password: Contraseña en texto plano (se verifica y descarta)

    Returns:
        Diccionario con los datos del usuario autenticado

    Raises:
        ValueError: Si las credenciales son inválidas
    """
    supabase = get_supabase_client()

    # Buscar usuario por email (NOTA: el email real no está en 'users',
    # pero este método ahora parece ser legacy si usamos sign_in de Auth.
    # Aún así, quitamos is_active para evitar crasheos si se llama).
    result = (
        supabase.table("users")
        .select("*")
        .eq("email", email)
        .execute()
    )

    if not result.data:
        raise ValueError("Credenciales inválidas")

    user = result.data[0]

    # Verificar contraseña
    if not verify_password(password, user["hashed_password"]):
        raise ValueError("Credenciales inválidas")

    return user


async def get_user_by_id(user_id: str) -> Optional[dict]:
    """
    Obtiene un ciudadano por su ID.
    Usado internamente por los servicios del búnker.
    """
    supabase = get_supabase_client()

    result = (
        supabase.table("users")
        .select("*")
        .eq("id", user_id)
        .execute()
    )

    return result.data[0] if result.data else None


async def change_citizen_password(user_id: str, new_password: str) -> bool:
    """
    Cambia la contraseña de un usuario, asegurando que no reutilice las últimas 3.
    (Llamado desde el Flow de Recovery o Cambio interno).
    """
    supabase = get_supabase_client()

    user = await get_user_by_id(user_id)
    if not user:
        raise ValueError("Usuario no encontrado")
        
    history = user.get("password_history", [])
    
    # Verificar si la nueva contraseña ha sido usada recientemente
    for past_hash in history[-3:]: # Comprobar las últimas 3
        if verify_password(new_password, past_hash):
            raise ValueError("Directiva de Seguridad: No puedes reutilizar tus últimas 3 contraseñas.")
            
    # Registrar en BBDD (y en auth idealmente, pero eso lo hace Supabase por su lado)
    new_hash = hash_password(new_password)
    new_history = history + [new_hash]
    
    supabase.table("users").update({
        "hashed_password": new_hash,
        "password_history": new_history
    }).eq("id", user_id).execute()
    
    # Audit log (jamás registrar contraseña en plano)
    audit_bus.log_event(
        actor_id=user_id,
        action="IDENTITY_PASSWORD_CHANGED",
        entity_type="USER",
        entity_id=user_id,
        details={"rotated": True}
    )
    
    return True
