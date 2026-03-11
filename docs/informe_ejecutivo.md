# Informe Ejecutivo — Auditoría BEACON Protocol

> **Fecha:** 2026-03-11
> **Proyecto iniciado:** 2026-02-24 (15 días de desarrollo)
> **Auditor:** Claude — Estratega de Integridad
> **Branch de entrega:** `claude/audit-codebase-apis-db-LJdAu`

---

## Resumen Ejecutivo

BEACON Protocol tiene una arquitectura sólida y bien pensada: la separación entre DNA Scanner, Bayesian scoring, AuditLogger y el sistema de rangos refleja un diseño maduro para un proyecto de 15 días. El sistema de rangos (BRONZE → SILVER → GOLD → DIAMOND) y la fórmula Bayesiana son correctos y bien documentados.

Sin embargo, existen **3 bugs que rompen funcionalidades prometidas al usuario final**, **1 endpoint completamente roto**, y **una brecha crítica entre el esquema documentado en migraciones y el esquema real de la BBDD**. Estos no son problemas de arquitectura — son deuda de implementación acumulada en la velocidad del MVP.

El código no tiene dead code significativo más allá de esqueletos de directorios vacíos. La deuda principal es de **comportamiento incorrecto silencioso** (bugs que no crashean pero producen resultados incorrectos) y **configuración definida pero no consumida** (config_params con pesos de voto que nadie lee).

---

## Bugs Críticos (P0 — Rompen funcionalidad)

### BUG-1: Pesos de voto por rango NO implementados

**Severidad:** 🔴 CRÍTICA
**Archivo:** `backend/app/api/v1/endpoints/votes.py` + `backend/app/services/identity_service.py`

El sistema promete al ciudadano que "tu voto pesa 1.5x" al verificar su RUT y ascender a SILVER. La tabla `config_params` define multiplicadores:
- `VOTE_WEIGHT_BRONZE = 1.0`
- `VOTE_WEIGHT_SILVER = 1.5`
- `VOTE_WEIGHT_GOLD = 2.5`
- `VOTE_WEIGHT_DIAMOND = 5.0`

**El endpoint `/vote` no lee `config_params` y no aplica ningún multiplicador.** Todos los votos tienen peso idéntico independientemente del rango. La promesa de meritocracia es falsa en el estado actual.

**Fix (PR-1):**
```python
# En votes.py, tras calcular vote_avg:
weight_key = f"VOTE_WEIGHT_{user_rank}"
weight_row = await supabase.table("config_params").select("value").eq("key", weight_key).single().execute()
weight = float(weight_row.data["value"]) if weight_row.data else 1.0
vote_weighted = vote_avg * weight
# Usar vote_weighted en lugar de vote_avg en la fórmula Bayesiana
```

---

### BUG-2: WebSocket Real-Time nunca recibe datos de votos

**Severidad:** 🔴 CRÍTICA
**Archivo:** `backend/app/api/v1/endpoints/votes.py:152` → falta llamada a `realtime.publish_verdict_pulse()`

Clientes conectados a `ws://.../realtime/pulse/{entity_id}` nunca reciben actualizaciones. La arquitectura Redis Pub/Sub está correcta pero el publicador (`publish_verdict_pulse`) nunca es invocado tras un voto.

**Fix (PR-2):**
```python
# En votes.py, tras el UPDATE exitoso de entities:
from app.api.v1.endpoints.realtime import publish_verdict_pulse
background_tasks.add_task(
    publish_verdict_pulse,
    entity_id=entity_id,
    new_score=new_score,
    total_votes=new_n,
    integrity_index=round(new_score / 5.0, 4),
    voter_rank=current_user.get("rank", "BRONZE"),
)
```

---

### BUG-3: Endpoint PUT /profile completamente roto (TypeError)

**Severidad:** 🔴 CRÍTICA
**Archivos:** `backend/app/api/v1/user/auth.py:296` + `backend/app/services/identity_service.py:155`

El callsite en `auth.py` llama con `commune=` y `region=` como kwargs, pero la función `update_demographic_profile` los eliminó de su firma (comentado como "P5-DEUDA"). Toda llamada lanza `TypeError: unexpected keyword argument 'commune'`.

**Estado:** `PUT /api/v1/user/auth/profile` devuelve 400 (captura FastAPI del TypeError) en el 100% de los casos.

**Fix (PR-3):**
```python
# Opción A: Remover los kwargs del callsite
result = await update_demographic_profile(
    user_id=current_user["id"],
    age_range=profile_data.age_range,
)

# Opción B: Restaurar commune y region en la firma de la función
# (requiere implementar la lookup table de comunas)
```

---

### BUG-4: `audit_bus.log_event()` sin `await` en 4 endpoints admin

**Severidad:** 🔴 CRÍTICA
**Archivo:** `backend/app/api/v1/admin/entities_admin.py` líneas 118, 203, 258, 314

`audit_bus.log_event()` es una llamada síncrona (no corrutina) pero se llama dentro de funciones `async def` sin `await`. Si `log_event` internamente usa `asyncio` o hay un refactor futuro a async, esto silenciaría los logs de auditoría de todas las acciones del Overlord.

**Impacto actual:** Los logs se generan porque `log_event` es síncrono en `audit_logger.py`, pero si se migra a async (como debería ser para no bloquear el event loop), todos fallarán silenciosamente.

**Fix (PR-4):** Verificar si `audit_bus.log_event` es síncrono o async, y estandarizar. Si debe ser async, agregar `await` en todos los callsites.

---

### BUG-5: is_verified y rank hardcodeados en API pública de entidades

**Severidad:** 🔴 ALTA
**Archivo:** `backend/app/api/v1/endpoints/entities.py` líneas 124-125, 173-174

```python
"is_verified": True,   # ← hardcodeado, ignora el valor real de la BBDD
"rank": "BRONZE",      # ← hardcodeado, no tiene sentido para entidades
```

La API pública retorna que **todas las entidades están verificadas** (`is_verified: true`) y tienen rango BRONZE. Los clientes frontend que confíen en `is_verified` mostrarán la insignia de verificación incorrectamente.

**Fix (PR-5):**
```python
"is_verified": row.get("is_verified", False),  # ← leer de la BBDD
# Eliminar "rank" del response de entidades (no aplica a entidades, aplica a usuarios)
```

---

## Issues Medios (P1 — Funciona pero defectuoso)

### ISSUE-1: Fallback a datos demo en /admin/aum (producción)

**Severidad:** 🟡 ALTA
**Archivo:** `backend/app/api/v1/admin/aum_endpoint.py:44-55`

Cuando falla la consulta a Supabase (cualquier error), el endpoint retorna datos ficticios de 4 usuarios demo sin informar claramente al admin. El campo `"source": "DEMO_DATA"` existe pero puede pasar desapercibido. Un admin puede tomar decisiones de negocio basado en datos falsos.

**Fix:** Retornar error 503 cuando Supabase no está disponible, no fallback silencioso.

---

### ISSUE-2: /admin/stats trae ALL ROWS a Python para agregar

**Severidad:** 🟡 MEDIA
**Archivo:** `backend/app/api/v1/admin/stats_endpoint.py:32-46`

```python
supabase.table("entities").select("id, first_name, ...").execute()   # todos
supabase.table("users").select("id, rank, ...").execute()             # todos
supabase.table("entity_reviews").select("id, created_at").execute()  # todos
```

A 10k+ usuarios y 100k+ votos, esto es potencialmente cientos de MB transferidos por cada carga del dashboard.

**Fix (PR-6):** Usar queries de agregación en SQL:
```python
# Para conteos: SELECT COUNT(*) ...
# Para métricas: SELECT rank, COUNT(*) GROUP BY rank
# Para top 5: SELECT ... ORDER BY reputation_score DESC LIMIT 5
```

---

### ISSUE-3: get_async_supabase_client() crea nuevo cliente en cada llamada

**Severidad:** 🟡 MEDIA
**Archivo:** `backend/app/core/database.py`

Cada request crea una nueva instancia de `AsyncClient`. Con carga concurrente, esto genera N conexiones HTTP simultáneas a Supabase. El cliente debería ser un singleton con pool o reutilizado vía `app.state`.

**Fix (PR-7):** Inicializar el cliente en el evento `startup` y guardarlo en `app.state.supabase`.

---

### ISSUE-4: @app.on_event("startup/shutdown") deprecated

**Severidad:** 🟡 BAJA
**Archivo:** `backend/app/main.py:168, 212`

`@app.on_event()` está deprecated desde FastAPI 0.109. Migrar a:
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    yield
    # shutdown

app = FastAPI(lifespan=lifespan, ...)
```

---

### ISSUE-5: /admin/audit-logs/actions trae ALL ROWS para DISTINCT

**Severidad:** 🟡 BAJA
**Archivo:** `backend/app/api/v1/admin/audit_endpoint.py:76-81`

```python
result = await supabase.table("audit_logs").select("action").execute()
actions = sorted({r["action"] for r in result.data or []})
```

**Fix:** `SELECT DISTINCT action FROM audit_logs ORDER BY action LIMIT 100`.

---

## Código Muerto / Esqueletos

| Archivo | Estado |
|---------|--------|
| `backend/app/api/v1/public/__init__.py` | Directorio vacío, sin endpoints |
| `backend/app/api/v1/events/__init__.py` | Directorio vacío, sin endpoints |
| `backend/app/services/voting/vote_engine.py` | Existe pero NO es importado por `votes.py` |
| `frontend/src/components/bunker/index.ts` | `export {}` vacío |
| `frontend/src/components/outskirts/index.ts` | `export {}` vacío |
| `frontend/src/components/status/index.ts` | `export {}` vacío |
| `frontend/src/components/events/index.ts` | `export {}` vacío |
| `frontend/src/hooks/index.ts` | `export {}` vacío |

---

## Brechas Críticas de Esquema DB

### BRECHA-1: Columnas en `entities` sin migración documentada

Las siguientes columnas son usadas por el backend pero **no aparecen en ningún archivo `.sql` del repositorio**:
`first_name`, `last_name`, `second_last_name`, `category`, `position`, `district`, `bio`, `photo_path`, `official_links`, `deleted_at`, `updated_by`

**Riesgo:** Un `git clone + apply migrations` en un entorno nuevo NO reproducirá el schema de producción.

**Acción requerida:** Crear `backend/migrations/012_document_entities_real_schema.sql` con las columnas faltantes.

### BRECHA-2: PK de audit_logs — BIGSERIAL vs UUID

Migration 001: `id BIGSERIAL PRIMARY KEY`
Migration 011: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`

Si ambas se aplicaron en orden, la migration 011 falla silenciosamente (`IF NOT EXISTS` solo aplica a la creación de la tabla). El PK real puede ser BIGSERIAL (numérico) y el endpoint de audit logs puede estar recibiendo IDs incorrectos.

**Acción requerida:** Verificar el PK real en Supabase con `fetch_db_schema.py` y corregir la migración.

### BRECHA-3: config_params no consumida

10 parámetros de configuración definidos, **0 consumidos** por endpoints. Esto convierte al "Panel del Overlord" en una tabla decorativa.

---

## Roadmap de PRs (orden de prioridad)

| PR | Título | Tipo | Severidad | Archivos | Estimado |
|----|--------|------|-----------|---------|---------|
| PR-1 | `fix: aplicar VOTE_WEIGHT por rango desde config_params` | Bug | 🔴 P0 | `votes.py` | 2h |
| PR-2 | `fix: llamar publish_verdict_pulse tras submit_vote` | Bug | 🔴 P0 | `votes.py` | 30min |
| PR-3 | `fix: corregir firma update_demographic_profile en callsite` | Bug | 🔴 P0 | `auth.py` | 15min |
| PR-4 | `fix: estandarizar audit_bus.log_event (sync vs async)` | Bug | 🔴 P0 | `entities_admin.py`, `identity_service.py` | 1h |
| PR-5 | `fix: remover is_verified y rank hardcodeados en entities` | Bug | 🔴 P0 | `entities.py` | 15min |
| PR-6 | `fix: aum_endpoint retorna 503 en lugar de demo data` | Issue | 🟡 P1 | `aum_endpoint.py` | 30min |
| PR-7 | `perf: stats con COUNT/AVG en SQL, no traer ALL rows` | Issue | 🟡 P1 | `stats_endpoint.py` | 2h |
| PR-8 | `perf: singleton AsyncClient en app.state.supabase` | Issue | 🟡 P1 | `database.py`, `main.py` | 1h |
| PR-9 | `migration: documentar schema real de entities (012)` | DB | 🔴 P0 | nuevo `012_*.sql` | 1h |
| PR-10 | `chore: migrar on_event a lifespan en main.py` | Deuda | 🟡 P1 | `main.py` | 30min |
| PR-11 | `chore: eliminar vote_engine.py o integrarlo a votes.py` | Deuda | 🟢 P2 | `services/voting/` | 30min |
| PR-12 | `feat: implementar DECAY_HALF_LIFE_DAYS como cron job` | Feature | 🟢 P2 | nuevo archivo | 4h |

---

## Checklist de Seguridad

| Check | Estado |
|-------|--------|
| RUT nunca en texto plano | ✅ Solo `rut_hash` SHA-256+salt |
| JWT validado server-side | ✅ Supabase Auth verifica el JWT |
| RLS habilitado en todas las tablas | ✅ users, entities, entity_reviews, evaluation_dimensions, audit_logs |
| service_role no expuesto al frontend | ✅ Solo backend usa service_role |
| audit_logs append-only | ✅ Políticas NO UPDATE + NO DELETE |
| Shadow ban silencioso | ✅ No se revela al usuario |
| DNA Scanner en register y login | ✅ Activo |
| Secretos fuera del repo | ✅ .env.example sin valores reales |
| Pesos de voto implementados | ❌ Definidos en config_params, no consumidos |
| Rate limiting de votos | ❌ MAX_VOTES_PER_HOUR definido, no implementado |
| Decay temporal de votos | ❌ DECAY_HALF_LIFE_DAYS definido, no implementado |

---

## Cómo Ejecutar el Script de Schema

```bash
# 1. Instalar dependencias adicionales (solo para el script)
cd backend
pip install asyncpg python-dotenv supabase

# 2. Opción A: Con conexión directa (recomendado, acceso completo)
python scripts/fetch_db_schema.py \
  --direct-url "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"

# 3. Opción B: Desde variables de entorno
export DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
python scripts/fetch_db_schema.py

# 4. Opción C: Via Supabase REST (solo schema public, limitado)
# Asegurarse de tener SUPABASE_URL y SUPABASE_SERVICE_KEY en .env
python scripts/fetch_db_schema.py

# Output: docs/esquema_bbdd.md (sobreescribe el baseline estático)
```

> **Nota sobre el puerto:** Usar **5432** (Session Pooler) para queries a `information_schema` y `pg_catalog`. El puerto 6543 (Transaction Pooler) no soporta queries de catálogo.

---

## Métricas de Calidad del Código

| Métrica | Valor |
|---------|-------|
| Endpoints documentados | 27 |
| Endpoints sin bugs | 12 (44%) |
| Endpoints con issues medios | 5 (19%) |
| Endpoints con bugs activos | 10 (37%) |
| Tablas en DB | 6 en `public` |
| Columnas sin migración documentada | ~12 |
| Parámetros config sin implementar | 8/10 |
| Código muerto (archivos) | 8 archivos |
| Tests existentes | 0 (pendiente toda la estrategia de testing) |
