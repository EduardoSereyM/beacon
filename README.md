# 🗳️ BEACON — Opinión Ciudadana Verificada

> **La primera plataforma de opinión ciudadana abierta y verificada de Chile**
> *"Lo que no es íntegro, no existe."*

Beacon es la plataforma donde los chilenos votan sobre políticos, empresas y personajes públicos sin intermediarios. Sin panelistas seleccionados, sin agenda oculta. Cualquiera puede opinar, los votos verificados cuentan en los informes.

---

## ⚡ Stack Tecnológico

| Capa | Tecnología | Función |
|---|---|---|
| **Backend** | Python 3.12 + FastAPI 0.109 | Motor de integridad async |
| **Frontend** | Next.js 16 + Tailwind CSS | Interfaz Dark Premium |
| **Base de Datos** | PostgreSQL (Supabase) | Persistencia inmutable |
| **Caché/Tiempo Real** | Redis 5.0 async | Latencia <2ms en votaciones |
| **Auth** | JWT + Supabase Auth | Soberanía de identidad |
| **Seguridad** | SHA-256, bcrypt, RLS | Defensa en profundidad |

---

## 🧬 DNA Scanner — El Portero Forense

Cada petición que entra a Beacon pasa por un análisis de **ADN digital** antes de tocar la base de datos:

```
Petición HTTP → DNA Scanner → Clasificación → Acción
                    │
                    ├── HUMAN (score > 70)      → Acceso completo
                    ├── SUSPICIOUS (30-70)       → CAPTCHA + vigilancia
                    └── DISPLACED (score ≤ 30)   → Shadow Mode silencioso
```

**Tests forenses implementados:**
- ⏱️ **Velocidad Inhumana**: Submit en <2 segundos = bot
- 🤖 **User-Agent Analysis**: Selenium, Puppeteer, python-requests
- 🖥️ **WebDriver Flag**: `navigator.webdriver = true`
- 👻 **UA Genérico/Vacío**: Solicitudes sin identificación

> *"No le decimos al bot que lo detectamos. Le dejamos creer que sus votos cuentan."*

---

## 🔐 Sistema de Verificación — Dos Estados

```
CIUDADANO SIN VERIFICAR (BASIC)        CIUDADANO VERIFICADO (VERIFIED)
├─ Registrado con email + contraseña   ├─ RUT validado (SHA-256 + salt)
├─ Puede votar y ver resultados        ├─ 5 campos demográficos completos
├─ Peso de voto: 0.5x                  ├─ Peso de voto: 1.0x
└─ Voto aparece en conteo público      └─ Voto cuenta en informes oficiales
```

**Flujo de verificación:**
1. 📧 **Registro** → Te creas una cuenta con email y contraseña (estado BASIC)
2. 🗳️ **Votas** → Tus votos aparecen en el conteo público pero con peso 0.5x
3. 🪪 **Verificas tu RUT** → El sistema valida tu identidad (Módulo 11 + SHA-256)
4. ✅ **Datos demográficos completos** → Tu estado cambia a VERIFIED, peso de voto 1.0x

**Principio:** Un voto verificado es un voto real. Los informes solo usan votos verificados.

---

## 🗂️ Estructura del Proyecto

```
BEACON/
├── backend/                          # El Cerebro (FastAPI + Python 3.12)
│   ├── app/
│   │   ├── api/v1/                   # Capa de Entrada (Endpoints)
│   │   │   ├── public/               # Búsqueda, Sugerencias
│   │   │   ├── user/                 # Perfil, RUT, Auth, Votación
│   │   │   │   └── auth.py           # 5 endpoints: register, login, verify, me, profile
│   │   │   ├── events/               # Votos a participantes (Efecto Kahoot)
│   │   │   └── admin/                # Panel Overlord
│   │   │
│   │   ├── core/                     # La Constitución del Búnker
│   │   │   ├── config.py             # BaseSettings + singleton cacheado
│   │   │   ├── database.py           # Clientes Supabase (service_role + anon)
│   │   │   ├── redis_client.py       # RedisWrapper async + pool de conexiones
│   │   │   ├── audit_logger.py       # Escriba inmutable (append-only)
│   │   │   ├── security/             # rut_validator.py, dna_scanner.py
│   │   │   ├── valuation/            # user_asset_calculator.py ($1-$500)
│   │   │   └── legal/                # Smart Integrity Charter
│   │   │
│   │   ├── domain/                   # Lógica de Negocio
│   │   │   ├── models/               # user.py, super_entities.py
│   │   │   │   ├── user.py           # Bóveda de Identidad (dataclass)
│   │   │   │   └── super_entities.py # Ecosistema multiclase (4 tipos)
│   │   │   ├── schemas/              # Pydantic v2: entrada/salida
│   │   │   │   └── user.py           # UserCreate, UserVerifyRUT, UserResponse
│   │   │   └── enums.py              # 8 enums: Rangos, Security, EntityType...
│   │   │
│   │   ├── forensics/                # LA CUEVA (Aislamiento Forense)
│   │   │   ├── displaced/            # Shadow logging para desplazados
│   │   │   ├── judgement/            # meta_dna_analyzer, spatial_logic
│   │   │   └── incubator/            # Cuentas nuevas < 30 días
│   │   │
│   │   ├── services/                 # El Motor de la Orquesta
│   │   │   ├── auth_service.py       # Registro BRONZE + DNA scan + audit
│   │   │   ├── identity_service.py   # Ascensión SILVER + RUT hash + audit
│   │   │   ├── reputation/           # Fórmula 40/30/20/10
│   │   │   ├── hierarchy/            # rank_survival_monitor
│   │   │   ├── voting/               # atomic_ballot, event_lifecycle
│   │   │   └── monetization/         # pricing_engine, sponsored_engine
│   │   │
│   │   └── infrastructure/           # Capa de Rendimiento
│   │       ├── redis_engine/         # ballot_box, hot_counter, rate_limiter
│   │       └── bridge/               # websocket_broadcast (Efecto Kahoot)
│   │
│   ├── tests/                        # Simulacros de Ataque y Estrés
│   │   └── test_integration_ascension.py  # 20+ tests: RUT, DNA, Assets
│   ├── requirements.txt              # 12 dependencias de alta precisión
│   └── .env                          # 🔒 NO VERSIONADO (llaves Supabase + JWT)
│
├── frontend/                         # La Interfaz de Estatus (Next.js 16)
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css           # Design System Dark Premium completo
│   │   │   ├── layout.tsx            # Navbar glassmorphism + security indicator
│   │   │   └── page.tsx              # Hero + metrics cards + rank badges
│   │   ├── components/
│   │   │   ├── status/               # Medallas 🥇🥈🥉 y Auras de Poder
│   │   │   ├── outskirts/            # UI limitada para Desplazados (The Hook)
│   │   │   ├── bunker/               # UI de Élite (Veredicto Magistral)
│   │   │   └── events/               # Layout Kahoot (Batalla de Comunas)
│   │   ├── hooks/                    # useDNACapture, useIntegrity
│   │   └── store/                    # Zustand: rango + puntos de influencia
│
├── scrapers/                         # Recolección Inteligente (Playwright)
│
└── supabase/                         # Políticas RLS y Auditoría Inmutable
    └── migrations/
        ├── 001_initial_schema.sql    # users, audit_logs, config_params + RLS
        └── 002_entities_schema.sql   # entities + service_tags + pg_trgm
```

---

## 🔐 Seguridad — Defensa en Profundidad

| Capa | Mecanismo | Descripción |
|---|---|---|
| **Identidad** | SHA-256 (RUT) | El RUT nunca se almacena en texto plano |
| **Auth** | JWT + bcrypt | Tokens firmados, contraseñas hasheadas |
| **Datos** | RLS (Supabase) | Los usuarios solo ven lo que su rango permite |
| **Auditoría** | Append-only | `audit_logs` no permite UPDATE ni DELETE |
| **Anti-bot** | DNA Scanner | Clasificación HUMAN/SUSPICIOUS/DISPLACED |
| **Anti-fraude** | Shadow Ban | El usuario no sabe que fue silenciado |
| **Config** | Soft Delete | Nunca se borran datos — todo es "oro histórico" |

---

## 🚀 Quick Start

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

### Migraciones SQL
Ejecutar en orden en el **SQL Editor** de Supabase (todas son idempotentes — `IF NOT EXISTS`):

**supabase/migrations/ (aplicar primero):**
1. `supabase/migrations/001_initial_schema.sql` — users, audit_logs, config_params + RLS
2. `supabase/migrations/002_entities_schema.sql` — entities + service_tags + pg_trgm
3. `supabase/migrations/003_territorial_config.sql` — tabla de configuración territorial
4. `supabase/migrations/004_add_country_to_users.sql` — campo country en users
5. `supabase/migrations/005_add_party_to_entities.sql` — campo party en entities
6. `supabase/migrations/006_audit_logs_select_policy.sql` — RLS SELECT en audit_logs
7. `supabase/migrations/007_entities_rls_admin_policies.sql` — políticas RLS admin en entities
8. `supabase/migrations/008_entities_category_check_constraint.sql` — constraint de categoría
9. `supabase/migrations/009_audit_logs_insert_policy.sql` — RLS INSERT en audit_logs
10. `supabase/migrations/010_polls_header_image_questions.sql` — tablas polls + poll_votes

**backend/migrations/ (aplicar después):**
11. `backend/migrations/008_entity_reviews.sql` — tabla anti-brigada
12. `backend/migrations/009_entities_reputation_columns.sql` — reputation_score + total_reviews
13. `backend/migrations/010_evaluation_dimensions.sql` — dimensiones por categoría (seed incluido)
14. `backend/migrations/011_fix_audit_logs_schema.sql` — audit_logs UUID + índices
15. `backend/migrations/012_document_entities_real_schema.sql` — columnas reales de entities ✅ aplicada
16. `backend/migrations/013_add_last_reviewed_at_to_entities.sql` — decay job ✅ aplicada
17. `backend/migrations/014_rank_simplification.sql` — sistema 2 rangos: BASIC / VERIFIED ✅ aplicada
18. `backend/migrations/015_fix_rank_constraint.sql` — constraint check para 2 rangos ✅ aplicada
19. `backend/migrations/016_add_region_commune_columns.sql` — columnas region y commune en users ✅ aplicada
20. `backend/migrations/017_add_gender_column.sql` — campo gender en users ✅ aplicada
21. `backend/migrations/018_add_voter_rank_to_poll_votes.sql` — snapshot de rango en poll_votes ✅ aplicada

---

## 📡 API Endpoints (v1)

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| `GET` | `/health` | Status del búnker | ❌ |
| `POST` | `/api/v1/user/auth/register` | Registro + DNA scan | ❌ |
| `POST` | `/api/v1/user/auth/login` | Login → JWT | ❌ |
| `POST` | `/api/v1/user/auth/confirm-email` | Confirmar email (OTP) | ❌ |
| `POST` | `/api/v1/user/auth/verify-identity` | Ascensión VERIFIED (RUT) | ✅ |
| `GET` | `/api/v1/user/auth/me` | Perfil público | ✅ |
| `PUT` | `/api/v1/user/auth/profile` | Datos demográficos | ✅ |
| `GET` | `/api/v1/entities` | Lista paginada + filtros | ❌ |
| `GET` | `/api/v1/entities/filters` | DISTINCT región/partido | ❌ |
| `GET` | `/api/v1/entities/{id}` | Detalle de entidad | ❌ |
| `POST` | `/api/v1/entities/{id}/vote` | Veredicto multidimensional (ponderado por rango) | ✅ |
| `GET` | `/api/v1/dimensions` | Dimensiones por categoría | ❌ |
| `WS` | `/api/v1/realtime/pulse/{id}` | WebSocket tiempo real | ❌ |
| `GET` | `/api/v1/polls` | Lista encuestas activas | ❌ |
| `POST` | `/api/v1/polls` | Crear encuesta (solo VERIFIED) | ✅ |
| `GET` | `/api/v1/polls/{id}` | Detalle encuesta + resultados | ❌ |
| `POST` | `/api/v1/polls/{id}/vote` | Votar en encuesta | ❌/✅ |
| `GET` | `/api/v1/versus` | Lista versus activos | ❌ |
| `POST` | `/api/v1/versus/{id}/vote` | Votar en versus (A o B) | ✅ |
| `GET` | `/api/v1/events` | Lista eventos activos | ❌ |
| `POST` | `/api/v1/events/{id}/vote` | Votar en evento (score 1-5) | ✅ |
| `GET` | `/api/v1/admin/*` | Panel Overlord (entidades, stats, AUM, audit, decay, polls, versus, events) | ✅ Admin |

---

## 📜 Directives 2026

Este proyecto se rige por las **Technical Directives 2026 v1.0**:
- Tipado estático riguroso (Pydantic v2+)
- 100% async/await para I/O
- RLS + validación backend (defensa en profundidad)
- Append-only para auditoría (inmutabilidad forense)
- Testing obligatorio 90%+ de cobertura
- Zero-waste code (sin código muerto ni comentarios de código)

---

## 🏗️ Roadmap

- [x] **Fase 0**: Scaffolding e Infraestructura Base
- [x] **Fase 1**: Auth e Identidad (JWT, RUT, DNA Scanner, email confirmación)
- [x] **Fase 1.5**: ACM + Auth Modal (permisos con herencia, UI Dark Premium)
- [x] **Fase 2 — MVP**: Motor de Integridad completo en producción
  - [x] Votación Bayesiana con pesos por rango (PR-1)
  - [x] WebSocket pulse en tiempo real (PR-2)
  - [x] Anti-brigada (entity_reviews UNIQUE)
  - [x] Decay temporal con job + endpoints admin (PR-12)
  - [x] AsyncClient singleton + lifespan (PR-8, PR-10)
  - [x] Audit logger async en toda la capa admin (PR-4)
  - [x] Despliegue producción: `www.beaconchile.cl` (Render + Vercel)
- [x] **P3 — Versus**: `/versus` head-to-head — código implementado (`versus.py`, `versus_admin.py`)
- [ ] **P4 — Filtros geográficos**: /politicos, /empresas, /periodistas con filtros propios
- [ ] **P5 — Verificación RUT BRONZE→SILVER**: formulario en perfil  (ya no se usa BRONZE→SILVER) 
- [ ] **P6 — Scrapers**: BCN, Cámara, Senado, Wikipedia (Playwright)
- [ ] **Fase 3**: Artillería Forense (Metadata, Fingerprint, ISP, 2FA SMS)
- [ ] **Fase 4**: Capa de Juicio (DNA Analyzer, Spatial Logic, vote_engine.py)
- [ ] **Fase 5**: Higiene de Contenido (PII, Profanity, Gibberish)
- [ ] **Fase 9**: Monetización y Gamificación (Pasaporte Cívico)
- [ ] **Fase 10**: Panel Overlord Dashboard completo
- [ ] **Fase 11**: Reportes y Difusión Pública

---

<p align="center">
  <strong>BEACON PROTOCOL v1.0</strong><br>
  <em>"Sangre y Código — Lo que entra al búnker, solo sale si es íntegro."</em>
</p>
