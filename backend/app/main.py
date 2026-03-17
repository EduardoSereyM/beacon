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

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from app.core.config import settings
from app.core.database import init_async_client

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("beacon.core")

# ─── Lifespan (reemplaza @app.on_event, FastAPI ≥ 0.93) ───
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gestiona el ciclo de vida completo de la aplicación.
    startup → yield → shutdown
    """
    # ── STARTUP ──────────────────────────────────────────────────────────
    logger.info("=" * 60)
    logger.info(f"🛡️  {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info("   Motor de Integridad y Meritocracia Digital")
    logger.info("   'Lo que no es íntegro, no existe.'")
    logger.info("=" * 60)

    # Inicializar singleton del cliente async (PR-8: un cliente, no N por request)
    init_async_client()
    logger.info("✅ Supabase AsyncClient inicializado (singleton)")

    # Redis: El Demonio de la Pre-gestión
    try:
        import redis.asyncio as aioredis

        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=3,
        )
        await redis_client.ping()
        app.state.redis = redis_client

        from app.core.security.panic_gate_extreme import panic_gate
        panic_gate.set_redis_client(redis_client)

        logger.info("🔴 Redis conectado → Panic Gate ARMADO (propagación <2ms)")

    except Exception as e:
        app.state.redis = None
        logger.warning(
            f"⚠️  Redis no disponible → Modo degradado (YELLOW fail-safe). "
            f"Detalle interno: {e}"
        )

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────────────────
    logger.info("🛑 Beacon Protocol — Apagando el búnker...")

    redis_client = getattr(app.state, "redis", None)
    if redis_client:
        try:
            await redis_client.close()
            logger.info("🔴 Redis desconectado limpiamente.")
        except Exception as e:
            logger.warning(f"⚠️  Error cerrando Redis: {e}")


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
    lifespan=lifespan,
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
from app.api.v1.user.auth import router as auth_router  # noqa: E402
from app.api.v1.endpoints.realtime import router as realtime_router  # noqa: E402

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

from app.api.v1.endpoints.entities import router as entities_router  # noqa: E402

app.include_router(
    entities_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Entities"],
)

# ─── Votes Router ───
from app.api.v1.endpoints.votes import router as votes_router  # noqa: E402

app.include_router(
    votes_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Votes"],
)

# ─── Dimensions Router (público) ───
from app.api.v1.endpoints.dimensions import router as dimensions_router  # noqa: E402

app.include_router(
    dimensions_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Dimensions"],
)

# ─── Admin Routers (Aislamiento de Responsabilidades) ───
from app.api.v1.admin.entities_admin import router as admin_entities_router        # noqa: E402
from app.api.v1.admin.aum_endpoint import router as admin_aum_router              # noqa: E402
from app.api.v1.admin.stats_endpoint import router as admin_stats_router          # noqa: E402
from app.api.v1.admin.dimensions_admin import router as admin_dimensions_router   # noqa: E402
from app.api.v1.admin.audit_endpoint import router as admin_audit_router          # noqa: E402

app.include_router(
    admin_entities_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Admin — Entities"],
)

app.include_router(
    admin_aum_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Admin — AUM"],
)

app.include_router(
    admin_stats_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Admin — Stats"],
)

app.include_router(
    admin_dimensions_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Admin — Dimensions"],
)

app.include_router(
    admin_audit_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Admin — Audit"],
)

from app.api.v1.admin.decay_endpoint import router as admin_decay_router  # noqa: E402

app.include_router(
    admin_decay_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Admin — Decay"],
)

from app.api.v1.admin.polls_admin import router as admin_polls_router  # noqa: E402
from app.api.v1.endpoints.polls import router as polls_router           # noqa: E402

app.include_router(
    admin_polls_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Admin — Polls"],
)

app.include_router(
    polls_router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Encuestas"],
)
