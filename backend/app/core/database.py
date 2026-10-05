"""
BEACON PROTOCOL — El Vínculo con Supabase
===========================================
Orquesta el acceso a la base de datos.
Dos niveles de acceso:
  - service_role: Operaciones administrativas (bots forenses, bypass de RLS)
  - anon_key: Acciones restringidas por políticas de seguridad (RLS)

"El dato que entra al búnker, solo sale si es íntegro."
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from gotrue import AsyncMemoryStorage
from supabase import create_client, Client
from supabase._async.client import AsyncClient
from supabase.lib.client_options import AsyncClientOptions
from app.core.config import settings

logger = logging.getLogger(__name__)

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


def get_supabase_anon_async() -> AsyncClient:
    """
    Cliente ASÍNCRONO con anon key (respeta RLS), NUEVO en cada llamada y efímero.
    Usar exclusivamente para auth flows (sign_up, sign_in, verify_otp) donde NO se
    requiere service_role. Evita contaminar la sesión del cliente service_role singleton.

    Sin auto-refresh ni persistencia de sesión: el token del ciudadano solo se
    devuelve en la respuesta, el backend no lo conserva ni lo renueva (sin Timer de
    refresco ni sesión en el storage). Usar con `anon_auth_client()` para cerrarlo.
    """
    options = AsyncClientOptions(
        auto_refresh_token=False,
        persist_session=False,
        storage=AsyncMemoryStorage(),
    )
    return AsyncClient(settings.SUPABASE_URL, settings.SUPABASE_KEY, options=options)


@asynccontextmanager
async def anon_auth_client() -> AsyncIterator[AsyncClient]:
    """
    Entrega un cliente anon efímero (ver get_supabase_anon_async) y lo cierra siempre.
    Cierra el cliente HTTP de GoTrue; NO llama a sign_out (revocaría el token que
    se devuelve al ciudadano).
    """
    client = get_supabase_anon_async()
    try:
        yield client
    finally:
        try:
            await client.auth.close()
        except Exception:
            logger.warning("No se pudo cerrar el cliente anon efímero", exc_info=True)
