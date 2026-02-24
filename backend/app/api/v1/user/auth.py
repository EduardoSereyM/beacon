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
from datetime import datetime, timedelta
from jose import jwt

from app.core.config import settings
from app.core.security.dna_scanner import gatekeeper
from app.domain.schemas.user import (
    UserCreate,
    UserVerifyRUT,
    UserProfileUpdate,
    UserResponse,
    TokenResponse,
)
from app.services.auth_service import (
    register_user,
    login_user,
    get_user_by_id,
)
from app.services.identity_service import (
    verify_rut,
    update_demographic_profile,
)


router = APIRouter()


# ─── Helper: Generar JWT ───
def create_access_token(user_id: str) -> str:
    """
    Genera un JWT firmado para el ciudadano autenticado.
    El token expira según ACCESS_TOKEN_EXPIRE_MINUTES.
    """
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "exp": expire,
        "iss": "BEACON_PROTOCOL",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ─── Helper: Extraer usuario del JWT ───
async def get_current_user(request: Request) -> dict:
    """
    Dependency de FastAPI: extrae y valida el JWT del header Authorization.
    Retorna los datos del usuario autenticado.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")

    token = auth_header.split(" ")[1]

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token inválido")
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
    Autentica un ciudadano y devuelve un JWT.
    El token será necesario para votar, comentar y acceder al Dashboard.
    """
    body = await request.json()
    email = body.get("email", "")
    password = body.get("password", "")

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email y contraseña son obligatorios")

    try:
        user = await login_user(email, password)
        token = create_access_token(user["id"])

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "full_name": user["full_name"],
                "rank": user["rank"],
                "integrity_score": user["integrity_score"],
                "is_verified": user["is_verified"],
            },
        }
    except ValueError:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")


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
        "email": current_user["email"],
        "full_name": current_user["full_name"],
        "rank": current_user["rank"],
        "integrity_score": current_user["integrity_score"],
        "reputation_score": current_user.get("reputation_score", 0.0),
        "verification_level": current_user.get("verification_level", 1),
        "is_verified": current_user["is_verified"],
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
