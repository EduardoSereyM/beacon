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
      3. Si pasa el filtro → Registro como BASIC (score 0.5)
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

        # Actualizar last_login_at en public.users
        from datetime import datetime
        await supabase.table("users").update({
            "last_login_at": datetime.utcnow().isoformat()
        }).eq("id", auth_response.user.id).execute()

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
                "rank": user_db.get("rank", "BASIC"),
                "integrity_score": float(user_db.get("integrity_score", 0.5)),
                "reputation_score": float(user_db.get("reputation_score", 0.5)),
                "verification_level": 2 if user_db.get("is_rut_verified") else 1,
                "is_verified": user_db.get("is_rut_verified", False),
                "role": user_db.get("role", "user"),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Error de autenticación: {str(e)}")


@router.post("/verify-identity", summary="Verificar RUT (Ascensión a VERIFIED)")
async def verify_identity(
    rut_data: UserVerifyRUT,
    current_user: dict = Depends(get_current_user),
):
    """
    El Rito de Paso: el ciudadano entrega su RUT y Beacon
    evalúa si asciende a VERIFIED.

    Requisitos para VERIFIED:
      - RUT chileno válido (Módulo 11) — este endpoint
      - birth_year + country + region + commune — vía /profile
      Si todos los campos están presentes → rango VERIFIED automático.
    """
    try:
        result = await verify_rut(current_user["id"], rut_data.rut)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/forgot-password", summary="Solicitar restablecimiento de contraseña")
async def forgot_password(request: Request):
    """
    Inicia el flujo de recuperación de contraseña.
    Supabase envía un email con enlace al ciudadano.

    Seguridad: siempre responde igual (200) independientemente de si el
    email existe o no, para no revelar qué cuentas están registradas.
    """
    from app.core.config import get_settings
    settings = get_settings()

    body = await request.json()
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="El email es obligatorio")

    try:
        from app.core.database import get_async_supabase_client
        supabase = get_async_supabase_client()
        redirect_url = f"{settings.FRONTEND_URL}/auth/reset-password"
        await supabase.auth.reset_password_for_email(
            email,
            options={"redirect_to": redirect_url},
        )
    except Exception:
        # Silencioso: no revelar si el email existe o no
        pass

    return {
        "message": "Si existe una cuenta con ese email, recibirás un enlace de recuperación en los próximos minutos."
    }


@router.post("/reset-password", summary="Establecer nueva contraseña con token de recuperación")
async def reset_password(request: Request):
    """
    Segundo paso del flujo de recuperación.
    Recibe el token_hash del enlace + la nueva contraseña.

    Flujo:
      1. Verifica el OTP de recuperación (token_hash + type=recovery)
      2. Actualiza la contraseña del ciudadano via admin API
      3. Retorna éxito
    """
    body = await request.json()
    token_hash = body.get("token_hash", "").strip()
    access_token = body.get("access_token", "").strip()
    new_password = body.get("new_password", "")

    if not token_hash and not access_token:
        raise HTTPException(status_code=400, detail="token_hash o access_token es obligatorio")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    # Validación de complejidad (mismas reglas que el registro)
    import re
    if not re.search(r'[A-Z]', new_password):
        raise HTTPException(status_code=400, detail="La contraseña debe contener al menos una mayúscula")
    if not re.search(r'[0-9]', new_password):
        raise HTTPException(status_code=400, detail="La contraseña debe contener al menos un número")
    if not re.search(r'[@#$%&*]', new_password):
        raise HTTPException(status_code=400, detail="La contraseña debe contener al menos un carácter especial (@#$%&*)")

    try:
        from app.core.database import get_async_supabase_client
        supabase = get_async_supabase_client()

        # 1. Obtener user_id — dos flujos posibles
        if access_token:
            # Flujo implícito: Supabase ya estableció sesión, tenemos access_token directo
            user_response = await supabase.auth.get_user(access_token)
            if not user_response.user:
                raise HTTPException(status_code=400, detail="Token inválido o expirado")
            user_id = user_response.user.id
        else:
            # Flujo OTP: verificar token_hash de recovery
            auth_response = await supabase.auth.verify_otp({
                "token_hash": token_hash,
                "type": "recovery",
            })
            if not auth_response.user:
                raise HTTPException(status_code=400, detail="Token inválido o expirado")
            user_id = auth_response.user.id

        # 2. Actualizar contraseña via REST directo con service_role
        # (evita contaminación de sesión del cliente singleton post-verify_otp)
        import httpx
        from app.core.config import get_settings
        settings = get_settings()

        async with httpx.AsyncClient() as http:
            r = await http.put(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers={
                    "apikey": settings.SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
                json={"password": new_password},
            )
            if r.status_code != 200:
                err = r.json()
                raise HTTPException(
                    status_code=400,
                    detail=err.get("message", "Error al actualizar contraseña"),
                )

        return {
            "status": "updated",
            "message": "Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al restablecer contraseña: {str(e)}")


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

    # -- Dynamic Self-Healing Verification ---
    current_rank = current_user.get("rank", "BASIC")
    if current_rank == "VERIFIED":
        all_6_fields = all([
            current_user.get("rut_hash"),
            current_user.get("birth_year"),
            current_user.get("gender"),
            current_user.get("country"),
            current_user.get("region"),
            current_user.get("commune")
        ])
        if not all_6_fields:
            current_rank = "BASIC"
            
    is_verified_status = (current_rank == "VERIFIED")

    return {
        "id": current_user["id"],
        "email": current_user.get("email", current_user.get("_auth_email", "")),
        "full_name": full_name,
        "rank": current_rank,
        "integrity_score": float(current_user.get("integrity_score", 0.5)),
        "reputation_score": float(current_user.get("reputation_score", 0.5)),
        "verification_level": 2 if current_user.get("is_rut_verified") else 1,
        "is_verified": is_verified_status,
        "role": current_user.get("role", "user"),
        "age_range": current_user.get("age_range"),
        "region": current_user.get("region"),
        "commune": current_user.get("commune"),
        "country": current_user.get("country"),
        "birth_year": current_user.get("birth_year"),
        "gender": current_user.get("gender"),
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
      - Aumenta el integrity_score (+0.02 por campo relevante)
      - Puede desencadenar el ascenso automático a VERIFIED si todos los
        campos están presentes: RUT + birth_year + country + region + commune
    """
    try:
        result = await update_demographic_profile(
            user_id=current_user["id"],
            age_range=profile_data.age_range,
            birth_year=profile_data.birth_year,
            country=profile_data.country,
            region=profile_data.region,
            commune=profile_data.commune,
            gender=profile_data.gender,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
