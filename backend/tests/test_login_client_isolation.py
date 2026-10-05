"""
Hotfix: el login no debe contaminar el cliente service_role compartido.

supabase-py escucha los eventos de auth del cliente en el que se llama
sign_in_with_password y, ante SIGNED_IN, reemplaza su cabecera Authorization
por el token del usuario. Si eso ocurre en el singleton service_role, todas las
consultas posteriores del backend corren con los privilegios de ese ciudadano.

Aquí se usan clientes AsyncClient REALES (con la lógica de eventos de supabase-py)
y solo se simula la respuesta HTTP de GoTrue y las consultas a tablas.
"""

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import FastAPI
from supabase._async.client import AsyncClient

from app.api.v1.user import auth as auth_module

USER_ID = "11111111-1111-1111-1111-111111111111"
USER_TOKEN = "jwt-del-ciudadano"
SERVICE_KEY = "service.role.placeholder"
ANON_KEY = "anon.key.placeholder"
URL = "https://placeholder.supabase.co"

_GOTRUE_SESSION = {
    "access_token": USER_TOKEN,
    "refresh_token": "refresh-del-ciudadano",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
        "id": USER_ID,
        "aud": "authenticated",
        "email": "ciudadano@example.com",
        "app_metadata": {},
        "user_metadata": {},
        "created_at": "2026-01-01T00:00:00Z",
    },
}


def _real_client(key: str) -> AsyncClient:
    client = AsyncClient(URL, key)
    client.realtime.set_auth = AsyncMock()  # sin websocket en tests
    return client


@pytest.fixture
def clients(monkeypatch):
    shared = _real_client(SERVICE_KEY)
    anon = _real_client(ANON_KEY)

    # Solo se simula la red de GoTrue (el POST /token); la lógica de sesión/eventos es la real.
    async def fake_request(self, method, path, **kwargs):
        return kwargs["xform"](_GOTRUE_SESSION)

    monkeypatch.setattr(
        "gotrue._async.gotrue_client.AsyncGoTrueClient._request", fake_request
    )

    # Consultas a tablas del cliente compartido (update de last_login_at).
    table = MagicMock()
    table.update.return_value.eq.return_value.execute = AsyncMock(return_value=MagicMock())
    shared.table = MagicMock(return_value=table)

    monkeypatch.setattr("app.core.database.get_async_supabase_client", lambda: shared)
    monkeypatch.setattr("app.core.database.get_supabase_anon_async", lambda: anon)
    monkeypatch.setattr(
        auth_module.gatekeeper, "scan_request", lambda m: {"classification": "HUMAN"}
    )
    monkeypatch.setattr(
        auth_module,
        "get_user_by_id",
        AsyncMock(return_value={"id": USER_ID, "email": "ciudadano@example.com"}),
    )
    return shared, anon


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_module.router)
    return app


async def _login(app: FastAPI) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        return await c.post("/login", json={"email": "ciudadano@example.com", "password": "x"})


@pytest.mark.asyncio
async def test_login_no_contamina_cliente_service_role(app, clients):
    shared, _anon = clients
    antes = shared.options.headers["Authorization"]
    assert antes == f"Bearer {SERVICE_KEY}"

    resp = await _login(app)

    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"] == USER_TOKEN
    assert shared.options.headers["Authorization"] == antes
    assert USER_TOKEN not in shared.options.headers["Authorization"]


@pytest.mark.asyncio
async def test_login_autentica_con_cliente_anon_y_escribe_con_service_role(app, clients):
    shared, anon = clients

    resp = await _login(app)

    assert resp.status_code == 200, resp.text
    # La sesión del ciudadano vive solo en el cliente anon efímero.
    assert anon.options.headers["Authorization"] == f"Bearer {USER_TOKEN}"
    # El update de last_login_at sigue yendo por el cliente compartido (service_role).
    shared.table.assert_called_once_with("users")


@pytest.mark.asyncio
async def test_confirm_email_no_contamina_cliente_service_role(app, clients):
    shared, anon = clients
    antes = shared.options.headers["Authorization"]

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.post("/confirm-email", json={"token_hash": "hash-ok", "type": "signup"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "confirmed"
    assert shared.options.headers["Authorization"] == antes
    assert USER_TOKEN not in shared.options.headers["Authorization"]
    # La sesión que abre verify_otp vive solo en el cliente anon efímero.
    assert anon.options.headers["Authorization"] == f"Bearer {USER_TOKEN}"
