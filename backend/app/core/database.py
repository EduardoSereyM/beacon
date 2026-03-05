"""
BEACON PROTOCOL — El Vínculo con Supabase
===========================================
Orquesta el acceso a la base de datos.
Dos niveles de acceso:
  - service_role: Operaciones administrativas (bots forenses, bypass de RLS)
  - anon_key: Acciones restringidas por políticas de seguridad (RLS)

"El dato que entra al búnker, solo sale si es íntegro."
"""

from supabase import create_client, Client
from supabase._async.client import AsyncClient
from app.core.config import settings


def get_supabase_client() -> Client:
    """
    Cliente SÍNCRONO con privilegios de administrador (service_role).
    DEPRECADO: usar get_async_supabase_client() en código FastAPI async.
    Mantenido para compatibilidad con componentes síncronos (audit_logger,
    scripts CLI, tests unitarios sin loop de eventos).
    NUNCA exponer service_role al frontend.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_async_supabase_client() -> AsyncClient:
    """
    Cliente ASÍNCRONO con privilegios de administrador (service_role).
    USO: Todos los endpoints FastAPI (async def). Evita bloquear el event loop.

    El constructor de AsyncClient es síncrono; las operaciones de tabla y auth
    son awaitable. Patrón de uso:

        supabase = get_async_supabase_client()
        result = await supabase.table("users").select("*").execute()
        auth_response = await supabase.auth.get_user(token)

    NUNCA exponer service_role al frontend.
    """
    return AsyncClient(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_supabase_anon() -> Client:
    """
    Cliente estándar (sync) para operaciones autenticadas desde el frontend.
    Respeta las políticas de Row Level Security (RLS).
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
