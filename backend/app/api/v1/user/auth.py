"""
BEACON PROTOCOL — Auth Router (El Puesto de Control)
=====================================================
Endpoints estratégicos para el módulo de autenticación.
Cada petición pasa por el DNA Scanner antes de tocar la BBDD.

Endpoints:
  POST /register         → Registro con ADN digital capturado
  POST /login            → Autenticación con JWT
  POST /verify-identity  → Rito de paso BRONZE → SILVER (RUT)
  GET  /me               → Perfil del ciudadano autenticado
  PUT  /profile          → Actualización demográfica (Mina de Oro)

"El que quiera hablar, primero debe demostrar que es real."
"""

from fastapi import APIRouter, Request, HTTPException, Depends

from app.core.security.dna_scanner import gatekeeper
from app.domain.schemas.user import (
    UserCreate,
    UserVerifyRUT,
    UserProfileUpdate,
)
from app.services.auth_service import (
    register_user,
    get_user_by_id,
)
from app.services.identity_service import (
    verify_rut,
    update_demographic_profile,
)


router = APIRouter()


# ─── Helper: Validar token de Supabase Auth ───
async def get_current_user(request: Request) -> dict:
    """
    Dependency de FastAPI: valida el Bearer token consultando a Supabase Auth.
    Supabase verifica su propio JWT server-side → no se usa JWT_SECRET_KEY.
    Retorna la fila completa del ciudadano desde la tabla 'users'.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")

    token = auth_header.split(" ")[1]

    try:
        from app.core.database import get_supabase_client
        supabase = get_supabase_client()
        auth_response = supabase.auth.get_user(token)
        user_id = auth_response.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Token expirado o inválido")

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Ciudadano no encontrado")

    return user


# ═══════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════


@router.post("/register", summary="Registrar nuevo ciudadano")
async def register(user_in: UserCreate, request: Request):
    """
    Registra un nuevo ciudadano en el Búnker Beacon.

    Flujo:
      1. Captura de ADN Digital (IP, User-Agent, timing)
      2. Análisis forense del DNA Scanner
      3. Si pasa el filtro → Registro como BRONZE (score 0.5)
      4. Si es DISPLACED → Rechazo silencioso
    """
    # ─── 1. Captura de ADN Digital ───
    metadata = {
        "ip": request.client.host if request.client else "unknown",
        "user_agent": request.headers.get("user-agent", ""),
        "fill_duration": float(request.headers.get("x-fill-duration", "10")),
    }

    # ─── 2. Análisis Forense ───
    analysis = gatekeeper.scan_request(metadata)

    if analysis["classification"] == "DISPLACED":
        # No le decimos que lo detectamos (Shadow Mode)
        raise HTTPException(
            status_code=400,
            detail="Error en la validación de seguridad. Intenta nuevamente.",
        )

    # ─── 3. Registro del Ciudadano (con metadatos forenses) ───
    try:
        result = await register_user(user_in, request_metadata=metadata)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", summary="Iniciar sesión")
async def login(request: Request):
    """
    Autentica un ciudadano vía Supabase Auth (OTP/Password) y devuelve el JWT de Supabase.
    El token contiene los claims RBAC.
    """
    body = await request.json()
    email = body.get("email", "")
    password = body.get("password", "")

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email y contraseña son obligatorios")

    # ─── 1. Análisis Forense (Gatekeeper Velocity) ───
    metadata = {
        "ip": request.client.host if request.client else "unknown",
        "user_agent": request.headers.get("user-agent", ""),
        "fill_duration": float(request.headers.get("x-fill-duration", "10")),
    }
    analysis = gatekeeper.scan_request(metadata)
    if analysis["classification"] == "DISPLACED":
        # Simular credenciales inválidas para no alertar a la botnet
        raise HTTPException(status_code=401, detail="Error de autenticación: Credenciales inválidas")

    try:
        from app.core.database import get_supabase_client
        supabase = get_supabase_client()
        
        # Iniciar sesión vía Supabase Auth (esto genera el JWT con claims RBAC)
        auth_response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        
        if not auth_response.user:
            raise ValueError("Credenciales inválidas o cuenta no verificada")

        # Recuperar datos extra del perfil en tabla users
        user_db = await get_user_by_id(auth_response.user.id)
        if not user_db:
            raise ValueError("Perfil de ciudadano no encontrado en el Búnker")

        # Verificar que la cuenta no esté suspendida en la tabla users.
        # Supabase Auth autentica correctamente, pero el estado interno
        # (shadow-ban, suspensión administrativa) vive en nuestra tabla.
        if not user_db.get("is_active", True):
            raise ValueError("Cuenta suspendida. Contacta al administrador.")

        return {
            "access_token": auth_response.session.access_token,
            "token_type": "bearer",
            "user": {
                "id": user_db["id"],
                "email": auth_response.user.email,
                "full_name": user_db.get("full_name", "Ciudadano"),
                "rank": user_db.get("rank", "BRONZE"),
                "integrity_score": float(user_db.get("integrity_score", 0.5)),
                "is_verified": user_db.get("is_verified", False),
                "role": user_db.get("role", "user"),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Error de autenticación: {str(e)}")


@router.post("/verify-identity", summary="Verificar RUT (Ascensión a SILVER)")
async def verify_identity(
    rut_data: UserVerifyRUT,
    current_user: dict = Depends(get_current_user),
):
    """
    El Rito de Paso: el ciudadano entrega su RUT y Beacon
    lo promueve de BRONZE a SILVER.

    Requisitos:
      - Usuario autenticado con JWT
      - RUT chileno válido (Módulo 11)
      - RUT no duplicado en el sistema
    """
    try:
        result = await verify_rut(current_user["id"], rut_data.rut)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/me", summary="Perfil del ciudadano autenticado")
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    Retorna el perfil público del ciudadano autenticado.
    NUNCA incluye hashed_password, rut_hash ni datos forenses.
    """
    return {
        "id": current_user["id"],
        "email": current_user.get("email", ""),
        "full_name": current_user.get("full_name", "Ciudadano"),
        "rank": current_user.get("rank", "BRONZE"),
        "integrity_score": float(current_user.get("integrity_score", 0.5)),
        "reputation_score": float(current_user.get("reputation_score", 0.0)),
        "verification_level": current_user.get("verification_level", 1),
        "is_verified": current_user.get("is_verified", False),
        "commune": current_user.get("commune"),
        "region": current_user.get("region"),
        "age_range": current_user.get("age_range"),
        "created_at": current_user.get("created_at"),
    }


@router.put("/profile", summary="Actualizar perfil demográfico")
async def update_profile(
    profile_data: UserProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    Actualiza los datos demográficos del ciudadano.
    Cada dato entregado:
      - Alimenta la "Mina de Oro" (segmentación B2B)
      - Aumenta el integrity_score (+0.02 por campo)
      - Acerca al usuario al rango GOLD
    """
    try:
        result = await update_demographic_profile(
            user_id=current_user["id"],
            commune=profile_data.commune,
            region=profile_data.region,
            age_range=profile_data.age_range,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
