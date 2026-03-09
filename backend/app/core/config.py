"""
BEACON PROTOCOL — Configuración Centralizada
=============================================
El corazón administrativo que conecta a los "amigos bits" con sus recursos.
Utiliza Pydantic BaseSettings para cargar credenciales desde .env.
"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
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
    JWT_SECRET_KEY: str  # REQUERIDO — mínimo 32 caracteres
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ─── Forensic Identity (Salt para hashing de RUT) ───
    # REQUERIDO — sin default. El backend NO arranca si no está definida.
    # Mínimo 16 caracteres. Cambia esta salt y todos los rut_hash quedan huérfanos.
    RUT_HASH_SALT: str

    # ─── Aplicación ───
    APP_NAME: str = "Beacon Protocol"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    FRONTEND_URL: str = "http://localhost:3000"  # URL del frontend (Next.js)

    # ─── CORS (Frontend → Backend) ───
    # En producción setear como JSON: CORS_ORIGINS=["https://app.vercel.app","http://localhost:3000"]
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",  # Next.js dev
        "http://localhost:3001",
    ]

    # ─── Validadores de Fortaleza (Pydantic v2) ───

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def jwt_key_must_be_strong(cls, v: str) -> str:
        """
        Garantiza que la clave JWT tenga al menos 32 caracteres.
        Una clave corta es criptográficamente débil y expone todos los tokens.
        """
        if len(v) < 32:
            raise ValueError(
                "JWT_SECRET_KEY debe tener al menos 32 caracteres. "
                f"Actual: {len(v)} caracteres. "
                "Genera una clave segura con: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v

    @field_validator("RUT_HASH_SALT")
    @classmethod
    def rut_salt_must_be_strong(cls, v: str) -> str:
        """
        Garantiza que la salt del RUT tenga al menos 16 caracteres.
        ADVERTENCIA: cambiar esta salt en producción invalida todos los rut_hash
        existentes — los usuarios necesitarían re-verificar su identidad.
        """
        if len(v) < 16:
            raise ValueError(
                "RUT_HASH_SALT debe tener al menos 16 caracteres. "
                f"Actual: {len(v)} caracteres. "
                "Genera una salt segura con: python -c \"import secrets; print(secrets.token_hex(16))\""
            )
        return v

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
