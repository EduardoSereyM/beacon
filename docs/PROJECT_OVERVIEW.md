# 🗳️ BEACON — Informe Ejecutivo del Proyecto

**Última actualización:** 2026-04-07
**Versión:** MVP Fase 2 (Estabilización)
**Fuente de verdad:** ROADMAP_LOG.md + Código fuente

---

## ¿Qué es?

Beacon es la primera plataforma de opinión ciudadana abierta y verificada de Chile. Permite que cualquier persona vote sobre políticos, empresas y personajes públicos sin intermediarios, panelistas seleccionados ni agenda oculta. Los votos verificados (RUT validado) cuentan en informes oficiales; los no verificados aparecen en el conteo público pero no en análisis formal. Modelo: ciudadanía = poder.

---

## ¿Qué hace?

### Funcionalidades Principales (Producción)
1. **Registro y Autenticación** — email + contraseña con confirmación OTP
2. **Verificación de Identidad** — validación Módulo 11 chileno + hash SHA-256 (RUT nunca se almacena en texto)
3. **Votación Multidimensional** — sliders 0-5 para calificar entidades (estándares estructurales: Transparencia, Gestión, Coherencia, Representatividad)
4. **Ranking Bayesiano** — scoring con shrinkage estadístico (prior neutral m=30, center C=3.0)
5. **Decay Temporal** — reputación se erosiona hacia neutral (3.0) si no hay actividad reciente (half-life 180 días)
6. **Detección de Bots (DNA Scanner)** — clasificación de tráfico: HUMAN/SUSPICIOUS/DISPLACED sin alertar atacantes
7. **Anti-Brigada** — un voto por usuario por entidad (tabla entity_reviews UNIQUE constraint)
8. **Dashboard de Administrador** — gestión de entidades, monitoreo de decay, acceso a audit logs inmutables
9. **WebSockets en Tiempo Real** — actualización de rankings cuando votan otros usuarios (Efecto Kahoot)

### Funcionalidades en Roadmap (P3/P4)
- **P3 — Versus** — votación head-to-head entre dos entidades
- **P3 — Propuesta Ciudadana** — usuarios verificados pueden sugerir nuevas preguntas
- **P4 — Informes B2B** — análisis segmentado para medios y empresas (pago)
- **P4 — Filtros Geográficos** — páginas `/politicos`, `/empresas` con región/comuna/partido

---

## Stack Tecnológico

| Capa | Tecnología | Versión | Función |
|---|---|---|---|
| **Frontend** | Next.js 16 + Tailwind CSS 4 | 14+ | SSR + ISR, estética Dark Premium |
| **Backend** | FastAPI + Python | 3.12 | API REST async, orquestación |
| **Base de Datos** | PostgreSQL (Supabase) | 15+ | Persistencia inmutable con RLS |
| **Caché/Realtime** | Redis | 5.0 async | Latencia <2ms en votaciones, Panic Gate |
| **Auth** | Supabase Auth (JWT) | Native | OAuth-compatible, no requiere terceros |
| **Seguridad** | SHA-256 + bcrypt | Native | Hashing de RUT + contraseñas |
| **Infraestructura** | Render (backend) + Vercel (frontend) | Live | Deploys automáticos, zero cold start en home |

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (Next.js 16)                                       │
│ ├─ Server Components (async) para home + ISR                │
│ ├─ Client Components para votación + Auth Modal             │
│ └─ usePermissions hook (ACM espejo)                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/WebSocket
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ BACKEND (FastAPI)                                           │
│ ├─ DNA Scanner (entrada forense)                            │
│ ├─ Auth Service (Supabase JWT)                              │
│ ├─ Voting Engine (Bayesian + Decay)                         │
│ ├─ Integrity Engine (Ranking)                               │
│ ├─ ACM (Access Control Matrix)                              │
│ ├─ Audit Logger (append-only)                               │
│ └─ Panic Gate (emergencia global)                           │
└──────────────────────┬──────────────────────────────────────┘
                       │ Connection Pool (IPv4)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ DATABASE (Supabase/PostgreSQL)                              │
│ ├─ users (auth + perfil)                                    │
│ ├─ entities (políticos, empresas, públicos)                 │
│ ├─ entity_reviews (un voto por usuario-entidad)             │
│ ├─ audit_logs (append-only forense)                         │
│ ├─ config_params (pesos, umbral de decay)                   │
│ └─ RLS (Row Level Security)                                 │
└─────────────────────────────────────────────────────────────┘
```

**Flujo de Voto:**
1. Usuario autenticado → POST `/api/v1/entities/{id}/vote` con scores
2. DNA Scanner valida origen (HUMAN/SUSPICIOUS/DISPLACED)
3. Integrity Engine calcula nuevo `reputation_score` (Bayesian shrinkage)
4. UPDATE atómico en `entities` + INSERT en `entity_reviews`
5. Redis publica evento vía WebSocket → clientes conectados reciben actualización
6. Audit logger registra `VOTE_SUBMITTED` inmutablemente

---

## Estado Actual

### Fase 1: Auth e Identidad — ✅ COMPLETA
- ✅ Registro con email + confirmación OTP
- ✅ Validación RUT Módulo 11 + hash SHA-256
- ✅ Access Control Matrix (ACM) con herencia
- ✅ Auth Modal (Dark Premium UI)

### Fase 2: Territorio + Valor — 🔄 90% COMPLETA
- ✅ Votación Bayesiana con pesos (BASIC 0.5x / VERIFIED 1.0x)
- ✅ WebSocket pulse en tiempo real
- ✅ Anti-brigada (entity_reviews UNIQUE)
- ✅ Decay temporal con job cron
- ✅ Deploy a producción (`www.beaconchile.cl`)
- ✅ Home Server Component + ISR (cache 60s en Vercel)
- ⚠️ Endpoints activos pero algunos campos hardcodeados (reputation_score → 0)

### Fase 3: Artillería Forense — 📋 ROADMAP
- 🔲 Versus (head-to-head)
- 🔲 Propuesta ciudadana de preguntas
- 🔲 Informes B2B
- 🔲 2FA SMS

---

## Decisiones Técnicas Clave

### ADR-001: Next.js SSR + ISR (no SPA)
**Razón:** Cold starts de Render no afectan UX. Home cachea 60s en Vercel.
**Implicación:** Páginas dinámicas cargan on-demand; home es instantánea.

### ADR-002: RLS + service_role backend only
**Razón:** Frontend NUNCA ve `service_role`. Evita escapes de privacidad.
**Implicación:** FastAPI es el único guardián de datos sensibles.

### ADR-003: Audit Logs Append-Only
**Razón:** Trazabilidad forense. Reconstruir cualquier evento pasado.
**Implicación:** No hay borrador de historia. Defensa legal y auditoría.

### ADR-004: DNA Scanner (Clasificación de Tráfico)
**Razón:** Detectar y aislar bots sin alertarlos (shadow mode).
**Implicación:** Atacantes no saben que fueron silenciados.

### ADR-005: Modelo Binario de Verificación (BASIC/VERIFIED)
**Razón:** Simplicidad pública, no intimida al usuario.
**Implicación:** Peso de voto simple (0.5x / 1.0x), sin tiers complejos.
