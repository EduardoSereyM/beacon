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
    Retorna la fila de public.users + email inyectado desde auth.users.

    Schema real de public.users:
      id, first_name, last_name, rut_hash, comuna_id,
      reputation_score, is_rut_verified, is_shadow_banned, role
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")

    token = auth_header.split(" ")[1]

    try:
        from app.core.database import get_async_supabase_client
        supabase = get_async_supabase_client()
        auth_response = await supabase.auth.get_user(token)
        user_id = auth_response.user.id
        user_email = auth_response.user.email or ""
    except Exception:
        raise HTTPException(status_code=401, detail="Token expirado o inválido")

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Ciudadano no encontrado")

    # Inyectar email desde auth.users (no existe en public.users)
    user["_auth_email"] = user_email
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
        error_msg = str(e).lower()
        # Rate limit de emails de Supabase (plan gratuito: 2 emails/hora)
        if "rate limit" in error_msg or "email rate" in error_msg or "over_email_send_rate_limit" in error_msg:
            raise HTTPException(
                status_code=429,
                detail=(
                    "Límite de emails alcanzado. Supabase permite 2 emails de confirmación "
                    "por hora en plan gratuito. Espera unos minutos e intenta nuevamente, "
                    "o usa una dirección de email diferente."
                ),
            )
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/confirm-email", summary="Confirmar email con token de Supabase")
async def confirm_email(request: Request):
    """
    Recibe el token_hash enviado por Supabase en el enlace de confirmación
    y verifica la identidad del ciudadano.

    Supabase envía: token_hash + type (signup | recovery | invite | etc.)
    """
    body = await request.json()
    token_hash = body.get("token_hash", "")
    token_type = body.get("type", "signup")

    if not token_hash:
        raise HTTPException(status_code=400, detail="token_hash es obligatorio")

    try:
        from app.core.database import get_async_supabase_client
        supabase = get_async_supabase_client()

        # Verificar el OTP (token_hash + type) con Supabase Auth
        auth_response = await supabase.auth.verify_otp({
            "token_hash": token_hash,
            "type": token_type,
        })

        if not auth_response.user:
            raise HTTPException(status_code=400, detail="Token inválido o expirado")

        return {
            "status": "confirmed",
            "message": "Email confirmado correctamente. Ya puedes iniciar sesión.",
            "user_id": auth_response.user.id,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al confirmar email: {str(e)}")




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
        from app.core.database import get_async_supabase_client
        supabase = get_async_supabase_client()

        # Iniciar sesión vía Supabase Auth (esto genera el JWT con claims RBAC)
        auth_response = await supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        
        if not auth_response.user:
            raise ValueError("Credenciales inválidas o cuenta no verificada")

        # Recuperar datos extra del perfil en tabla users
        user_db = await get_user_by_id(auth_response.user.id)
        if not user_db:
            raise ValueError("Perfil de ciudadano no encontrado en el Búnker")

        # Verificar shadow-ban (vive en public.users, no en Supabase Auth)
        if user_db.get("is_shadow_banned", False):
            # Shadow mode: simular error genérico, no revelar el ban
            raise ValueError("Error de autenticación: Credenciales inválidas")

        # ─── Mapeo de columnas reales → respuesta frontend ───
        # Schema Beacon 2026: id, email, first_name, last_name, rank,
        #   integrity_score, reputation_score, is_rut_verified, role, etc.
        first = user_db.get("first_name", "")
        last = user_db.get("last_name", "")
        full_name = f"{first} {last}".strip() or "Ciudadano"

        return {
            "access_token": auth_response.session.access_token,
            "token_type": "bearer",
            "user": {
                "id": user_db["id"],
                "email": user_db.get("email", auth_response.user.email),
                "full_name": full_name,
                "rank": user_db.get("rank", "BRONZE"),
                "integrity_score": float(user_db.get("integrity_score", 0.5)),
                "reputation_score": float(user_db.get("reputation_score", 0.5)),
                "is_verified": user_db.get("is_rut_verified", False),
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
    # Mapeo de columnas reales → respuesta frontend (Schema Beacon 2026)
    first = current_user.get("first_name", "")
    last = current_user.get("last_name", "")
    full_name = f"{first} {last}".strip() or "Ciudadano"

    return {
        "id": current_user["id"],
        "email": current_user.get("email", current_user.get("_auth_email", "")),
        "full_name": full_name,
        "rank": current_user.get("rank", "BRONZE"),
        "integrity_score": float(current_user.get("integrity_score", 0.5)),
        "reputation_score": float(current_user.get("reputation_score", 0.5)),
        "verification_level": 2 if current_user.get("is_rut_verified") else 1,
        "is_verified": current_user.get("is_rut_verified", False),
        "role": current_user.get("role", "user"),
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
            age_range=profile_data.age_range,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
