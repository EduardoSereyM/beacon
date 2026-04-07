> ⚠️ ARCHIVADO [2026-04-07]. Contenido consolidado en ROADMAP_LOG.md en raíz del proyecto.

# 📋 Estado Actual del Sistema — [nombre-proyecto]

> **Propietario:** Eduardo Serey
> **Stack:** React + Vite + FastAPI + Supabase (PostgreSQL)
> **Última actualización:** [FECHA] — [descripción del último cambio]
> **Versión del sistema:** [x.x.x]

---

> ⚠️ **Este documento describe el estado actual del sistema, no planes futuros.**
> La IA lo actualiza en cada commit — no solo en PRs. Si este documento y el código difieren, el código manda — y hay que corregir este documento.

---

## Tabla de Contenidos

1. [Módulos del Sistema](#1-módulos-del-sistema)
2. [Endpoints Activos](#2-endpoints-activos)
3. [Base de Datos](#3-base-de-datos)
4. [Migraciones](#4-migraciones)
5. [Lógicas de Negocio Importantes](#5-lógicas-de-negocio-importantes)
6. [Decisiones de Arquitectura](#6-decisiones-de-arquitectura)
7. [Tests](#7-tests)
8. [Skills de Claude Code](#8-skills-de-claude-code)
9. [Estado de Features](#9-estado-de-features)

---

## 1. Módulos del Sistema

### Módulo `auth`
**Estado:** ✅ Activo
**Responsabilidad:** Login, registro y gestión de sesión via Supabase Auth.

| Capa | Archivos principales | Notas |
|---|---|---|
| Backend | `router.py`, `schemas.py`, `service.py`, `dependencies.py` | `dependencies.py` re-exporta desde `core/security.py` |
| Frontend | `LoginView.tsx`, `RegisterView.tsx`, `useAuth.ts` | JWT en memoria, nunca en localStorage |

---

### Módulo `[nombre]`
**Estado:** ✅ Activo / 🚧 En desarrollo / ⏸️ Pausado
**Responsabilidad:** [descripción de una línea]

| Capa | Archivos principales | Notas |
|---|---|---|
| Backend | | |
| Frontend | | |

---

## 2. Endpoints Activos

### Auth — `/api/v1/auth/`

| Método | Endpoint | Auth requerida | Descripción |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | No | Login con email + password |
| `POST` | `/api/v1/auth/register` | No | Registro de nuevo usuario |
| `POST` | `/api/v1/auth/logout` | JWT | Cierre de sesión |
| `POST` | `/api/v1/auth/refresh` | JWT | Refresco de token |

### [Módulo] — `/api/v1/[modulo]/`

| Método | Endpoint | Auth requerida | Descripción |
|---|---|---|---|
| `GET` | `/api/v1/[modulo]s` | JWT | Listar todos |
| `POST` | `/api/v1/[modulo]s` | JWT | Crear nuevo |
| `GET` | `/api/v1/[modulo]/{id}` | JWT | Obtener uno |
| `PUT` | `/api/v1/[modulo]/{id}` | JWT | Actualizar |
| `DELETE` | `/api/v1/[modulo]/{id}` | JWT | Soft delete |

---

## 3. Base de Datos

### Tabla `user_roles`
**Módulo owner:** `auth`
**Migración:** `YYYYMMDDHHMMSS_create_user_roles.sql`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK, auto-generado |
| `user_id` | uuid | FK → `auth.users`, cascade delete |
| `role` | text | `check (role in ('admin', 'user'))` |
| `created_at` | timestamptz | automático |
| `updated_at` | timestamptz | automático via trigger |
| `created_by` | uuid | FK → `auth.users`, nullable |
| `updated_by` | uuid | FK → `auth.users`, nullable |
| `is_deleted` | boolean | soft delete, default false |
| `deleted_at` | timestamptz | nullable |
| `deleted_by` | uuid | FK → `auth.users`, nullable |

**RLS:** habilitado — índice único parcial `WHERE is_deleted = false`

---

### Tabla `[nombre]`
**Módulo owner:** `[modulo]`
**Migración:** `YYYYMMDDHHMMSS_[descripcion].sql`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK, auto-generado |
| `user_id` | uuid | FK → `auth.users`, cascade delete |
| | | *(campos propios)* |
| `created_at` | timestamptz | automático |
| `updated_at` | timestamptz | automático via trigger |
| `created_by` | uuid | FK → `auth.users`, nullable |
| `updated_by` | uuid | FK → `auth.users`, nullable |
| `is_deleted` | boolean | soft delete, default false |
| `deleted_at` | timestamptz | nullable |
| `deleted_by` | uuid | FK → `auth.users`, nullable |

**RLS:** habilitado / no habilitado

---

## 4. Migraciones

> Las migraciones se aplican en orden cronológico. **Nunca modificar una migración ya aplicada** — siempre crear una nueva.

| # | Archivo | Fecha | Descripción | Módulo owner |
|---|---|---|---|---|
| 001 | `YYYYMMDDHHMMSS_create_functions.sql` | [FECHA] | Función `update_updated_at()` — debe ser la primera migración | Core |
| 002 | `YYYYMMDDHHMMSS_create_user_roles.sql` | [FECHA] | Tabla `user_roles` con soft delete y RLS | `auth` |
| 00N | `YYYYMMDDHHMMSS_[descripcion].sql` | [FECHA] | [descripción clara del cambio] | `[modulo]` |

---

## 5. Lógicas de Negocio Importantes

> Esta sección documenta algoritmos, cálculos y validaciones no triviales que viven en el sistema. Si la lógica desaparece del código pero no de aquí, hay un bug esperando.

---

### Validación RUT Chileno (Módulo 11)
**Ubicación:** `backend/app/core/validators.py` · `frontend/src/shared/hooks/useRutValidation.ts`
**Cuándo se usa:** Todo campo de RUT en formularios y endpoints.

**Algoritmo:**
1. Limpiar formato: eliminar puntos y guión, convertir a mayúsculas
2. Separar cuerpo (todos los dígitos excepto el último) y dígito verificador (DV)
3. Validar que el cuerpo tenga mínimo 7 dígitos
4. Validar que el DV sea un dígito o la letra K
5. Calcular suma: recorrer el cuerpo de derecha a izquierda, multiplicar cada dígito por el factor del ciclo `2→3→4→5→6→7→2→...`
6. Calcular `resto = 11 - (suma % 11)`
7. El DV esperado es: `K` si resto=10, `0` si resto=11, el número si resto es 1-9
8. Retornar `DV ingresado == DV esperado`

**Casos de referencia:**

| RUT | Resultado |
|---|---|
| `76354771-K` | ✅ válido |
| `11111111-1` | ✅ válido |
| `12345678-5` | ✅ válido |
| `76354771-9` | ❌ DV incorrecto |
| `1234567-A` | ❌ DV inválido (no es dígito ni K) |
| `1-9` | ❌ cuerpo demasiado corto |

**Almacenamiento:** El RUT nunca se guarda en texto plano — se almacena como `rut_hash` (SHA-256 + salt).

---

### [Nombre de lógica]
**Ubicación:** `[archivo]`
**Cuándo se usa:** [descripción]

**Algoritmo / Descripción:**
[Explicar en lenguaje claro cómo funciona, paso a paso si es un cálculo]

**Notas importantes:**
- [consideraciones, casos edge, restricciones]

---

## 6. Decisiones de Arquitectura

> Las decisiones importantes que moldearon el sistema. No "qué tecnología elegimos" sino "por qué tomamos esta decisión y cuáles son sus consecuencias".

---

### ADR-001 — Vite + React sobre Next.js
**Fecha:** [FECHA]
**Estado:** ✅ Vigente

**Decisión:** Usar Vite + React como SPA en lugar de Next.js.

**Razón:** FastAPI maneja todo el backend — no se necesita SSR. Next.js agregaría complejidad sin beneficio real para este stack.

**Consecuencia:** Las páginas que necesiten pre-renderizado para RRSS (Open Graph) se resuelven con un endpoint dedicado en FastAPI (`/og/{id}`), no con SSR.

---

### ADR-002 — Soft Delete universal
**Fecha:** [FECHA]
**Estado:** ✅ Vigente

**Decisión:** Todas las tablas usan soft delete (`is_deleted`, `deleted_at`, `deleted_by`).

**Razón:** Los datos nunca se pierden — son trazables y recuperables. Fundamental para auditoría.

**Consecuencia:** Toda query de lectura debe incluir `is_deleted = False`. El módulo admin puede recuperar registros eliminados.

---

### ADR-00N — [Título]
**Fecha:** [FECHA]
**Estado:** ✅ Vigente / ⚠️ En revisión / ❌ Reemplazada por ADR-00X

**Decisión:** [qué se decidió]

**Razón:** [por qué]

**Consecuencia:** [qué implica esta decisión en el sistema]

---

## 7. Tests

> Todo módulo activo debe tener sus tests documentados aquí. Si no están documentados, no se consideran parte del sistema.

### Backend (pytest)

| Archivo | Capa | Función / qué verifica |
|---|---|---|
| `tests/modules/auth/test_router.py` | Router | Happy path login, 401 sin token, 422 con email inválido |
| `tests/modules/auth/test_service.py` | Service | `verify_credentials()` con password correcto e incorrecto |
| `tests/modules/[nombre]/test_router.py` | Router | [descripción de qué verifica] |
| `tests/modules/[nombre]/test_service.py` | Service | [descripción de qué verifica] |

### Frontend (vitest + Testing Library)

| Archivo | Componente / Vista | Función / qué verifica |
|---|---|---|
| `modules/auth/__tests__/LoginView.test.tsx` | `LoginView` | Renderizado, submit con datos válidos, mensaje de error |
| `modules/[nombre]/__tests__/[Nombre]View.test.tsx` | `[NombreView]` | [descripción de qué verifica] |

---

## 8. Skills de Claude Code

> Los skills activos en este proyecto. Cada uno tiene su `SKILL.md` en `.claude/skills/`.

| Nombre | Archivo | Funcionalidad | Cuándo activarlo |
|---|---|---|---|
| *(ninguno aún)* | — | — | — |

<!--
Ejemplo cuando existan:
| `beacon-db` | `.claude/skills/beacon-db/SKILL.md` | Guía de migraciones, esquemas y convenciones de DB | "revisa la DB", "quiero crear una tabla", "migración" |
| `beacon-ui-audit` | `.claude/skills/beacon-ui-audit/SKILL.md` | Auditoría de UI, accesibilidad y design tokens | "audita el UI", "revisa accesibilidad" |
-->

---

## 9. Estado de Features

### ✅ Completadas

| Feature | Módulo | Fecha | Notas |
|---|---|---|---|
| Autenticación email + password | `auth` | [FECHA] | |
| RBAC con roles admin/user | `auth` | [FECHA] | via tabla `user_roles` |
| Soft delete universal | DB | [FECHA] | todas las tablas |
| Auditoría de acciones | `logs` | [FECHA] | tabla `audit_logs` |

### 🚧 En Desarrollo

| Feature | Módulo | Responsable | Bloqueada por |
|---|---|---|---|
| [nombre] | [módulo] | IA / Eduardo | [dependencia si existe] |

### ⏸️ Pendientes

| Feature | Módulo | Prioridad | Notas |
|---|---|---|---|
| Biblioteca de componentes | UI | Media | Pendiente decidir shadcn/ui u otra |
| OAuth Google / GitHub | `auth` | Media | Definir por proyecto |
| Notificaciones en tiempo real | `notifications` | Baja | Por defecto polling — websockets si se justifica |

---

> **Versión del documento:** 1.0
> **Próxima actualización:** Al completar el siguiente módulo o feature
