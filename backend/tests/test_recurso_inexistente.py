"""
BEACON PROTOCOL — Tests: un recurso inexistente responde 404, no 500
=====================================================================
Con el cliente real de Supabase (supabase==2.9.1, postgrest 0.17.2), `.single()` LANZA `APIError`
(PGRST116) cuando no hay exactamente una fila. Por eso todo endpoint que use `.single()` debe
capturar esa excepción y responder 404 (o usar `.limit(1)` y tratar `data` vacía como no encontrado).

`FakeSupabase` reproduce ese comportamiento. Estos tests recorren cada endpoint que usa `.single()`
con una base vacía y exigen 404. Sin red ni base de datos.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.admin import events_admin, versus_admin
from app.api.v1.admin.require_admin import require_admin_role
from app.api.v1.endpoints import encuestas, events, polls, versus, votes
from app.api.v1.user.auth import get_current_user
from app.core.decay.reputation_decay import DEFAULT_HALF_LIFE_DAYS, ReputationDecayJob
from tests.fake_supabase import FakeSupabase

MODULOS = (polls, encuestas, events, versus, votes, events_admin, versus_admin)
ID = "00000000-0000-0000-0000-000000000000"

# (nombre, método, ruta, cuerpo JSON)
CASOS = [
    ("GET /polls/by-slug/{slug}", "get", "/polls/by-slug/no-existe", None),
    ("GET /polls/{id}", "get", f"/polls/{ID}", None),
    ("POST /polls/{id}/vote", "post", f"/polls/{ID}/vote", {"option_value": "Sí"}),
    ("GET /polls/{id}/crosstabs", "get", f"/polls/{ID}/crosstabs", None),
    ("GET /encuestas/{id}", "get", f"/encuestas/{ID}", None),
    ("POST /encuestas/{id}/respond", "post", f"/encuestas/{ID}/respond", {"answers": []}),
    ("GET /events/{id}", "get", f"/events/{ID}", None),
    ("POST /events/{id}/vote", "post", f"/events/{ID}/vote", {"entity_id": ID, "score": 4.0}),
    ("GET /versus/{id}", "get", f"/versus/{ID}", None),
    ("POST /versus/{id}/vote", "post", f"/versus/{ID}/vote", {"voted_for": "A"}),
    ("POST /entities/{id}/vote", "post", f"/entities/{ID}/vote", {"scores": {"honestidad": 4.0}}),
    ("POST /admin/events/{id}/participants", "post", f"/admin/events/{ID}/participants", {"entity_id": ID}),
    ("POST /admin/versus", "post", "/admin/versus", {
        "title": "VS", "entity_a_id": ID, "entity_b_id": "11111111-1111-1111-1111-111111111111",
        "starts_at": "2026-10-01T00:00:00Z", "ends_at": "2026-12-31T00:00:00Z",
    }),
]


@pytest.fixture
def client(monkeypatch):
    supabase = FakeSupabase()  # base vacía: ningún recurso existe
    for modulo in MODULOS:
        monkeypatch.setattr(modulo, "get_async_supabase_client", lambda: supabase)
    app = FastAPI()
    for modulo in MODULOS:
        app.include_router(modulo.router)
    app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "rank": "BASIC", "vote_penalty": 1.0}
    app.dependency_overrides[require_admin_role] = lambda: {"user_id": "a1", "id": "a1", "role": "admin"}
    return TestClient(app)


class TestRecursoInexistenteEs404:
    @pytest.mark.parametrize("nombre,metodo,ruta,cuerpo", CASOS, ids=[c[0] for c in CASOS])
    def test_responde_404_y_no_500(self, client, nombre, metodo, ruta, cuerpo):
        res = getattr(client, metodo)(ruta, json=cuerpo) if cuerpo is not None else getattr(client, metodo)(ruta)
        assert res.status_code == 404, f"{nombre}: {res.status_code} {res.text[:200]}"


class TestLecturasDeConfiguracionTienenValorPorDefecto:
    @pytest.mark.asyncio
    async def test_decay_sin_parametro_usa_el_valor_por_defecto(self):
        # `.single()` lanza si DECAY_HALF_LIFE_DAYS no existe: debe caer al valor por defecto, no propagar.
        job = ReputationDecayJob(FakeSupabase())
        assert await job.fetch_half_life_from_config() == DEFAULT_HALF_LIFE_DAYS
