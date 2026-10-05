"""
BEACON PROTOCOL — Tests: endpoints admin de series y borrado de ediciones
==========================================================================
CRUD de series, ids de pregunta resueltos en el servidor, template_version
solo si cambia el contenido real, y 409 al borrar la edición de una serie.
"""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.v1.admin import polls_admin, polls_series_admin
from app.api.v1.admin.require_admin import require_admin_role
from app.core.audit_logger import audit_bus
from app.core.polls_series.series_questions import (
    questions_content_changed,
    resolve_question_ids,
)
from tests.fake_supabase import FakeSupabase, Query, Result

ADMIN = {"user_id": "admin-1", "email": "admin@beacon.test", "role": "admin"}

Q_APRUEBA = {"text": "¿Aprueba?", "type": "multiple_choice", "options": ["Sí", "No"]}
Q_ESCALA = {"text": "Nota 1-7", "type": "scale", "scale_points": 7}


@pytest.fixture
def audit_events(monkeypatch):
    events = []

    async def fake_alog_event(**kwargs):
        events.append(kwargs)

    monkeypatch.setattr(audit_bus, "alog_event", fake_alog_event)
    return events


@pytest.fixture
def env(monkeypatch, audit_events):
    """(client, fake_supabase) con auth admin y Supabase falso inyectados."""
    sb = FakeSupabase()
    for module in (polls_series_admin, polls_admin):
        monkeypatch.setattr(module, "get_async_supabase_client", lambda: sb)
    app = FastAPI()
    app.include_router(polls_series_admin.router)
    app.include_router(polls_admin.router)
    app.dependency_overrides[require_admin_role] = lambda: ADMIN
    return TestClient(app), sb


def _create(client, **overrides):
    body = {"title": "¿Aprueba al Presidente?", "category": "politica", "questions": [Q_APRUEBA, Q_ESCALA], **overrides}
    return client.post("/admin/polls/series", json=body)


# ═══ Helpers de preguntas ═══

class TestQuestionHelpers:
    CURRENT = [{"id": "a", **Q_APRUEBA}, {"id": "b", **Q_ESCALA}]

    def test_ids_por_posicion_ignorando_los_del_cliente(self):
        new = [{"id": "x", **Q_APRUEBA}, {"id": "y", **Q_ESCALA}]
        assert [q["id"] for q in resolve_question_ids(new, self.CURRENT)] == ["a", "b"]

    def test_posicion_nueva_recibe_id_nuevo(self):
        new = [Q_APRUEBA, Q_ESCALA, {"text": "Otra", "type": "multiple_choice", "options": ["1", "2"]}]
        ids = [q["id"] for q in resolve_question_ids(new, self.CURRENT)]
        assert ids[:2] == ["a", "b"] and ids[2] not in ("a", "b") and len(ids[2]) == 32

    def test_cambiar_solo_el_id_no_es_cambio_de_contenido(self):
        assert not questions_content_changed([{"id": "zzz", **Q_APRUEBA}, {"id": "k", **Q_ESCALA}], self.CURRENT)

    def test_cambiar_texto_u_opciones_si_es_cambio(self):
        assert questions_content_changed([{**Q_APRUEBA, "text": "¿Aprueba hoy?"}, Q_ESCALA], self.CURRENT)
        assert questions_content_changed([{**Q_APRUEBA, "options": ["Sí", "No", "NS"]}, Q_ESCALA], self.CURRENT)


# ═══ POST / GET ═══

class TestCreateAndList:
    def test_crea_serie_con_ids_del_servidor_y_audit(self, env, audit_events):
        client, sb = env
        res = _create(client, questions=[{**Q_APRUEBA, "id": "id-del-cliente"}, Q_ESCALA])
        assert res.status_code == 201
        series = res.json()["series"]
        assert series["slug"] == "aprueba-al-presidente"
        assert series["template_version"] == 1 and series["is_active"] is True
        assert series["created_by"] == "admin-1"
        ids = [q["id"] for q in series["questions"]]
        assert "id-del-cliente" not in ids and len(set(ids)) == 2
        assert [e["action"] for e in audit_events] == ["OVERLORD_ACTION_CREATE_POLL_SERIES"]
        assert len(sb.db["poll_series"]) == 1

    def test_slug_duplicado_409(self, env):
        client, _ = env
        assert _create(client).status_code == 201
        res = _create(client)
        assert res.status_code == 409 and "aprueba-al-presidente" in res.json()["detail"]

    def test_carrera_de_slug_lo_decide_la_base_y_da_409_no_500(self, env, monkeypatch):
        client, sb = env
        sb.db["poll_series"].append({"id": "s-0", "slug": "aprueba-al-presidente"})
        original = Query.execute
        state = {"first_select": True}

        async def racing(self):
            if self.op == "select" and self.table == "poll_series" and state["first_select"]:
                state["first_select"] = False
                return Result([])  # el SELECT previo "no ve" la serie que otro acaba de crear
            return await original(self)

        monkeypatch.setattr(Query, "execute", racing)
        res = _create(client)
        assert res.status_code == 409 and len(sb.db["poll_series"]) == 1

    def test_pregunta_de_opcion_multiple_con_una_opcion_400(self, env):
        client, sb = env
        bad = {"text": "¿?", "type": "multiple_choice", "options": ["solo una"]}
        assert _create(client, questions=[bad]).status_code == 400
        assert sb.db["poll_series"] == []

    @pytest.mark.parametrize("lo,hi", [(5, 3), (4, 4)])
    def test_escala_legacy_con_min_mayor_o_igual_que_max_400(self, env, lo, hi):
        client, sb = env
        bad = {"text": "Nota", "type": "scale", "scale_min": lo, "scale_max": hi}
        res = _create(client, questions=[bad])
        assert res.status_code == 400 and "scale_min" in res.json()["detail"]
        assert sb.db["poll_series"] == []

    def test_escala_legacy_con_min_menor_que_max_se_acepta(self, env):
        client, _ = env
        ok = {"text": "Nota", "type": "scale", "scale_min": 2, "scale_max": 5}
        res = _create(client, questions=[ok])
        assert res.status_code == 201
        assert res.json()["series"]["questions"][0]["scale_min"] == 2

    def test_categoria_invalida_cae_a_general(self, env):
        client, _ = env
        assert _create(client, category="inventada").json()["series"]["category"] == "general"

    @pytest.mark.parametrize("title,expected", [("t" * 280, 201), ("t" * 281, 422)])
    def test_limite_de_titulo_280(self, env, title, expected):
        client, _ = env
        assert _create(client, title=title, slug="serie-limite").status_code == expected

    @pytest.mark.parametrize("slug,expected", [("a" * 100, 201), ("a" * 101, 422)])
    def test_limite_de_slug_100(self, env, slug, expected):
        client, _ = env
        assert _create(client, slug=slug).status_code == expected

    def test_la_edicion_con_limites_maximos_cabe_en_polls(self):
        from app.core.polls_series.series_publisher import build_edition_payload

        series = {"id": "s", "slug": "a" * 100, "title": "t" * 280, "questions": [Q_APRUEBA],
                  "template_version": 1}
        payload = build_edition_payload(series, "2026-09", "admin-1")
        assert len(payload["title"]) <= 300 and len(payload["slug"]) <= 120

    def test_lista(self, env):
        client, _ = env
        _create(client)
        res = client.get("/admin/polls/series")
        assert res.status_code == 200 and res.json()["total"] == 1


# ═══ Regla de escala compartida con encuestas normales ═══

class TestLegacyScaleRuleIsShared:
    """La serie reutiliza el validador de polls_admin (no una copia)."""

    def test_series_usa_el_mismo_validador_que_polls_admin(self):
        assert polls_series_admin._validate_legacy_scale is polls_admin._validate_legacy_scale

    @pytest.mark.parametrize("lo,hi", [(5, 3), (4, 4)])
    def test_validador_rechaza_min_mayor_o_igual_que_max(self, lo, hi):
        q = polls_admin.QuestionDef(text="Nota", type="scale", scale_min=lo, scale_max=hi)
        with pytest.raises(HTTPException) as exc:
            polls_admin._validate_legacy_scale(q)
        assert exc.value.status_code == 400

    def test_validador_acepta_min_menor_que_max_y_los_defaults(self):
        polls_admin._validate_legacy_scale(
            polls_admin.QuestionDef(text="Nota", type="scale", scale_min=2, scale_max=5))
        # Sin extremos explícitos rigen los defaults del voto (1..5)
        polls_admin._validate_legacy_scale(polls_admin.QuestionDef(text="Nota", type="scale"))


# ═══ PATCH ═══

class TestUpdate:
    def _series(self, client):
        return _create(client).json()["series"]

    def test_404(self, env):
        client, _ = env
        assert client.patch("/admin/polls/series/no-existe", json={"is_active": False}).status_code == 404

    def test_sin_campos_400(self, env):
        client, _ = env
        s = self._series(client)
        assert client.patch(f"/admin/polls/series/{s['id']}", json={}).status_code == 400

    def test_pausar_no_sube_version_ni_toca_preguntas(self, env, audit_events):
        client, _ = env
        s = self._series(client)
        res = client.patch(f"/admin/polls/series/{s['id']}", json={"is_active": False})
        assert res.status_code == 200
        out = res.json()["series"]
        assert out["is_active"] is False and out["template_version"] == 1
        assert out["questions"] == s["questions"]
        assert audit_events[-1]["action"] == "OVERLORD_ACTION_UPDATE_POLL_SERIES"
        assert audit_events[-1]["details"]["changes"] == ["is_active"]

    def test_mismas_preguntas_con_otros_ids_es_noop(self, env, audit_events):
        client, _ = env
        s = self._series(client)
        before = len(audit_events)
        resent = [{**Q_APRUEBA, "id": "otro-1"}, {**Q_ESCALA, "id": "otro-2"}]
        res = client.patch(f"/admin/polls/series/{s['id']}", json={"questions": resent})
        assert res.status_code == 200
        out = res.json()["series"]
        assert out["template_version"] == 1
        assert [q["id"] for q in out["questions"]] == [q["id"] for q in s["questions"]]
        assert len(audit_events) == before  # no auditó: no cambió nada

    def test_cambio_real_sube_version_y_conserva_ids_por_posicion(self, env):
        client, _ = env
        s = self._series(client)
        old_ids = [q["id"] for q in s["questions"]]
        changed = [{**Q_APRUEBA, "text": "¿Aprueba la gestión?", "id": "ignorado"}, Q_ESCALA,
                   {"text": "Nueva", "type": "multiple_choice", "options": ["a", "b"]}]
        res = client.patch(f"/admin/polls/series/{s['id']}", json={"questions": changed})
        out = res.json()["series"]
        assert out["template_version"] == 2
        ids = [q["id"] for q in out["questions"]]
        assert ids[:2] == old_ids and ids[2] not in old_ids
        assert out["questions"][0]["text"] == "¿Aprueba la gestión?"

    @pytest.mark.parametrize("title,expected", [("t" * 280, 200), ("t" * 281, 422)])
    def test_patch_limite_de_titulo_280(self, env, title, expected):
        client, _ = env
        s = self._series(client)
        assert client.patch(f"/admin/polls/series/{s['id']}", json={"title": title}).status_code == expected

    @pytest.mark.parametrize("lo,hi", [(5, 3), (4, 4)])
    def test_patch_escala_legacy_con_min_mayor_o_igual_que_max_400(self, env, lo, hi):
        client, _ = env
        s = self._series(client)
        bad = [{"text": "Nota", "type": "scale", "scale_min": lo, "scale_max": hi}]
        res = client.patch(f"/admin/polls/series/{s['id']}", json={"questions": bad})
        assert res.status_code == 400 and "scale_min" in res.json()["detail"]

    def test_patch_escala_legacy_con_min_menor_que_max_se_acepta(self, env):
        client, _ = env
        s = self._series(client)
        ok = [{"text": "Nota", "type": "scale", "scale_min": 2, "scale_max": 5}]
        res = client.patch(f"/admin/polls/series/{s['id']}", json={"questions": ok})
        assert res.status_code == 200 and res.json()["series"]["template_version"] == 2

    def test_cambio_de_titulo_no_sube_version(self, env):
        client, _ = env
        s = self._series(client)
        out = client.patch(f"/admin/polls/series/{s['id']}", json={"title": "Nuevo título"}).json()["series"]
        assert out["title"] == "Nuevo título" and out["template_version"] == 1


# ═══ DELETE de ediciones ═══

class TestDeleteEdition:
    def test_edicion_de_serie_no_se_borra_409(self, env, audit_events):
        client, sb = env
        sb.db["polls"].append({"id": "p-ed", "title": "Edición", "series_id": "s-1", "edition": "2026-10"})
        res = client.delete("/admin/polls/p-ed")
        assert res.status_code == 409
        detail = res.json()["detail"]
        assert "2026-10" in detail and "status=closed" in detail and "is_active=false" in detail
        assert len(sb.db["polls"]) == 1
        assert audit_events == []

    def test_encuesta_normal_se_sigue_borrando(self, env, audit_events):
        client, sb = env
        sb.db["polls"].append({"id": "p-1", "title": "Suelta", "series_id": None, "edition": None})
        res = client.delete("/admin/polls/p-1")
        assert res.status_code == 200 and res.json()["deleted_id"] == "p-1"
        assert sb.db["polls"] == []
        assert audit_events[-1]["action"] == "OVERLORD_ACTION_DELETE_POLL"

    def test_inexistente_404(self, env):
        client, _ = env
        assert client.delete("/admin/polls/nada").status_code == 404


# ═══ Autenticación: sin el override de require_admin_role ═══

ADMIN_ENDPOINTS = [
    ("get", "/admin/polls/series", None),
    ("post", "/admin/polls/series", {"title": "x", "questions": [Q_APRUEBA]}),
    ("patch", "/admin/polls/series/s-1", {"is_active": False}),
    ("delete", "/admin/polls/p-1", None),
]


@pytest.fixture
def raw_client(monkeypatch):
    """App SIN overrides de auth, con Supabase falso para que nada salga a la red."""
    sb = FakeSupabase(
        series=[{"id": "s-1", "slug": "s", "questions": [], "template_version": 1}],
        polls=[{"id": "p-1", "title": "t", "series_id": None}],
    )
    for module in (polls_series_admin, polls_admin):
        monkeypatch.setattr(module, "get_async_supabase_client", lambda: sb)
    app = FastAPI()
    app.include_router(polls_series_admin.router)
    app.include_router(polls_admin.router)
    return TestClient(app), sb


class TestAdminAuth:
    @pytest.mark.parametrize("method,path,body", ADMIN_ENDPOINTS)
    def test_sin_token_401(self, raw_client, method, path, body):
        client, sb = raw_client
        res = getattr(client, method)(path, **({"json": body} if body else {}))
        assert res.status_code == 401

    @pytest.mark.parametrize("method,path,body", ADMIN_ENDPOINTS)
    def test_token_invalido_401(self, raw_client, monkeypatch, method, path, body):
        client, _ = raw_client
        calls = []

        class BadAuth:
            async def get_user(self, token):
                calls.append(token)
                raise RuntimeError("jwt inválido")

        class BadClient:
            auth = BadAuth()

        monkeypatch.setattr("app.core.database.get_async_supabase_client", lambda: BadClient())
        res = getattr(client, method)(path, headers={"Authorization": "Bearer malo"},
                                      **({"json": body} if body else {}))
        assert res.status_code == 401
        assert calls == ["malo"]  # el 401 vino de NUESTRO cliente falso, no de una red real

    @pytest.mark.parametrize("method,path,body", ADMIN_ENDPOINTS)
    def test_usuario_sin_rol_admin_403_y_no_toca_datos(self, raw_client, monkeypatch, method, path, body):
        client, sb = raw_client

        class User:
            id = "u-1"
            email = "ciudadano@beacon.test"

        class Resp:
            user = User()

        class Auth:
            async def get_user(self, token):
                return Resp()

        class AuthClient:
            auth = Auth()

        async def fake_get_user_by_id(_):
            return {"id": "u-1", "role": "citizen"}

        monkeypatch.setattr("app.core.database.get_async_supabase_client", lambda: AuthClient())
        monkeypatch.setattr("app.services.auth_service.get_user_by_id", fake_get_user_by_id)
        before = {k: list(v) for k, v in sb.db.items()}
        res = getattr(client, method)(path, headers={"Authorization": "Bearer ok"},
                                      **({"json": body} if body else {}))
        assert res.status_code == 403
        assert res.json()["detail"].startswith("Acceso denegado")  # rechazo por rol, no por otro error
        assert sb.db == before
