"""
BEACON PROTOCOL — Tests: inserts en `polls` sin columnas eliminadas (migración 021)
====================================================================================
La migración 021 borró poll_type, options, scale_min y scale_max de `polls`
(viven en `questions`). PostgREST rechaza cualquier insert que las envíe, así que
los tres caminos que crean encuestas deben omitirlas.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.admin import polls_admin
from app.api.v1.admin.require_admin import require_admin_role
from app.api.v1.endpoints import polls as polls_endpoints
from app.api.v1.user.auth import get_current_user
from app.core import notification_service
from app.core.audit_logger import audit_bus
from tests.fake_supabase import FakeSupabase

DROPPED_COLUMNS = {"poll_type", "options", "scale_min", "scale_max"}
ADMIN = {"user_id": "admin-1", "email": "admin@beacon.test", "role": "admin"}
VERIFIED = {"id": "user-1", "rank": "VERIFIED", "email": "user@beacon.test"}
PIPELINE_KEY = "test-pipeline-key"

Q_OPCIONES = {"text": "¿Aprueba?", "type": "multiple_choice", "options": ["Sí", "No"]}
Q_ESCALA = {"text": "Nota 1-7", "type": "scale", "scale_points": 7}


@pytest.fixture
def env(monkeypatch):
    """(client, fake_supabase) con auth y servicios externos reemplazados."""
    sb = FakeSupabase()
    sb.db["users"] = [{"id": "admin-1", "role": "admin"}]

    async def noop(*_, **__):
        return None

    monkeypatch.setattr(audit_bus, "alog_event", noop)
    monkeypatch.setattr(notification_service, "send_admin_notification", noop)
    monkeypatch.setattr(polls_admin.settings, "PIPELINE_API_KEY", PIPELINE_KEY)
    for module in (polls_admin, polls_endpoints):
        monkeypatch.setattr(module, "get_async_supabase_client", lambda: sb)

    app = FastAPI()
    app.include_router(polls_admin.router)
    app.include_router(polls_endpoints.router)
    app.dependency_overrides[require_admin_role] = lambda: ADMIN
    app.dependency_overrides[get_current_user] = lambda: VERIFIED
    return TestClient(app), sb


def _inserted_poll(sb) -> dict:
    assert len(sb.db["polls"]) == 1
    return sb.db["polls"][0]


def test_admin_create_poll_omite_columnas_eliminadas(env):
    client, sb = env
    res = client.post(
        "/admin/polls",
        json={
            "title": "Encuesta admin",
            "category": "politica",
            "starts_at": "2026-10-01T00:00:00Z",
            "ends_at": "2026-10-31T23:59:59Z",
            "questions": [Q_OPCIONES, Q_ESCALA],
        },
    )
    assert res.status_code == 201
    poll = _inserted_poll(sb)
    assert not DROPPED_COLUMNS & poll.keys()
    assert [q["type"] for q in poll["questions"]] == ["multiple_choice", "scale"]


def test_ingest_pipeline_omite_columnas_eliminadas(env):
    client, sb = env
    res = client.post(
        "/admin/polls/ingest",
        headers={"Authorization": f"Bearer {PIPELINE_KEY}"},
        json={
            "title": "Encuesta pipeline",
            "category": "economia",
            "questions": [
                {"text": "¿Aprueba?", "question_type": "single_choice", "options": ["Sí", "No"]},
                {"text": "Nota 1-5", "question_type": "scale", "scale_points": 5},
            ],
        },
    )
    assert res.status_code == 201
    poll = _inserted_poll(sb)
    assert not DROPPED_COLUMNS & poll.keys()
    assert len(poll["questions"]) == 2


@pytest.mark.parametrize("questions", [[Q_OPCIONES], [Q_ESCALA]], ids=["multiple_choice", "scale"])
def test_usuario_verified_crea_poll_omite_columnas_eliminadas(env, questions):
    client, sb = env
    res = client.post("/polls", json={"title": "Encuesta ciudadana", "questions": questions})
    assert res.status_code == 201
    poll = _inserted_poll(sb)
    assert not DROPPED_COLUMNS & poll.keys()
    assert poll["questions"][0]["type"] == questions[0]["type"]
