"""
BEACON PROTOCOL — Configuración de Tests (conftest.py)
=======================================================
Establece las variables de entorno mínimas ANTES de que pytest
importe cualquier módulo de la aplicación.

Esto permite ejecutar tests unitarios localmente sin un .env real,
de forma idéntica a como lo hace el CI (GitHub Actions).

Las variables son PLACEHOLDERS: nunca se conectan a servicios reales.
Los tests unitarios usan mocks; los tests de integración se marcan
con @pytest.mark.integration y se saltan en CI sin servicios reales.

"El test que necesita producción para correr, no es un test unitario."
"""

import os


def pytest_configure(config):
    """
    Hook de pytest que se ejecuta ANTES de importar cualquier módulo.
    Establece las variables de entorno mínimas para Settings().

    os.environ.setdefault → no sobreescribe variables reales si ya existen
    (respeta .env local o variables de CI inyectadas por GitHub Actions).
    """
    os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
    os.environ.setdefault("SUPABASE_KEY", "placeholder-anon-key")
    os.environ.setdefault("SUPABASE_SERVICE_KEY", "placeholder-service-key")
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql://placeholder:placeholder@localhost/placeholder",
    )
    os.environ.setdefault(
        "JWT_SECRET_KEY",
        "ci-placeholder-secret-key-minimum-32-chars-ok",
    )
    os.environ.setdefault("RUT_HASH_SALT", "ci-placeholder-salt-16c")
