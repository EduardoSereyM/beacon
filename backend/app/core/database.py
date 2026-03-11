"""
BEACON PROTOCOL — El Vínculo con Supabase
===========================================
Orquesta el acceso a la base de datos.
Dos niveles de acceso:
  - service_role: Operaciones administrativas (bots forenses, bypass de RLS)
  - anon_key: Acciones restringidas por políticas de seguridad (RLS)

"El dato que entra al búnker, solo sale si es íntegro."
"""

from typing import Optional

from supabase import create_client, Client
from supabase._async.client import AsyncClient
from app.core.config import settings

# ─── Singleton del cliente async ───
# Inicializado una vez en el startup de FastAPI (lifespan en main.py).
# Reutilizado en cada request — evita crear N conexiones por request.
_async_client: Optional[AsyncClient] = None


def get_supabase_client() -> Client:
    """
    Cliente SÍNCRONO con privilegios de administrador (service_role).
    DEPRECADO: usar get_async_supabase_client() en código FastAPI async.
    Mantenido para compatibilidad con audit_logger (sync), scripts CLI y tests.
    NUNCA exponer service_role al frontend.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_async_supabase_client() -> AsyncClient:
    """
    Cliente ASÍNCRONO singleton con privilegios de administrador (service_role).
    USO: Todos los endpoints FastAPI (async def). Evita bloquear el event loop.

    El singleton se inicializa en el startup de la app (lifespan en main.py)
    y se reutiliza en todos los requests. Si se llama antes del startup
    (tests, scripts), crea el cliente lazily.

    NUNCA exponer service_role al frontend.
    """
    global _async_client
    if _async_client is None:
        _async_client = AsyncClient(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _async_client


def init_async_client() -> AsyncClient:
    """
    Inicializa (o reinicializa) el singleton async.
    Debe llamarse desde el lifespan de FastAPI en startup.
    """
    global _async_client
    _async_client = AsyncClient(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _async_client


def get_supabase_anon() -> Client:
    """
    Cliente estándar (sync) para operaciones autenticadas desde el frontend.
    Respeta las políticas de Row Level Security (RLS).
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
