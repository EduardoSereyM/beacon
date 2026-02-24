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
from app.core.config import settings


def get_supabase_client() -> Client:
    """
    Cliente con privilegios de administrador (service_role) para bypass de RLS.
    USO: Operaciones del backend que requieran acceso total.
    Los bots forenses (.py) usan este cliente para escribir en audit_logs,
    actualizar rangos de usuario y ejecutar purgas de brigadas.
    NUNCA exponer esta llave al frontend.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_supabase_anon() -> Client:
    """
    Cliente estándar para operaciones autenticadas desde el frontend.
    Respeta las políticas de Row Level Security (RLS).
    Aislamiento de Poder: Protege la base de datos de inyecciones
    maliciosas desde el frontend.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
