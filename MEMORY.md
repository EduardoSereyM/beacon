# 🛡️ BEACON PROTOCOL — Guía de Desarrollo Local

> **Mantra:** _"Lo que no es íntegro, no existe."_
> **Estado:** Fase 2 — 90% completado · Producción activa en [www.beaconchile.cl](https://www.beaconchile.cl)

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
| POST | `/user/auth/register` | — | Registro con RUT hash + email |
| POST | `/user/auth/login` | — | Login → JWT (60 min) |
| GET | `/entities` | — | Lista paginada de entidades |
| GET | `/entities/filters` | — | DISTINCT de region y party |
| GET | `/entities/{id}` | — | Detalle de entidad |
| POST | `/entities/{id}/vote` | ✅ JWT | Emitir veredicto Bayesiano |
| GET | `/realtime/pulse` | — | Pulse de actualizaciones |

### Parámetros de `/entities`

```
?category=politico|empresario|periodista|...
&region=RM|...
&party=...
&search=nombre
&limit=9          (default)
&offset=0
```

> ⚠️ **Pendiente:** Sort por `reputation_score DESC`. Actualmente ordena por `updated_at`.

---

## 🔐 Credenciales de Prueba

| Rol | Email | Contraseña | Rango |
|---|---|---|---|
| ADMIN | `overlord2026@beacon.com` | `OverlordPassword2026*` | DIAMOND |
| USER | `ciudadano2026@beacon.com` | `CiudadanoPassword2026*` | BRONZE |
| USER | `beacon@testdesarrollo.cl` | `Password#2026` | BRONZE |

> Si algún usuario da 400 al login → confirmar manualmente en Supabase Dashboard → Auth → Users → "Confirm email".

---

## 🗄️ Arquitectura de Datos (Supabase)

### Tablas principales

```
entities          → Personajes públicos (reputation_score, total_reviews, is_active)
profiles          → Perfil de usuario BEACON (rut_hash, rank, region, commune, age_range)
audit_logs        → Trazabilidad forense inmutable (append-only)
geography_cl      → Regiones y comunas de Chile
```

### Sistema de Rangos

```
ANONYMOUS → BRONZE (registro) → SILVER (verificación RUT SMS) → GOLD → DIAMOND
```

### Fórmula Bayesiana de Reputación

```
score = (m·C + Σ_votos) / (m + n)
  m = 30   → Peso del prior (protege contra brigadas en entidades nuevas)
  C = 3.0  → Media neutral del prior
  n = total de votos recibidos
```

---

## 🗺️ Árbol de Convenciones

```
backend/
  app/
    api/v1/
      endpoints/        → entities.py, votes.py, realtime.py
      user/             → auth.py
      admin/            → entities_admin.py, aum_endpoint.py
    core/
      security/         → dna_scanner.py, panic_gate_extreme.py, stealth_ban.py
      valuation/        → user_asset_calculator.py
    forensics/
      displaced/        → shadow logs de bots
    services/           → auth_service.py, identity_service.py

frontend/
  src/
    app/                → page.tsx (Home SSR), entities/[id]/page.tsx
    components/
      bunker/           → NavbarClient.tsx, AuthModal.tsx (UI élite)
      outskirts/        → UI degradada (Displaced)
      status/           → VerdictButton.tsx, TruthMeter.tsx
    hooks/              → usePermissions.ts (ACM espejo frontend)
```

---

## ✅ Hecho (esta sesión)

- [x] **Home SSR + ISR**: `page.tsx` convertido a Server Component con `revalidate = 60`
- [x] **CORS fix producción**: `CORS_ORIGINS` actualizado en Render Dashboard para `www.beaconchile.cl`
- [x] **Endpoint de votos**: `POST /entities/{id}/vote` con fórmula Bayesiana (m=30, C=3.0)
- [x] **VerdictButton funcional**: estados `idle → loading → voted | error` + feedback visual por rango
- [x] **Estado de sliders levantado**: `onValuesChange` callback → padre recoge valores y llama API
- [x] **Navbar refinado**: separador `|` + texto usuario más grande + borde en badge de rango
- [x] **"Generar Reporte" eliminado**: era stub sin backend
- [x] **Revisión completa del proyecto** (`2026-03-09`): estado de fases, endpoints, componentes, deudas técnicas relevadas y documentadas

---

## 🔲 Pendientes (en orden de prioridad)

### P3 — VS/Versus
- Backend: `GET /api/v1/versus` (lista eventos) + `POST /api/v1/versus/{id}/vote`
- Tabla: `event_votes` (votos de evento — NO afectan `reputation_score` permanente)
- Frontend: `/versus` — UI head-to-head, dos entidades lado a lado

### P4 — Páginas de Sección con Filtros
- `/politicos`, `/empresas`, `/periodistas` — cada una con filtros propios
- Ordenar `/entities` por `reputation_score DESC` (actualmente: `updated_at`)

### P5 — Verificación RUT (BRONZE → SILVER)
- `POST /api/v1/user/auth/verify-identity`
- Frontend: flujo de upgrade de rango en perfil

### Recovery Flow
- "Olvidé mi contraseña" → tokens firmados por email + audit_log

### Anti-Brigada (Rate Limiting en Votos)
- Tabla `entity_reviews`: un voto por usuario por entidad (prevenir doble voto)
- Rate limiting: mínimo 3s entre votos

### Deuda Técnica
- `identity_service.py`: columnas viejas (`commune`, `region` como text) → migrar a `comuna_id` FK
- `create_admin.py` / `create_test_users.py`: referencian `hashed_password` (columna eliminada)
- Sort en `/entities` por `reputation_score DESC`
- `entities.py`: `reputation_score` y `total_reviews` hardcodeados a 0 — no lee desde DB

### P6 — Scraping & Enrichment de Entidades
- `scrapers/` vacío (solo README) → implementar scripts con Playwright
- **Fuentes objetivo**: Cámara de Diputados, Senado, BCN, Wikipedia, LinkedIn, redes sociales
- **Campos a completar**: `photo_path`, `bio`, `official_links`, `district`, `position`, `party`
- Cada dato debe incluir `source_url` + `last_scraped_at` (Directives 2026)
- Ver estrategia detallada en `ROADMAP_LOG.md` → Sección P6

---

## 🔗 Archivos Clave

| Archivo | Función |
|---|---|
| `backend/app/main.py` | Entry point FastAPI + registro de routers |
| `backend/app/core/config.py` | Settings Pydantic (lee .env) |
| `backend/app/api/v1/endpoints/votes.py` | Endpoint Bayesiano de votación |
| `backend/app/api/v1/endpoints/entities.py` | CRUD entidades + filtros |
| `backend/app/api/v1/user/auth.py` | Login / Registro / JWT |
| `backend/app/core/security/dna_scanner.py` | Gatekeeper HUMAN/SUSPICIOUS/DISPLACED |
| `backend/app/core/security/access_control_matrix.py` | ACM con herencia recursiva |
| `frontend/src/app/page.tsx` | Home Server Component (ISR 60s) |
| `frontend/src/app/entities/[id]/page.tsx` | Detalle de entidad + votación |
| `frontend/src/components/bunker/NavbarClient.tsx` | Navbar adaptativo (auth/anon) |
| `frontend/src/components/bunker/AuthModal.tsx` | Login/Registro Dark Premium |
| `frontend/src/components/status/VerdictButton.tsx` | Botón de voto por rango |
| `frontend/src/hooks/usePermissions.ts` | ACM espejo frontend |
| `frontend/vercel.json` | API URL hardcodeada para producción |
| `ROADMAP_LOG.md` | Registro oficial de hitos y pendientes |

---

<sub>
Actualizado: `2026-03-09` · Commits: `223bafd` (Home ISR) · `7e15a4e` (Votes + Navbar) · Revisión completa 2026-03-09
_"Lo que vale, brilla. Lo que no, desaparece."_
</sub>
