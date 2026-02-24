"""
BEACON PROTOCOL — Configuración Centralizada
=============================================
El corazón administrativo que conecta a los "amigos bits" con sus recursos.
Utiliza Pydantic BaseSettings para cargar credenciales desde .env.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """
    Configuración del Búnker Beacon.
    Todas las variables se cargan desde el archivo .env.
    """

    # ─── Supabase & BBDD (from bbdd_connection.md) ───
    SUPABASE_URL: str
    SUPABASE_KEY: str  # anon key (frontend-safe)
    SUPABASE_SERVICE_KEY: str  # service_role (backend-only, NEVER expose)
    DATABASE_URL: str

    # ─── Performance Layer (El Demonio Redis) ───
    REDIS_URL: str = "redis://localhost:6379/0"

    # ─── Security (The Vault) ───
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ─── Aplicación ───
    APP_NAME: str = "Beacon Protocol"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # ─── CORS (Frontend → Backend) ───
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",  # Next.js dev
        "http://localhost:3001",
    ]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


@lru_cache()
def get_settings() -> Settings:
    """
    Singleton cacheado de la configuración.
    Evita leer el .env en cada petición.
    """
    return Settings()


# Instancia global para importar directamente
settings = get_settings()
