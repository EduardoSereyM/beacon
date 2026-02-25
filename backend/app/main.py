"""
BEACON PROTOCOL — Punto de Entrada
====================================
Motor de Integridad y Meritocracia Digital.
"Lo que no es íntegro, no existe."

Incluye:
- CORS Middleware para comunicación con el Frontend de alta fidelidad
- Routers segmentados: public, user, events, admin
- Health Check para monitoreo de infraestructura
- Manejo global de excepciones (nunca revelar info técnica sensible)
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from app.core.config import settings

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("beacon.core")

# ─── Inicialización de la App ───
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Beacon Protocol — Motor de Integridad y Meritocracia Digital. "
        "Infraestructura de confianza humana verificada."
    ),
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)


# ─── CORS Middleware ───
# Permite comunicación con el Frontend Next.js (Dark Premium)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Manejo Global de Excepciones ───
# El Búnker NUNCA revela información técnica sensible al exterior
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Intercepta cualquier excepción no manejada.
    Registra el detalle interno pero devuelve un mensaje genérico.
    """
    logger.error(
        f"Error no manejado en {request.method} {request.url.path}: {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "Error interno del servidor. El incidente ha sido registrado.",
            "code": "INTERNAL_SERVER_ERROR",
        },
    )


# ─── Health Check ───
@app.get("/health", tags=["Infrastructure"])
async def health_check():
    """
    Endpoint de monitoreo de infraestructura.
    Verifica que el corazón del Búnker está latiendo.
    """
    return {
        "status": "ok",
        "service": "beacon-protocol-api",
        "version": settings.APP_VERSION,
    }


# ─── Registro de Routers ───
from app.api.v1.user.auth import router as auth_router
from app.api.v1.endpoints.realtime import router as realtime_router

app.include_router(
    auth_router,
    prefix=f"{settings.API_V1_PREFIX}/user/auth",
    tags=["Auth & Identity"],
)

app.include_router(
    realtime_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Real-Time Pulse"],
)

# Routers pendientes (se activarán en fases posteriores):
# from app.api.v1.public import router as public_router
# from app.api.v1.events import router as events_router
# from app.api.v1.admin import router as admin_router
#
# app.include_router(public_router, prefix=f"{settings.API_V1_PREFIX}/public", tags=["Public"])
# app.include_router(events_router, prefix=f"{settings.API_V1_PREFIX}/events", tags=["Events"])
# app.include_router(admin_router, prefix=f"{settings.API_V1_PREFIX}/admin", tags=["Admin"])


@app.on_event("startup")
async def startup_event():
    """
    Inicialización al arrancar el servidor.
    1. Conectar a Redis (El Demonio de la Pre-gestión)
    2. Inyectar Redis en el Panic Gate (propagación instantánea)
    3. Verificar conexión con ping
    """
    logger.info("=" * 60)
    logger.info(f"🛡️  {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info("   Motor de Integridad y Meritocracia Digital")
    logger.info("   'Lo que no es íntegro, no existe.'")
    logger.info("=" * 60)

    # ─── Redis: El Demonio de la Pre-gestión ───
    try:
        import redis.asyncio as aioredis

        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=3,
        )
        # Verificar conexión
        await redis_client.ping()

        # Guardar referencia global
        app.state.redis = redis_client

        # Inyectar en Panic Gate (propagación instantánea)
        from app.core.security.panic_gate_extreme import panic_gate
        panic_gate.set_redis_client(redis_client)

        logger.info("🔴 Redis conectado → Panic Gate ARMADO (propagación <2ms)")

    except Exception as e:
        # Modo degradado: sin Redis, Panic Gate opera en YELLOW (fail-safe)
        app.state.redis = None
        logger.warning(
            f"⚠️  Redis no disponible → Modo degradado (YELLOW fail-safe). "
            f"Detalle interno: {e}"
        )


@app.on_event("shutdown")
async def shutdown_event():
    """
    Limpieza al detener el servidor.
    Cierra conexiones a Redis de forma limpia.
    """
    logger.info("🛑 Beacon Protocol — Apagando el búnker...")

    # ─── Cerrar Redis ───
    redis_client = getattr(app.state, "redis", None)
    if redis_client:
        try:
            await redis_client.close()
            logger.info("🔴 Redis desconectado limpiamente.")
        except Exception as e:
            logger.warning(f"⚠️  Error cerrando Redis: {e}")

