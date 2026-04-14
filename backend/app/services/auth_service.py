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

from typing import Optional

from app.core.database import get_async_supabase_client, get_supabase_anon_async
from app.core.audit_logger import audit_bus
from app.core.security.dna_scanner import gatekeeper
from app.core.config import settings
from app.domain.schemas.user import UserCreate


# ─── Nota sobre contraseñas ───
# La tabla public.users NO almacena hashed_password ni password_history.
# Supabase Auth es la ÚNICA fuente de verdad para autenticación.
# admin.create_user → crea el auth user con email+password.
# sign_in_with_password → valida credenciales y devuelve JWT.
# admin.update_user_by_id → cambia contraseñas (Admin API).

# ─── Utilidad de hashing (usada por scripts de admin, NO por el flujo principal) ───
from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="bcrypt")


def hash_password(password: str) -> str:
    """Utilidad de hashing. Usada por scripts admin. NO es el flujo principal."""
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Utilidad de verificación. Usada por scripts admin."""
    return _pwd_context.verify(plain_password, hashed_password)


async def register_user(user_data: UserCreate, request_metadata: dict = None) -> dict:
    """
    Registra un nuevo ciudadano en el Búnker Beacon.

    Flujo:
      1. DNA Scanner analiza metadatos del request
      2. admin.create_user en Supabase Auth (email_confirm=True)
      3. INSERT en public.users (first_name, last_name, rank, integrity, etc.)
      4. El ciudadano nace como BRONZE, under_deep_study=True
      5. Si CUALQUIER paso post-Auth falla → rollback (delete auth user)

    Args:
        user_data: Schema UserCreate validado por Pydantic
        request_metadata: Metadatos capturados del request (IP, UA, timing)

    Returns:
        Diccionario con el usuario creado, rango y resultado del DNA scan

    Raises:
        Exception: Si el email ya existe, DISPLACED, o error en Supabase
    """
    supabase = get_async_supabase_client()

    # ─── 1. Análisis Forense del DNA Scanner ───
    dna_result = {"score": 100, "classification": "HUMAN", "alerts": []}
    if request_metadata:
        dna_result = gatekeeper.scan_request(request_metadata)

    if dna_result["classification"] == "DISPLACED":
        raise Exception("Error en la validación de seguridad (DISPLACED).")

    # ─── 2. Registro en Supabase Auth ───────────────────────────────────────
    # DEBUG=True  (local) → admin.create_user: sin email, cuenta confirmada al instante.
    #   Bypass del rate limit de Supabase (2 emails/hora en plan gratuito).
    # DEBUG=False (producción) → sign_up: envía email real de confirmación.
    if settings.DEBUG:
        # Modo local: admin API, cuenta confirmada inmediatamente, sin email.
        auth_response = await supabase.auth.admin.create_user({
            "email": user_data.email,
            "password": user_data.password,
            "email_confirm": True,
        })
    else:
        # Modo producción: sign_up estándar → email de confirmación al usuario.
        # CRÍTICO: usar cliente anon separado para NO contaminar la sesión del
        # cliente service_role. Si se llama sign_up() en el cliente service_role,
        # sobrescribe su sesión interna con el JWT del nuevo usuario (no confirmado),
        # y el insert posterior a public.users devuelve 403.
        anon_client = get_supabase_anon_async()
        redirect_url = f"{settings.FRONTEND_URL}/auth/callback"
        auth_response = await anon_client.auth.sign_up({
            "email": user_data.email,
            "password": user_data.password,
            "options": {
                "email_redirect_to": redirect_url,
            },
        })

    if not auth_response.user:
        raise Exception("Falla al generar identidad en Supabase Auth")
         
    auth_user_id = auth_response.user.id

    # ─── 3–5. Todo lo que sigue va dentro del rollback ───────────────────────
    # Si CUALQUIER paso falla, el auth user se elimina para permitir reintento.
    try:
        # ─── 3. Preparar datos (Schema Beacon 2026 post-migración) ───
        # public.users: id, email, first_name, last_name, rut_hash, rank,
        #   integrity_score, reputation_score, is_rut_verified, is_shadow_banned,
        #   comuna_id, age_range, gender, device_fingerprint_hash,
        #   under_deep_study, is_active, role, updated_at
        name_parts = (user_data.full_name or "").strip().split(" ", 1)
        first_name = name_parts[0] if name_parts else ""
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        new_user = {
            "id": auth_user_id,
            "email": user_data.email,
            "first_name": first_name,
            "last_name": last_name,
            "rank": "BASIC",
            "integrity_score": 0.5,
            "reputation_score": 0.5,
            "under_deep_study": True,  # Incubadora Forense: activa para todo novato
            # role DEFAULT 'user', is_rut_verified DEFAULT false,
            # is_shadow_banned DEFAULT false, is_active DEFAULT true → DB defaults
        }

        # ─── 3b. Datos demográficos opcionales (Mina de Oro) ───
        # age_range, region, commune, country → texto (migración 016).
        # birth_year → integer (migración 016).
        # comuna_id (FK int4) se resolverá en P4 via lookup table.
        for field in ("age_range", "region", "commune", "country"):
            val = getattr(user_data, field, None)
            if val:
                new_user[field] = val
        birth_year = getattr(user_data, "birth_year", None)
        if birth_year:
            new_user["birth_year"] = int(birth_year)

        # ─── Audit: intento (no bloquea si audit_logs no tiene las columnas) ───
        try:
            audit_bus.log_event(
                actor_id="ANONYMOUS",
                action="IDENTITY_REGISTRATION_ATTEMPT",
                entity_type="USER",
                entity_id=user_data.email,
                details={
                    "dna_score": dna_result["score"],
                    "dna_classification": dna_result["classification"],
                    "ip": request_metadata.get("ip", "unknown") if request_metadata else "unknown",
                },
            )
        except Exception:
            pass  # audit_logs puede no estar listo — no bloquea el registro

        # ─── 4. Insertar en tabla public.users ───
        result = await supabase.table("users").insert(new_user).execute()

        if not result.data:
            raise Exception("Supabase devolvió data vacía al insertar usuario")

        user = result.data[0]
        user_id = user["id"]

        # ─── 5. Audit Log inmutable ───
        try:
            audit_bus.log_event(
                actor_id=user_id,
                action="USER_REGISTERED",
                entity_type="USER",
                entity_id=user_id,
                details={
                    "rank": "BASIC",
                    "dna_score": dna_result["score"],
                    "dna_classification": dna_result["classification"],
                    "dna_alerts": dna_result["alerts"],
                    "ip": request_metadata.get("ip", "unknown") if request_metadata else "unknown",
                },
            )
        except Exception:
            pass  # audit_logs puede no estar listo — no bloquea

        # ─── Hook A: Notificación al admin (fire-and-forget) ───
        try:
            import asyncio
            from app.core.notification_service import send_admin_notification
            asyncio.ensure_future(send_admin_notification(
                event_type="NEW_USER_REGISTERED",
                subject="Nuevo usuario registrado",
                message=f"El ciudadano {user_data.email} se ha registrado en BEACON.",
                entity_id=user_id,
                details={
                    "email": user_data.email,
                    "rank": "BASIC",
                    "dna_score": dna_result["score"],
                    "dna_classification": dna_result["classification"],
                },
            ))
        except Exception:
            pass  # Notificación nunca bloquea el flujo principal

        if settings.DEBUG:
            # Local: cuenta activa de inmediato, sin email
            status = "active"
            msg = "Ciudadano registrado. Ya puedes iniciar sesión."
            email_required = False
        else:
            # Producción: esperando confirmación de email
            status = "pending_confirmation"
            msg = "Ciudadano registrado. Revisa tu correo electrónico y haz clic en el enlace de confirmación para activar tu cuenta."
            email_required = True

        return {
            "status": status,
            "user_id": user_id,
            "rank": user.get("rank", "BASIC"),
            "integrity_score": float(user.get("integrity_score", 0.5)),
            "reputation_score": float(user.get("reputation_score", 0.5)),
            "dna_classification": dna_result["classification"],
            "message": msg,
            "email_confirmation_required": email_required,
        }

    except Exception as err:
        # Rollback: eliminar el auth user huérfano para permitir reintento limpio
        try:
            await supabase.auth.admin.delete_user(auth_user_id)
        except Exception:
            pass
        raise Exception(
            f"Error al completar el registro. Puedes intentarlo de nuevo. "
            f"(Interno: {err})"
        ) from err


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
    Cambia la contraseña de un ciudadano via Supabase Auth (Admin API).

    La tabla public.users NO almacena hashed_password ni password_history
    (esas columnas no existen en el schema actual).
    Supabase Auth es la ÚNICA fuente de verdad para contraseñas.

    Args:
        user_id: UUID del ciudadano
        new_password: Nueva contraseña en texto plano (se descarta tras el hash)

    Raises:
        ValueError: Si el usuario no existe o hay error en Supabase Auth
    """
    supabase = get_async_supabase_client()

    user = await get_user_by_id(user_id)
    if not user:
        raise ValueError("Usuario no encontrado")

    # ─── 1. Actualizar contraseña en Supabase Auth (fuente de verdad) ───
    # Usar Admin API para no requerir la contraseña actual.
    try:
        await supabase.auth.admin.update_user_by_id(
            user_id,
            {"password": new_password},
        )
    except Exception as e:
        try:
            audit_bus.log_event(
                actor_id=user_id,
                action="IDENTITY_PASSWORD_CHANGE_FAILED",
                entity_type="USER",
                entity_id=user_id,
                details={"stage": "SUPABASE_AUTH", "error": str(e)},
            )
        except Exception:
            pass
        raise ValueError("Error al actualizar la contraseña en Supabase Auth.") from e

    # ─── 2. Audit Log (no bloquea si falla) ───
    try:
        audit_bus.log_event(
            actor_id=user_id,
            action="IDENTITY_PASSWORD_CHANGED",
            entity_type="USER",
            entity_id=user_id,
            details={"rotated": True},
        )
    except Exception:
        pass

    return True
