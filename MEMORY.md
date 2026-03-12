# 🛡️ BEACON PROTOCOL — Guía de Desarrollo Local

> **Mantra:** _"Lo que no es íntegro, no existe."_
> **Estado:** Fase 2 — ✅ COMPLETADA · Producción activa en [www.beaconchile.cl](https://www.beaconchile.cl)

---

## 🗂️ Stack

| Capa | Tecnología | Entorno Local | Producción |
|---|---|---|---|
| Backend | FastAPI + Python 3.12 | `localhost:8000` | Render (Starter) |
| Base de datos | Supabase (PostgreSQL) | Pooler 6543 (mismo) | Pooler 6543 |
| Auth | Supabase Auth (JWT) | Mismo Supabase | Mismo Supabase |
| Cache | Redis (opcional) | `localhost:6379` | N/A (modo degradado) |
| Frontend | Next.js 15 | `localhost:3000` | Vercel |
| Dominio | — | — | www.beaconchile.cl |

---

## ⚡ Cómo Levantar en Local

### Backend

```bash
cd backend

# (Primera vez) Crear entorno virtual e instalar dependencias
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Arrancar servidor (con hot-reload)
uvicorn app.main:app --reload --port 8000
```

> **Redis:** Es opcional. Si no corre, el Panic Gate opera en modo `YELLOW` (fail-safe). No bloquea el desarrollo.
> Para activarlo: `redis-server` (o Docker: `docker run -p 6379:6379 redis:alpine`)

**Docs interactivas** (solo en DEBUG=True): [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend

```bash
cd frontend

# (Primera vez)
npm install

# Desarrollo (usa .env.local → apunta a localhost:8000)
npm run dev

# Abrir: http://localhost:3000
```

> ⚠️ **El frontend tiene dos modos de API:**
> - **Local:** `frontend/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:8000`
> - **Producción:** `frontend/vercel.json` → `NEXT_PUBLIC_API_URL=https://beacon-f477.onrender.com`
>
> No tocar `vercel.json` para pruebas locales — `.env.local` tiene prioridad automáticamente.

---

## 🔑 Variables de Entorno

### Backend (`backend/.env`)

```env
SUPABASE_URL=https://ejholgyffguoxlflvoqx.supabase.co
SUPABASE_KEY=<anon_key>
SUPABASE_SERVICE_KEY=<service_role_key>          # Solo backend — NUNCA al frontend
DATABASE_URL=postgresql://...pooler...:6543/...  # Transaction Pooler (IPv4)
REDIS_URL=redis://localhost:6379/0               # Opcional en local
JWT_SECRET_KEY=beacon-sovereign-key-2026-...
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
FRONTEND_URL=https://www.beaconchile.cl      # URL del frontend (para email redirect)
RUT_HASH_SALT=beacon-forensic-salt-2026-...      # SHA-256 + salt para RUT
DEBUG=True                                        # Activa /docs y /redoc
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000         # Backend local
NEXT_PUBLIC_SUPABASE_URL=https://ejholgyffguoxlflvoqx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
```

---

## 🛣️ Endpoints API (v1)

**Base URL local:** `http://localhost:8000/api/v1`
**Base URL producción:** `https://beacon-f477.onrender.com/api/v1`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | — | Health check del servidor |
| POST | `/user/auth/register` | — | Registro → envía email de confirmación |
| POST | `/user/auth/confirm-email` | — | Verifica token OTP del email |
| POST | `/user/auth/login` | — | Login → JWT (60 min) |
| GET | `/entities` | — | Lista paginada de entidades |
| GET | `/entities/filters` | — | DISTINCT de region y party |
| GET | `/entities/{id}` | — | Detalle de entidad |
| POST | `/entities/{id}/vote` | ✅ JWT | Veredicto Bayesiano ponderado por rango |
| WS | `/realtime/pulse/{id}` | — | WebSocket tiempo real |
| GET | `/user/auth/me` | ✅ JWT | Perfil del ciudadano |
| PUT | `/user/auth/profile` | ✅ JWT | Datos demográficos |
| GET | `/admin/*` | ✅ Admin | Panel Overlord (entities, stats, aum, audit, decay) |

### Parámetros de `/entities`

```
?category=politico|empresario|periodista|empresa|evento
&region=RM|...
&party=...
&search=nombre
&limit=50          (default, max 200)
&offset=0
```

Sort: `reputation_score DESC` (PR fix ya aplicado).

---

## 🔐 Credenciales de Prueba

| Rol | Email | Contraseña | Rango |
|---|---|---|---|
| ADMIN | `overlord2026@beacon.com` | `OverlordPassword2026*` | DIAMOND |
| USER | `ciudadano2026@beacon.com` | `CiudadanoPassword2026*` | BRONZE |
| USER | `beacon@testdesarrollo.cl` | `Password#2026` | BRONZE |

> Si algún usuario da 400 al login → confirmar manualmente en Supabase Dashboard → Auth → Users → "Confirm email".

> ⚠️ **SMPT rate limit** — Supabase gratuito permite ~3 emails/hora. Para producción configurar Resend SMTP en Supabase → Authentication → Email → SMTP Settings.

---

## 🗄️ Arquitectura de Datos (Supabase)

### Tablas principales

```
entities          → Personajes públicos (reputation_score, total_reviews, last_reviewed_at, is_active)
users             → Ciudadanos (rut_hash, rank, integrity_score, is_shadow_banned)
entity_reviews    → Veredictos emitidos (UNIQUE entity_id+user_id → anti-brigada)
evaluation_dimensions → Dimensiones de evaluación por categoría
audit_logs        → Trazabilidad forense inmutable (append-only)
config_params     → Configuración dinámica (VOTE_WEIGHT_*, DECAY_HALF_LIFE_DAYS)
```

### Sistema de Rangos

```
ANONYMOUS → BRONZE (registro) → SILVER (verificación RUT SMS) → GOLD → DIAMOND
```

### Fórmula Bayesiana de Reputación (con pesos por rango — PR-1 ✅)

```
vote_weighted = vote_avg × VOTE_WEIGHT_{rank}   ← Leído de config_params
score = (m·C + Σ_votos_ponderados) / (m + n)
  m = 30   → Peso del prior (protege contra brigadas en entidades nuevas)
  C = 3.0  → Media neutral del prior
  n = total de votos recibidos
```

### Fórmula de Decay Temporal (PR-12 ✅)

```
new_score = C + (old_score − C) × exp(−ln(2) × elapsed_days / half_life)
  C = 3.0 (prior) · half_life = config_params.DECAY_HALF_LIFE_DAYS (default 180d)
```

Cron recomendado: `0 3 * * * python scripts/run_decay.py`

---

## 🗺️ Árbol de Convenciones

```
backend/
  app/
    api/v1/
      endpoints/        → entities.py, votes.py, realtime.py, dimensions.py
      user/             → auth.py
      admin/            → entities_admin.py, aum_endpoint.py, stats_endpoint.py,
                          audit_endpoint.py, dimensions_admin.py, decay_endpoint.py
    core/
      security/         → dna_scanner.py, panic_gate_extreme.py, stealth_ban.py
      valuation/        → user_asset_calculator.py
      decay/            → reputation_decay.py (PR-12)
    forensics/
      displaced/        → shadow logs de bots
    services/           → auth_service.py, identity_service.py
  migrations/           → 008 al 013 (aplicadas en producción)
  scripts/              → run_decay.py (cron ejecutable)

frontend/
  src/
    app/
      auth/callback/     → page.tsx — Receptor del token de confirmación de email
    app/                → page.tsx (Home SSR), entities/[id]/page.tsx
    components/
      bunker/           → NavbarClient.tsx, AuthModal.tsx (UI élite)
      outskirts/        → UI degradada (Displaced)
      status/           → VerdictButton.tsx, TruthMeter.tsx
    hooks/              → usePermissions.ts (ACM espejo frontend)
```

---

## ✅ Hecho — Historial completo

### Sprint 2026-03-09 (Fase 2 base)
- [x] **Home SSR + ISR**: `page.tsx` Server Component con `revalidate = 60`
- [x] **CORS producción**: `CORS_ORIGINS` en Render Dashboard para `www.beaconchile.cl`
- [x] **Votación Bayesiana básica**: `POST /entities/{id}/vote` (m=30, C=3.0)
- [x] **VerdictButton**: estados `idle → loading → voted | error`
- [x] **Anti-brigada**: `entity_reviews` UNIQUE(entity_id, user_id)
- [x] **reputation_score/total_reviews** reales desde DB en `/entities`
- [x] **Sort `reputation_score DESC`** en listado
- [x] **Confirmación de email**: `sign_up()` real + `/auth/callback` + template HTML
- [x] **Navbar**: badge rango + email + separador + Salir

### Sprint 2026-03-10/11 — Blindaje P0+P1+P2 (commits `7c36282`, `6fead90`, `249bd6f`, `78dc9dd`, `512eb25`)
- [x] **PR-1** `votes.py`: `VOTE_WEIGHT_{rank}` leído de `config_params` — meritocracia real
- [x] **PR-2** `votes.py`: `publish_verdict_pulse` via `background_tasks` — WebSocket activo
- [x] **PR-3** `auth.py`: fix `TypeError` en `update_demographic_profile` callsite
- [x] **PR-4** `audit_logger.py`: `alog_event()` async — 9 call sites actualizados
- [x] **PR-5** `entities.py`: `is_verified`/`rank` hardcoding eliminado
- [x] **PR-6** `aum_endpoint.py`: sin demo data — 503 si Supabase falla
- [x] **PR-7** `stats_endpoint.py`: `COUNT` SQL — cero filas traídas a Python
- [x] **PR-8** `database.py`: `AsyncClient` singleton
- [x] **PR-9** `migrations/012`: columnas reales de `entities` documentadas (aplicada ✅)
- [x] **PR-10** `main.py`: `lifespan` reemplaza `@on_event` deprecado
- [x] **PR-11** `vote_engine.py`: anotado como ROADMAP P3 (no eliminado — 13 tests)
- [x] **PR-12**: Decay job completo (`reputation_decay.py`, `decay_endpoint.py`, `run_decay.py`, `migration 013` aplicada ✅)
- [x] **Lint fix**: `Optional` y `datetime` unused imports eliminados (ruff CI verde)

---

## 🔲 Pendientes (en orden de prioridad)

### P3 — VS/Versus
- Backend: `GET /api/v1/versus` + `POST /api/v1/versus/{id}/vote`
- Tabla: `event_votes` (votos de evento — NO afectan `reputation_score` permanente)
- Frontend: `/versus` — UI head-to-head, dos entidades lado a lado

### P4 — Páginas de Sección con Filtros
- `/politicos`, `/empresas`, `/periodistas` — filtros propios por región/partido

### P5 — Verificación RUT (BRONZE → SILVER)
- `POST /api/v1/user/auth/verify-identity` ya existe — falta el formulario en el perfil del usuario

### Recovery Flow
- "Olvidé mi contraseña" → tokens firmados por email + audit_log (P6)

### P6 — Scraping & Enrichment de Entidades
- `scrapers/` vacío (solo README) → implementar scripts con Playwright
- Fuentes: Cámara, Senado, BCN, Wikipedia
- Campos: `photo_path`, `bio`, `official_links`, `district`, `position`, `party`

### Deuda Técnica pendiente
| ID | Problema | Severidad |
|----|---------|-----------|
| DT-4 | `dimensions_admin.py` DELETE sin audit log ni verificación de existencia | 🔴 ALTA |
| DT-8 | `get_supabase_client()` sync usado en `audit_logger.py` (`.client` property) | 🟡 MEDIA |
| DT-10 | `commune`/`region` como TEXT libre, sin FK a `geography_cl` | 🟡 MEDIA |
| DT-11 | `scripts/create_admin.py` referencia `hashed_password` eliminada | 🟡 MEDIA |
| DT-12 | `vote_engine.py` — planificado P3, 13 tests, anotado como ROADMAP | 🟢 BAJA |
| DT-14/15 | Frontend: `index.ts` vacíos + dual auth `localStorage`/`Zustand` | 🟢 BAJA |

---

## 🔗 Archivos Clave

| Archivo | Función |
|---|---|
| `backend/app/main.py` | Entry point FastAPI + registro de routers |
| `backend/app/core/config.py` | Settings Pydantic (lee .env) · incluye `FRONTEND_URL` |
| `backend/app/main.py` | Entry point + lifespan (singleton init) |
| `backend/app/core/database.py` | AsyncClient singleton (PR-8) |
| `backend/app/core/audit_logger.py` | `alog_event()` async (PR-4) |
| `backend/app/api/v1/endpoints/votes.py` | Votación Bayesiana + peso por rango + WebSocket pulse (PR-1, PR-2) |
| `backend/app/api/v1/endpoints/entities.py` | Listado + filtros + detalle (PR-5) |
| `backend/app/api/v1/user/auth.py` | Login / Registro / Confirm-email / JWT (PR-3) |
| `backend/app/core/decay/reputation_decay.py` | Decay job + fórmula (PR-12) |
| `backend/app/api/v1/admin/decay_endpoint.py` | GET /admin/decay/preview · POST /admin/decay/run |
| `backend/app/core/security/dna_scanner.py` | Gatekeeper HUMAN/SUSPICIOUS/DISPLACED |
| `backend/app/core/security/access_control_matrix.py` | ACM con herencia recursiva |
| `backend/scripts/run_decay.py` | Cron ejecutable para decay diario |
| `backend/migrations/012_*.sql` | Columnas reales de entities (aplicada) |
| `backend/migrations/013_*.sql` | `last_reviewed_at` para decay (aplicada) |
| `frontend/src/app/auth/callback/page.tsx` | Receptor del token de confirmación de email |
| `frontend/src/app/page.tsx` | Home Server Component (ISR 60s) |
| `frontend/src/app/entities/[id]/page.tsx` | Detalle de entidad + votación |
| `frontend/src/components/bunker/NavbarClient.tsx` | Navbar adaptativo (auth/anon) |
| `frontend/src/components/bunker/AuthModal.tsx` | Login/Registro Dark Premium |
| `frontend/src/components/status/VerdictButton.tsx` | Botón de voto por rango |
| `frontend/src/hooks/usePermissions.ts` | ACM espejo frontend |
| `frontend/vercel.json` | API URL hardcodeada para producción |
| `ROADMAP_LOG.md` | Registro oficial de hitos y pendientes |
| `docs/apis.md` | Contratos de todos los endpoints (26+) |
| `docs/esquema_bbdd.md` | Schema completo de la BBDD |

---







<sub>
Actualizado: `2026-03-11` · Commits relevantes: `223bafd` · `7e15a4e` · `2544971` · `7c36282` · `6fead90` · `249bd6f` · `78dc9dd` · `512eb25`
_"Lo que vale, brilla. Lo que no, desaparece."_
</sub>
