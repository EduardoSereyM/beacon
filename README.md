# 🛡️ BEACON: The Universal Integrity Protocol

> **Motor de Integridad y Meritocracia Digital**
> *"Lo que no es íntegro, no existe."*

Beacon es una infraestructura de confianza humana verificada. Un protocolo que valida la autenticidad de cada voz digital — votos, opiniones, evaluaciones — mediante verificación de identidad, análisis forense de comportamiento y un sistema de rangos meritocrático.

---

## ⚡ Stack Tecnológico

| Capa | Tecnología | Función |
|---|---|---|
| **Backend** | Python 3.12 + FastAPI 0.109 | Motor de integridad async |
| **Frontend** | Next.js 14 + Tailwind CSS | Interfaz Dark Premium |
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

## 👑 Jerarquía Soberana — El Juego del Calamar de la Integridad

```
                    ╔═══════════════╗
                    ║   💎 DIAMOND    ║  Poder: 5.0x  |  Valor: $500 USD
                    ║  Auditor de    ║  Verificación presencial
                    ║  la Verdad     ║
                    ╚═══════╦═══════╝
                            │
                    ╔═══════╩═══════╗
                    ║   🥇 GOLD      ║  Poder: 2.5x  |  Valor: $150 USD
                    ║  Referente de  ║  Perfil completo + 30 días
                    ║  Integridad    ║
                    ╚═══════╦═══════╝
                            │
                    ╔═══════╩═══════╗
                    ║   🥈 SILVER    ║  Poder: 1.5x  |  Valor: $15 USD
                    ║  Ciudadano     ║  RUT Verificado (SHA-256)
                    ║  Verificado    ║
                    ╚═══════╦═══════╝
                            │
                    ╔═══════╩═══════╗
                    ║   🥉 BRONZE    ║  Poder: 1.0x  |  Valor: $1 USD
                    ║  Masa Crítica  ║  Solo email verificado
                    ╚═══════════════╝
```

**Rito de Ascensión:**
1. 📧 **Registro** → Naces como BRONZE (integrity_score: 0.5)
2. 🪪 **Verifica tu RUT** → Asciende a SILVER (integrity_score: 0.75)
3. 📊 **Completa tu perfil** → Cada dato demográfico suma +0.02
4. ⭐ **Comportamiento íntegro** → El sistema te evalúa hacia GOLD/DIAMOND

---

## 💵 Asset Valuation Engine — La Caja Registradora

Cada ciudadano verificado tiene un **valor de mercado** calculado en tiempo real:

```
Valor = (Base_Tier × Integrity × 1.2) + Data_Bonus + RUT_Bonus

Donde:
  Base_Tier    = $1 (BRONZE) | $15 (SILVER) | $150 (GOLD) | $500 (DIAMOND)
  Integrity    = 0.0 a 1.0 (score de comportamiento)
  Data_Bonus   = $5.00 si commune + age_range completos
  RUT_Bonus    = $3.00 si identidad verificada (SHA-256)
```

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
├── frontend/                         # La Interfaz de Estatus (Next.js 14)
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
Ejecutar en orden en el **SQL Editor** de Supabase:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_entities_schema.sql`

---

## 📡 API Endpoints (v1)

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| `POST` | `/api/v1/user/auth/register` | Registro + DNA scan | ❌ |
| `POST` | `/api/v1/user/auth/login` | Login → JWT | ❌ |
| `POST` | `/api/v1/user/auth/verify-identity` | Ascensión SILVER (RUT) | ✅ |
| `GET` | `/api/v1/user/auth/me` | Perfil público | ✅ |
| `PUT` | `/api/v1/user/auth/profile` | Datos demográficos | ✅ |
| `GET` | `/health` | Status del búnker | ❌ |

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
- [x] **Fase 1**: Auth e Identidad (JWT, RUT, DNA Scanner)
- [ ] **Fase 2**: Motor de Integridad (Bayesian Ranking, Decay, Shadow Ban)
- [ ] **Fase 3**: Artillería Forense (Metadata, Fingerprint, ISP)
- [ ] **Fase 4**: Capa de Juicio (DNA Analyzer, Spatial Logic)
- [ ] **Fase 5**: Higiene de Contenido (PII, Profanity, Gibberish)
- [ ] **Fase 6**: Entidades y Evaluación (Sliders, Reviews)
- [ ] **Fase 7**: Eventos y Votación en Vivo (Efecto Kahoot)
- [ ] **Fase 8**: Comportamiento y Maduración
- [ ] **Fase 9**: Monetización y Gamificación (Pasaporte Cívico)
- [ ] **Fase 10**: Panel Overlord (Admin Dashboard)
- [ ] **Fase 11**: Reportes y Difusión Pública
- [ ] **Fase 12**: Frontend Completo (Dark Premium)
- [ ] **Fase 13**: Performance y Despliegue

---

<p align="center">
  <strong>BEACON PROTOCOL v1.0</strong><br>
  <em>"Sangre y Código — Lo que entra al búnker, solo sale si es íntegro."</em>
</p>
