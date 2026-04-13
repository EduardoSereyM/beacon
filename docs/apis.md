# BEACON Protocol — Documentación de APIs

> **Generado:** 2026-04-07 (actualizado con modelo binario BASIC/VERIFIED)
> **Proyecto creado:** 2026-02-24
> **Base URL:** `https://<host>/api/v1`
> **Formato:** JSON (application/json)
> **Auth:** Bearer JWT emitido por Supabase Auth
> **Sistema de rangos:** BASIC (0.5x) | VERIFIED (1.0x)

---

## Leyenda de Estado

| Ícono | Significado |
|-------|-------------|
| ✅ | Robusto — funciona correctamente |
| ⚠️ | Issue medio — funciona pero con defecto documentado |
| ❌ | Bug activo — comportamiento incorrecto o roto |

---

## Índice

1. [Infraestructura](#1-infraestructura)
2. [Auth & Identidad](#2-auth--identidad)
3. [Entidades (público)](#3-entidades-público)
4. [Votos](#4-votos)
5. [Dimensiones de Evaluación](#5-dimensiones-de-evaluación)
6. [Real-Time Pulse](#6-real-time-pulse)
7. [Admin — Entidades](#7-admin--entidades)
8. [Admin — Dimensiones](#8-admin--dimensiones)
9. [Admin — Stats](#9-admin--stats)
10. [Admin — AUM](#10-admin--aum)
11. [Admin — Audit Logs](#11-admin--audit-logs)
12. [Mecánica de Votos y Pesos](#12-mecánica-de-votos-y-pesos)
13. [Admin — Polls](#13-admin--polls)

---

## 1. Infraestructura

### GET `/health`

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tabla DB** | — |
| **Estado** | ✅ |

**Response 200:**
```json
{
  "status": "ok",
  "service": "beacon-protocol-api",
  "version": "0.1.0"
}
```

**Notas:** Sin verificación de DB ni Redis. Solo confirma que el proceso FastAPI está vivo.

---

## 2. Auth & Identidad

Base path: `/api/v1/user/auth`

### POST `/register` — Registrar ciudadano

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `users` (vía auth_service), `audit_logs` |
| **Estado** | ⚠️ Rate limit de emails Supabase (2/hora en plan Free) |

**Body (UserCreate):**
```json
{
  "email": "ciudadano@ejemplo.cl",
  "password": "mínimo 8 chars",
  "first_name": "Juan",
  "last_name": "Pérez"
}
```

**Headers opcionales:**
- `X-Fill-Duration`: segundos que tardó el usuario en llenar el formulario (DNA Scanner)
- `User-Agent`: capturado automáticamente por FastAPI

**Flujo interno:**
1. DNA Scanner analiza `ip`, `user_agent`, `fill_duration`
   - `fill_duration < 2s` → score -50 (`BOT_SPEED_DETECTED`)
   - `fill_duration < 4s` → score -20 (`UNUSUALLY_FAST_SUBMISSION`)
   - User-Agent contiene keyword de bot → score -80 (`AUTOMATION_TOOL_DETECTED`)
   - User-Agent vacío o `mozilla/5.0` solo → score -30 (`GENERIC_OR_MISSING_UA`)
   - `webdriver: true` → score -60 (`WEBDRIVER_DETECTED`)
   - Score > 70 → `HUMAN` | 30-70 → `SUSPICIOUS` | ≤ 30 → `DISPLACED`
2. Si `DISPLACED` → 400 con mensaje genérico (shadow mode)
3. Registro en Supabase Auth + inserción en `public.users` con `rank=BASIC`, `integrity_score=0.5`

**Response 200:**
```json
{
  "status": "success",
  "message": "Cuenta creada. Revisa tu email para confirmar.",
  "user_id": "uuid"
}
```

**Errores:**
- `400`: DNA Scanner rechaza, email duplicado, validación Pydantic
- `429`: Rate limit de emails Supabase (2 emails/hora plan Free)

**Issue:** El DNA Scanner no persiste su análisis forense en `audit_logs` al registrar un `HUMAN`. Solo guarda rechazos. Los intentos `SUSPICIOUS` no generan log.

---

### POST `/confirm-email` — Confirmar email

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `auth.users` (Supabase interno) |
| **Estado** | ✅ |

**Body:**
```json
{
  "token_hash": "abc123...",
  "type": "signup"
}
```

Supabase envía este `token_hash` en el enlace de confirmación de email.

**Response 200:**
```json
{
  "status": "confirmed",
  "message": "Email confirmado correctamente. Ya puedes iniciar sesión.",
  "user_id": "uuid"
}
```

---

### POST `/login` — Iniciar sesión

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `users` |
| **Estado** | ⚠️ Excepción genérica expone información interna |

**Body:**
```json
{
  "email": "ciudadano@ejemplo.cl",
  "password": "password123"
}
```

**Flujo interno:**
1. DNA Scanner (mismo análisis que `/register`)
2. Si `DISPLACED` → 401 genérico (shadow mode: no revela el ban)
3. `supabase.auth.sign_in_with_password()` → genera JWT
4. Consulta `public.users` por `id` → obtiene datos de perfil
5. Verifica `is_shadow_banned` → si true, simula credenciales inválidas

**Response 200:**
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "ciudadano@ejemplo.cl",
    "full_name": "Juan Pérez",
    "rank": "BASIC",
    "integrity_score": 0.5,
    "reputation_score": 0.0,
    "is_verified": false,
    "role": "user"
  }
}
```

**Bug conocido:** El bloque `except Exception as e` en línea 234 captura toda excepción y la expone en el detalle del 401. Si Supabase devuelve un error con información sensible, se filtra al cliente.

---

### POST `/verify-identity` — Registrar RUT → auto-promoción a VERIFIED

| Campo | Valor |
|-------|-------|
| **Auth** | Bearer JWT |
| **Tablas DB** | `users`, `audit_logs` |
| **Estado** | ✅ |

**Body (UserVerifyRUT):**
```json
{
  "rut": "12.345.678-9"
}
```

**Flujo interno:**
1. Validación Módulo 11 en el backend (acepta formatos: `12.345.678-9`, `12345678-9`, `123456789`)
2. `hash_rut(rut)` → SHA-256 con salt desde `settings.RUT_SALT` → `rut_hash`
3. Unicidad: consulta `users WHERE rut_hash = ?` → si duplicado, registra `RUT_DUPLICATE_ATTEMPT` en audit → 400
4. UPDATE en `users`: `rut_hash=hash`, `is_rut_verified=true`
5. Llama a `_evaluate_rank(user_id)` → retorna VERIFIED si los 5 campos están completos, BASIC si no
6. UPDATE `rank` con el resultado de `_evaluate_rank()`
7. Registra `USER_VERIFIED_RUT` + `USER_RANK_CHANGED` en `audit_logs`

**Requisitos para `new_rank = VERIFIED`:** 5 campos todos presentes:
- `rut_hash` (este endpoint lo provee)
- `birth_year`, `country`, `region`, `commune` (deben venir del perfil previo o registro)

**Response 200 — VERIFIED:**
```json
{
  "status": "success",
  "new_rank": "VERIFIED",
  "integrity_score": 0.75,
  "message": "¡Identidad Verificada! Tu voto ahora pesa 1.0x."
}
```

**Response 200 — BASIC (campos demográficos incompletos):**
```json
{
  "status": "success",
  "new_rank": "BASIC",
  "integrity_score": 0.6,
  "message": "RUT registrado. Completa tu perfil demográfico para subir a VERIFIED."
}
```

**Notas:**
- El RUT en texto plano **NUNCA** se almacena; se descarta tras el hash
- La promoción a VERIFIED es **automática** si todos los campos están completos
- Frontend: validación módulo 11 también en cliente (`VerifyIdentityModal.tsx`)

**Errores:**
- `400`: RUT con dígito verificador inválido o RUT ya registrado en otra cuenta
- `401`: token inválido o expirado

---

### GET `/me` — Perfil del ciudadano autenticado

| Campo | Valor |
|-------|-------|
| **Auth** | Bearer JWT |
| **Tablas DB** | `users`, `auth.users` |
| **Estado** | ✅ |

**Response 200:**
```json
{
  "id": "uuid",
  "email": "ciudadano@ejemplo.cl",
  "full_name": "Juan Pérez",
  "rank": "BASIC",
  "integrity_score": 0.5,
  "reputation_score": 0.0,
  "verification_level": 1,
  "is_verified": false,
  "role": "user"
}
```

**Notas:** El email se inyecta desde `auth.users` (no existe en `public.users`). La columna `email` en `public.users` existe según migration 001 pero puede estar desincronizada con `auth.users`.

---

### PUT `/profile` — Actualizar perfil demográfico

| Campo | Valor |
|-------|-------|
| **Auth** | Bearer JWT |
| **Tablas DB** | `users`, `audit_logs` |
| **Estado** | ✅ Actualizado en migración 014 |

**Body (UserProfileUpdate):**
```json
{
  "commune": "Providencia",
  "region": "Metropolitana",
  "country": "Chile",
  "age_range": "25-34",
  "birth_year": 1990
}
```

**Todos los campos son opcionales.** Se envían solo los que se desea actualizar.

**Flujo interno:**
1. UPDATE en `users` con los campos presentes en el body
2. Llama a `_evaluate_rank(user_id)` → auto-promoción si los 5 campos están completos
3. Registra `PROFILE_DEMOGRAPHIC_UPDATED` en `audit_logs`

**Response 200:**
```json
{
  "status": "success",
  "new_rank": "VERIFIED",
  "message": "Perfil actualizado. Has alcanzado VERIFIED."
}
```

**Boost de integridad:**
- `+0.02` por cada campo entregado
- Máximo capped a `1.0`

**Errores:**
- `401`: token inválido

---

## 3. Entidades (público)

Base path: `/api/v1`

### GET `/entities/filters` — Filtros DISTINCT

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `entities` |
| **Estado** | ✅ |

**Response 200:**
```json
{
  "regions": ["Araucanía", "Biobío", "Metropolitana", ...],
  "parties": ["PS", "RN", "UDI", ...]
}
```

Lee columnas `region` y `party` de entidades activas (`is_active=true`, `deleted_at IS NULL`) y devuelve valores únicos ordenados.

---

### GET `/entities` — Listar entidades activas

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `entities` |
| **Estado** | ❌ `is_verified` y `rank` hardcodeados |

**Query params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `category` | string | — | `politico`, `periodista`, `empresario`, `empresa`, `evento` |
| `region` | string | — | Filtro ILIKE |
| `party` | string | — | Filtro ILIKE |
| `search` | string | — | Búsqueda en `first_name` OR `last_name` (ILIKE) |
| `limit` | int | 50 | Máximo 200 |
| `offset` | int | 0 | Paginación |

**Response 200:**
```json
{
  "entities": [
    {
      "id": "uuid",
      "first_name": "Gabriel",
      "last_name": "Boric",
      "second_last_name": "Font",
      "category": "politico",
      "position": "Presidente",
      "region": "Magallanes",
      "district": "28",
      "bio": "...",
      "party": "FA",
      "photo_path": "https://...",
      "official_links": {"twitter": "...", "email": "..."},
      "is_active": true,
      "email": "...",
      "reputation_score": 3.42,
      "total_reviews": 127,
      "is_verified": true,
      "rank": "BRONZE",
      "integrity_index": 68
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 50
}
```

**Bugs:**
- `is_verified: true` hardcodeado en línea 124 — todas las entidades aparecen como verificadas independientemente del dato real
- `rank: "BRONZE"` hardcodeado en línea 125 — no refleja la columna `rank` real de la entidad
- `integrity_index` es derivado de `reputation_score` (porcentaje de 0-5) en vez de leer `integrity_index` de la BBDD

**Columnas que usa de `entities`:**
`id`, `first_name`, `last_name`, `second_last_name`, `category`, `position`, `region`, `district`, `bio`, `party`, `photo_path`, `official_links`, `is_active`, `reputation_score`, `total_reviews`

---

### GET `/entities/{entity_id}` — Detalle de entidad

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `entities` |
| **Estado** | ❌ mismos bugs que `/entities` |

**Path params:** `entity_id` (UUID)

**Response 200:** mismo contrato que el objeto en `/entities` pero sin paginación.

**Response 404:**
```json
{"detail": "Entidad no encontrada"}
```

**Nota:** No filtra por `deleted_at IS NULL` (a diferencia de `/entities`). Una entidad con soft-delete pero `is_active=false` no se retorna, pero una con `deleted_at` seteado y `is_active=true` (estado inconsistente posible) sí aparece.

---

## 4. Votos

Base path: `/api/v1`

### POST `/entities/{entity_id}/vote` — Emitir veredicto

| Campo | Valor |
|-------|-------|
| **Auth** | Bearer JWT (mínimo BRONZE) |
| **Tablas DB** | `entities`, `entity_reviews`, `audit_logs` |
| **Estado** | ❌ WebSocket pulse nunca se dispara tras el voto |

**Path params:** `entity_id` (UUID)

**Body (VotePayload):**
```json
{
  "scores": {
    "transparencia": 4.5,
    "gestion": 3.0,
    "coherencia": 2.5
  }
}
```

Las keys de `scores` corresponden a `evaluation_dimensions.key` para la categoría de la entidad.
Rango válido por score: `[0.0, 5.0]`. Mínimo 1 dimensión.

**Flujo completo:**
1. Anti-brigada: consulta `entity_reviews WHERE entity_id=? AND user_id=?` → 409 si ya votó
2. Verifica entidad activa en `entities`
3. Calcula `vote_avg = mean(scores.values())`
4. Aplica fórmula Bayesiana incremental (ver [Sección 12](#12-mecánica-de-votos-y-pesos))
5. UPDATE `entities SET reputation_score=new_score, total_reviews=new_n`
6. INSERT en `entity_reviews` (best-effort, no bloquea si falla)
7. Encola `VOTE_SUBMITTED` en `audit_logs` (background task)

**Response 200:**
```json
{
  "success": true,
  "new_score": 3.42,
  "total_reviews": 128,
  "your_vote": 3.33
}
```

**Bug crítico:** `publish_verdict_pulse()` de `realtime.py` nunca se llama. Los clientes WebSocket conectados a `beacon:pulse:{entity_id}` **nunca** reciben la actualización del voto. El tiempo real está arquitecturalmente correcto pero desconectado del flujo de votos.

**Errores:**
- `401`: no autenticado
- `404`: entidad no encontrada o inactiva
- `409`: usuario ya votó por esta entidad
- `503`: error al persistir el voto en la BBDD

---

## 5. Dimensiones de Evaluación

Base path: `/api/v1`

### GET `/dimensions` — Dimensiones por categoría

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `evaluation_dimensions` |
| **Estado** | ✅ |

**Query params:**
| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `category` | string | Sí | `politico`, `periodista`, `empresario`, `empresa`, `evento` |

**Response 200:**
```json
{
  "dimensions": [
    {
      "id": "uuid",
      "key": "transparencia",
      "label": "Transparencia",
      "icon": "⚖️",
      "display_order": 1
    },
    {
      "id": "uuid",
      "key": "gestion",
      "label": "Gestión",
      "icon": "📊",
      "display_order": 2
    }
  ],
  "category": "politico"
}
```

Solo retorna dimensiones con `is_active=true`, ordenadas por `display_order`.

---

## 6. Real-Time Pulse

Base path: `/api/v1/realtime`

### WS `/pulse/{entity_id}` — WebSocket de actualización en tiempo real

| Campo | Valor |
|-------|-------|
| **Auth** | No (solo lectura) |
| **Tablas DB** | — (Redis Pub/Sub) |
| **Estado** | ⚠️ Arquitectura correcta pero sin publicador activo |

**Conexión:** `ws://<host>/api/v1/realtime/pulse/{entity_id}`

El cliente se conecta y espera mensajes. Cualquier dato enviado por el cliente es ignorado (solo lectura).

**Mensajes recibidos (tipo VERDICT_PULSE):**
```json
{
  "type": "VERDICT_PULSE",
  "entity_id": "uuid",
  "new_score": 3.4200,
  "total_votes": 128,
  "integrity_index": 0.6840,
  "is_gold_verdict": false,
  "voter_rank": "BRONZE",
  "timestamp": "2026-03-11T14:30:00.000000"
}
```

**Canal Redis:** `beacon:pulse:{entity_id}`

**Problema:** `publish_verdict_pulse()` nunca es llamado desde `votes.py` → los mensajes nunca se publican → el WebSocket permanece silencioso aunque la conexión esté activa.

**Código de cierre:** `4001` si `entity_id` tiene menos de 3 caracteres.

---

### GET `/realtime/status` — Estado del sistema Real-Time

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | — |
| **Estado** | ✅ |

**Response 200:**
```json
{
  "service": "Real-Time Pulse",
  "total_connections": 42,
  "active_rooms": 5,
  "status": "operational"
}
```

---

## 7. Admin — Entidades

Base path: `/api/v1/admin`
**Auth requerida en todos:** Bearer JWT con `role = 'admin'` en `public.users`

### GET `/admin/entities` — Listar todas las entidades

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `entities` |
| **Estado** | ✅ |

**Query params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `include_inactive` | bool | false | Incluir entidades con `is_active=false` |
| `limit` | int | 100 | Máximo 500 |
| `offset` | int | 0 | Paginación |

**Response 200:**
```json
{
  "entities": [...],
  "total": 42,
  "admin_id": "uuid-del-admin"
}
```

---

### POST `/admin/entities` — Crear entidad

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `entities`, `audit_logs` |
| **Estado** | ❌ `audit_bus.log_event()` sin `await` |

**Body (dict):**
```json
{
  "first_name": "Gabriel",
  "last_name": "Boric",
  "second_last_name": "Font",
  "category": "politico",
  "position": "Presidente de la República",
  "region": "Magallanes",
  "district": "28",
  "bio": "...",
  "party": "FA",
  "official_links": {"twitter": "@gabrielboric"},
  "change_reason": "Carga inicial de políticos"
}
```

Campos obligatorios: `first_name`, `last_name`, `category`.
Categorías válidas: `politico`, `periodista`, `empresario`, `empresa`, `evento`.

**Response 200:**
```json
{
  "status": "created",
  "entity": { ...entity_data... }
}
```

**Bug:** `audit_bus.log_event(...)` en línea 118 se llama **sin `await`** en un contexto `async def`. La llamada al AuditLogger es fire-and-forget no garantizado — el audit log puede perderse si el event loop recicla antes de ejecutarlo.

---

### PATCH `/admin/entities/{entity_id}` — Editar entidad

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `entities`, `audit_logs` |
| **Estado** | ❌ `audit_bus.log_event()` sin `await` |

**Body:** cualquier subconjunto de campos permitidos + `change_reason` (obligatorio):
```json
{
  "party": "CS",
  "bio": "Nueva bio actualizada",
  "change_reason": "Actualización post-elecciones 2026"
}
```

Campos editables: `first_name`, `last_name`, `second_last_name`, `category`, `position`, `region`, `district`, `bio`, `party`, `official_links`, `photo_path`, `is_active`.

Guarda `old_data` + `new_data` en el audit log para trazabilidad forense.

---

### DELETE `/admin/entities/{entity_id}` — Soft delete

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `entities`, `audit_logs` |
| **Estado** | ❌ `audit_bus.log_event()` sin `await` + resultado de UPDATE no verificado |

Marca `is_active=false` y `deleted_at=now()`. La entidad permanece en la BBDD.

**Response 200:**
```json
{
  "status": "soft_deleted",
  "entity_id": "uuid"
}
```

**Bug adicional:** El resultado del UPDATE (línea 246-255) no se verifica. Si el UPDATE falla silenciosamente (e.g., RLS bloqueó), retorna 200 igualmente.

---

### POST `/admin/entities/upload-photo` — Subir foto

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | Supabase Storage (bucket `imagenes`) |
| **Estado** | ❌ `audit_bus.log_event()` sin `await` |

**Body:** `multipart/form-data` con campo `file`
Tipos aceptados: `image/jpeg`, `image/png`, `image/webp`
Tamaño máximo: 5 MB

**Response 200:**
```json
{
  "url": "https://xxx.supabase.co/storage/v1/object/public/imagenes/entities/abc123.jpg",
  "path": "entities/abc123.jpg"
}
```

El `path` devuelto debe guardarse en `entities.photo_path` vía PATCH.

---

## 8. Admin — Dimensiones

Base path: `/api/v1/admin`
**Auth requerida en todos:** Admin

### GET `/admin/dimensions` — Listar dimensiones

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `evaluation_dimensions` |
| **Estado** | ✅ |

**Query params:** `category` (opcional, filtra por categoría)

**Response 200:**
```json
{
  "dimensions": [
    {
      "id": "uuid",
      "category": "politico",
      "key": "transparencia",
      "label": "Transparencia",
      "icon": "⚖️",
      "display_order": 1,
      "is_active": true,
      "created_at": "2026-02-24T13:39:32Z"
    }
  ]
}
```

---

### POST `/admin/dimensions` — Crear dimensión

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `evaluation_dimensions` |
| **Estado** | ⚠️ Sin audit log |

**Body:**
```json
{
  "category": "politico",
  "key": "honestidad",
  "label": "Honestidad",
  "icon": "🤝",
  "display_order": 4
}
```

Constraint DB: `UNIQUE(category, key)` — devuelve 500 si la combinación ya existe.

---

### PATCH `/admin/dimensions/{dim_id}` — Editar dimensión

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `evaluation_dimensions` |
| **Estado** | ⚠️ Sin audit log |

Campos editables: `label`, `icon`, `display_order`, `is_active`.

---

### DELETE `/admin/dimensions/{dim_id}` — Eliminar dimensión

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `evaluation_dimensions` |
| **Estado** | ❌ Sin audit log, sin verificación de existencia, siempre retorna 200 |

**Advertencia:** A diferencia de `entities`, esta es una **eliminación permanente** (hard delete). Los `entity_reviews` que referenciaban esta dimensión por `key` quedan huérfanos conceptualmente (no hay FK hacia `evaluation_dimensions`).

**Response 200:**
```json
{"status": "deleted", "id": "uuid"}
```

Retorna 200 incluso si el `dim_id` no existe.

---

## 9. Admin — Stats

Base path: `/api/v1/admin`

### GET `/admin/stats` — Métricas del sistema

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `entities`, `users`, `entity_reviews`, `audit_logs` |
| **Estado** | ⚠️ Trae ALL rows de 3 tablas a Python para agregar en memoria |

**Response 200:**
```json
{
  "total_entities": 150,
  "active_entities": 148,
  "inactive_entities": 2,
  "total_users": 1234,
  "total_votes": 8920,
  "shadow_banned": 12,
  "by_category": {
    "politico": 80,
    "periodista": 35,
    "empresario": 33
  },
  "by_rank": {
    "BRONZE": 900,
    "SILVER": 300,
    "GOLD": 30,
    "DIAMOND": 4
  },
  "top_by_score": [
    {
      "id": "uuid",
      "name": "Juan Pérez",
      "score": 4.87,
      "reviews": 234,
      "photo": "https://...",
      "category": "politico"
    }
  ],
  "top_by_reviews": [...],
  "recent_audit": [
    {
      "id": "uuid",
      "action": "OVERLORD_ACTION_CREATE_ENTITY",
      "table_name": "ENTITY",
      "label": "Gabriel Boric",
      "created_at": "2026-03-11T14:00:00Z",
      "_raw": {...}
    }
  ]
}
```

**Issue de performance:** Las 3 queries principales traen `SELECT *` de `entities`, `users` y `entity_reviews` sin `LIMIT`. A escala (100k+ usuarios) esto es un problema de memoria y latencia. Fix: usar `COUNT(*)`, `AVG()` y `SUM()` directamente en Supabase.

---

## 10. Admin — AUM

Base path: `/api/v1/admin`

### GET `/admin/aum` — Assets Under Management

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `users` |
| **Estado** | ⚠️ Fallback a datos demo hardcodeados expuesto en producción |

**Response 200:**
```json
{
  "status": "success",
  "data": {
    "total_usd": 14250.50,
    "user_count": 1234,
    "avg_value": 11.55,
    "by_tier": {
      "BRONZE": 450.00,
      "SILVER": 5000.00,
      "GOLD": 7500.00,
      "DIAMOND": 1300.50
    }
  },
  "source": "SUPABASE_LIVE"
}
```

Cuando falla la consulta a Supabase, `source` cambia a `"DEMO_DATA"` y retorna 4 usuarios ficticios. Este fallback silencioso puede engañar a admins en producción.

**Fórmula AUM** (ver [Sección 12](#12-mecánica-de-votos-y-pesos) para detalle completo):
```
valor_usuario = (base_tier × integrity_multiplier) + data_bonus + rut_bonus
```

---

## 11. Admin — Audit Logs

Base path: `/api/v1/admin`

### GET `/admin/audit-logs` — Visor con paginación

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `audit_logs` |
| **Estado** | ✅ |

**Query params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `limit` | int | 50 | Máximo 200 |
| `offset` | int | 0 | Paginación |
| `action` | string | — | Filtrar por tipo de acción exacto |
| `entity_type` | string | — | Filtrar por tipo de entidad |

Usa `count=exact` de Supabase → el campo `total` es el conteo real de la tabla.

**Response 200:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "actor_id": "uuid-del-admin",
      "action": "OVERLORD_ACTION_CREATE_ENTITY",
      "entity_type": "ENTITY",
      "entity_id": "uuid",
      "details": {...},
      "created_at": "2026-03-11T14:00:00Z",
      "_label": "Gabriel Boric"
    }
  ],
  "total": 5420,
  "limit": 50,
  "offset": 0
}
```

---

### GET `/admin/audit-logs/actions` — Tipos de acción distintos

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `audit_logs` |
| **Estado** | ⚠️ Trae ALL rows para DISTINCT en Python |

**Response 200:**
```json
{
  "actions": [
    "ENTITY_CREATED",
    "OVERLORD_ACTION_CREATE_ENTITY",
    "OVERLORD_ACTION_DELETE_ENTITY",
    "OVERLORD_ACTION_UPDATE_ENTITY",
    "OVERLORD_ACTION_UPLOAD_PHOTO",
    "PROFILE_DEMOGRAPHIC_UPDATED",
    "RUT_DUPLICATE_ATTEMPT",
    "RUT_VALIDATION_FAILED",
    "USER_RANK_CHANGED",
    "USER_VERIFIED_RUT",
    "VOTE_SUBMITTED"
  ]
}
```

**Fix recomendado:** `SELECT DISTINCT action FROM audit_logs ORDER BY action` — un solo query SQL, sin traer filas a Python.

---

## 12. Mecánica de Votos y Pesos

> **Sistema vigente desde migración 014:** v1 — Media ponderada acumulada con rangos BASIC/VERIFIED.
> El prior Bayesiano y el decay temporal están diferidos a v4.0.

### 12.1 Fórmula de Reputation Score (v1 — vigente)

**Media ponderada acumulada** con `effective_weight` por usuario.

**Voto nuevo:**
```
vote_avg = mean(scores.values())
effective_weight = VOTE_WEIGHT_{rank} × vote_penalty

new_score = (old_score × old_n + vote_avg × effective_weight)
            ─────────────────────────────────────────────────
                      (old_n + effective_weight)
```

**Reemplazo de voto (tras expirar time-lock):**
```
new_score = (old_score × old_n - old_vote_avg × old_eff_weight + vote_avg × new_eff_weight)
            ─────────────────────────────────────────────────────────────────────────────────
                                         old_n
```

**Ejemplo (primera votación, usuario VERIFIED):**
```
old_score = 3.0, old_n = 0
vote_avg = 4.0, effective_weight = 1.0

new_score = (3.0 × 0 + 4.0 × 1.0) / (0 + 1.0) = 4.0
new_n = 1
```

**Ejemplo (segunda votación, usuario BASIC):**
```
old_score = 4.0, old_n = 1
vote_avg = 2.0, effective_weight = 0.5

new_score = (4.0 × 1 + 2.0 × 0.5) / (1 + 0.5) = 5.0 / 1.5 = 3.333
```

### 12.2 Pesos por Rango de Votante (IMPLEMENTADO desde migración 014)

`votes.py` consulta `config_params` para leer el peso por rango:

| Rango | `config_params` | Estado |
|-------|----------------|--------|
| BASIC | `VOTE_WEIGHT_BASIC = 0.5` | ✅ Activo |
| VERIFIED | `VOTE_WEIGHT_VERIFIED = 1.0` | ✅ Activo |

**vote_penalty:** Columna `users.vote_penalty` (DEFAULT 1.0). Multiplicador controlado por el Overlord.
```
effective_weight = rank_weight × vote_penalty
```
- VERIFIED sin penalización: `1.0 × 1.0 = 1.0`
- VERIFIED sancionado: `1.0 × 0.3 = 0.3`
- BASIC bloqueado: `0.5 × 0.0 = 0.0`

### 12.3 Time-lock de Votos

| Parámetro | Valor actual | Descripción |
|-----------|-------------|-------------|
| `VOTE_EDIT_LOCK_DAYS` | `30` | Días hasta poder modificar un voto |

- Primer voto: INSERT en `entity_reviews`
- Re-voto antes del plazo: HTTP **423 Locked** + `unlock_date`
- Re-voto después del plazo: UPSERT en `entity_reviews` (reemplaza voto anterior)

### 12.4 Decay Temporal (PENDIENTE — v4.0)

`config_params.DECAY_HALF_LIFE_DAYS = 180` está definido pero sin job/cron que lo aplique.

### 12.5 Fórmula Bayesiana (PENDIENTE — v4.0)

Prior Bayesiano `m=30, C=3.0` definido en `voting_weight_system.md §9` pero no implementado en `votes.py`.

### 12.6 Valor USD del Ciudadano (UserAssetCalculator)

Fórmula para el endpoint `/admin/aum`:

```
valor_usd = (base_tier × multiplier) + data_bonus + rut_bonus
```

**Base por tier (sistema 2 rangos):**
| Rango | Base USD |
|-------|----------|
| BASIC | $0.50 |
| VERIFIED | $5.00 |

**Multiplicador de integridad:**
```
multiplier = integrity_score × 1.2
```

**Data bonus (Mina de Oro B2B):**
| Condición | Bonus |
|-----------|-------|
| `commune` Y `age_range` presentes | +$5.00 |
| Solo `commune` O `age_range` | +$2.00 |
| `region` presente | +$1.00 adicional |
| `rut_hash` presente | +$3.00 |

### 12.7 Mecánica de Rangos (Sistema v2 — BASIC/VERIFIED)

| Rango | Requisito | Peso de voto |
|-------|-----------|-------------|
| BASIC | Registro + email confirmado | 0.5x |
| VERIFIED | RUT + birth_year + country + region + commune | 1.0x |

**Promoción automática:** `_evaluate_rank()` se llama tras cada update de perfil o verificación de RUT. Si los 5 campos están completos → VERIFIED instantáneo, sin intervención manual.

---

## 7. Polls (Encuestas Ciudadanas)

Base path: `/api/v1/polls`

> **Actualizado:** 2026-04-12. Refleja Fase 1–3: 4 preguntas, tipos multiple_choice/scale/ranking, duración 1–30 días, labels de escala, cross-tabs demográficos.

### GET `/` — Listar encuestas

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `polls`, `poll_votes` |
| **Estado** | ✅ Implementado |

**Query params:** `category` (string), `search` (string)

**Ordenamiento:** por `total_votes` descendente (más votadas primero).

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "¿Cómo calificas la gestión del Presidente?",
      "description": "Contexto editorial visible al ciudadano",
      "poll_type": "scale",
      "questions": [
        {
          "text": "¿Cómo evalúas la gestión?",
          "type": "scale",
          "scale_min": 1,
          "scale_max": 7,
          "scale_labels": ["Muy mal", "", "", "Regular", "", "", "Muy bien"],
          "order_index": 0
        }
      ],
      "starts_at": "2026-04-07T00:00:00Z",
      "ends_at": "2026-04-14T23:59:59Z",
      "is_open": true,
      "total_votes": 1523,
      "verified_votes": 890,
      "basic_votes": 633,
      "results": [{"average": 3.8, "count": 1523}],
      "results_verified": [{"average": 4.1, "count": 890}],
      "category": "politica",
      "requires_auth": true
    }
  ],
  "total": 12
}
```

### POST `/` — Crear encuesta

| Campo | Valor |
|-------|-------|
| **Auth** | JWT (requiere rank VERIFIED) |
| **Tablas DB** | `polls` |
| **Estado** | ✅ Implementado |

**Límites:** máx. 4 preguntas, duración 1–30 días.

**Body (UserPollCreateIn):**
```json
{
  "title": "¿Qué prioridad tiene para ti?",
  "description": "Contexto editorial visible al ciudadano antes de responder",
  "category": "educacion",
  "ends_in_days": 14,
  "questions": [
    {
      "text": "Ordena de mayor a menor prioridad",
      "type": "ranking",
      "options": ["Educación", "Salud", "Seguridad", "Economía"]
    },
    {
      "text": "¿Cuán satisfecho estás con el sistema de salud?",
      "type": "scale",
      "scale_points": 7,
      "scale_labels": ["Muy insatisfecho/a", "", "", "Neutro", "", "", "Muy satisfecho/a"]
    },
    {
      "text": "¿Qué área necesita más inversión?",
      "type": "multiple_choice",
      "options": ["Infraestructura", "Capital humano", "Tecnología"],
      "allow_multiple": false
    }
  ]
}
```

**Tipos de pregunta:**

| Tipo | Descripción | Campos requeridos | Límites |
|------|-------------|-------------------|---------|
| `multiple_choice` | Radio o checkboxes | `options` (array), `allow_multiple` | mín. 2 opciones |
| `scale` | Escala numérica | `scale_points` (2–10), `scale_labels` (opcional, length == scale_points) | — |
| `ranking` | Drag-and-drop ordenado | `options` (array) | mín. 3, máx. 6 opciones |

### GET `/{id}` — Detalle + resultados

| Campo | Valor |
|-------|-------|
| **Auth** | No (opcional para resultados verificados) |
| **Tablas DB** | `polls`, `poll_votes` |
| **Estado** | ✅ Implementado |

Devuelve el poll con `results` (todos los votos) y `results_verified` (solo VERIFIED).

**Resultados según tipo:**
- `multiple_choice`: `[{option, count, pct}]` por opción
- `scale`: `[{average, count}]`
- `ranking`: `[{option, borda_score, avg_position, first_place_pct, count}]` — ordenado por Borda desc

> **Convención ranking:** posiciones 1-based en toda la API. `avg_position: 1.0` = siempre en primer lugar.

### GET `/{id}/crosstabs` — Análisis demográfico

| Campo | Valor |
|-------|-------|
| **Auth** | No (recomendado solo para admins en UI) |
| **Tablas DB** | `poll_votes`, `users` |
| **Estado** | ✅ Implementado |

**Query params:**
- `dimension`: `region` (default) | `commune` | `age` | `country`
- `question_index`: int (default `0`) — índice de pregunta en encuestas multi-pregunta

**Solo votos VERIFIED** con `user_id` no nulo. Grupos con `n < 5` suprimidos (privacidad).

**Response 200:**
```json
{
  "poll_id": "uuid",
  "dimension": "region",
  "question_index": 0,
  "total_verified_votes": 890,
  "suppressed_groups": 2,
  "min_group_size": 5,
  "results": [
    {
      "group": "Metropolitana",
      "n": 420,
      "breakdown": [
        {"option": "Educación", "avg_position": 1.4, "first_place_pct": 52.0},
        {"option": "Salud",     "avg_position": 2.1, "first_place_pct": 28.0}
      ]
    }
  ]
}
```

**Breakdown según tipo de pregunta:**
- `multiple_choice`: `{option, count, pct}`
- `scale`: `{option (punto), count, pct}` + `average` en el grupo
- `ranking`: `{option, avg_position, first_place_pct}` — ordenado por `avg_position` asc

### POST `/{id}/vote` — Votar

| Campo | Valor |
|-------|-------|
| **Auth** | JWT (o `anon_session_id` si `requires_auth=false`) |
| **Tablas DB** | `poll_votes` |
| **Estado** | ✅ Implementado |

**Body (PollVotePayload):**
```json
{
  "option_value": "Educación||Salud||Seguridad||Economía",
  "anon_session_id": "uuid-del-navegador"
}
```

**Formato de `option_value` según tipo:**
- `multiple_choice`: string simple (`"Sí"`) o múltiple (`"Sí||No sé"`)
- `scale`: string numérico (`"5"`)
- `ranking`: opciones separadas por `||` en orden de preferencia (`"Edu||Salud||Eco"`) — **ranking completo obligatorio**

### GET `/my` — Encuestas donde el usuario ya participó

| Campo | Valor |
|-------|-------|
| **Auth** | JWT requerido |
| **Tablas DB** | `poll_votes`, `polls` |
| **Estado** | ✅ Implementado |

---

## 8. Versus (VS Head-to-Head)

Base path: `/api/v1/versus`

### GET `/` — Listar versus activos

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `versus`, `versus_votes` |
| **Estado** | ✅ Implementado (en desarrollo) |

**Response 200:**
```json
{
  "versus": [
    {
      "id": "uuid",
      "title": "Alcalde A vs Alcalde B",
      "entity_a_id": "uuid",
      "entity_b_id": "uuid",
      "starts_at": "2026-04-07T00:00:00Z",
      "ends_at": "2026-04-14T23:59:59Z",
      "votes_a": 342,
      "votes_b": 289,
      "is_open": true
    }
  ]
}
```

### POST `/{id}/vote` — Votar en versus

| Campo | Valor |
|-------|-------|
| **Auth** | JWT |
| **Tablas DB** | `versus_votes`, `audit_logs` |
| **Estado** | ✅ Implementado |

**Body (VersusVotePayload):**
```json
{
  "voted_for": "A"
}
```

Nota: `voted_for` es "A" o "B". Un voto por usuario por versus (anti-brigada vía UNIQUE constraint).

---

## 9. Events (Eventos con Participantes)

Base path: `/api/v1/events`

### GET `/` — Listar eventos activos

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `events`, `event_participants`, `event_votes` |
| **Estado** | ✅ Implementado |

**Response 200:**
```json
{
  "events": [
    {
      "id": "uuid",
      "title": "Debate Presidencial 2026",
      "location": "Estadio Nacional",
      "starts_at": "2026-04-15T20:00:00Z",
      "ends_at": "2026-04-15T22:00:00Z",
      "participants": [
        {
          "entity_id": "uuid",
          "entity_name": "Candidato X",
          "avg_score": 4.2,
          "total_votes": 512
        }
      ]
    }
  ]
}
```

### POST `/{id}/vote` — Votar en evento

| Campo | Valor |
|-------|-------|
| **Auth** | JWT |
| **Tablas DB** | `event_votes`, `audit_logs` |
| **Estado** | ✅ Implementado |

**Body (EventVotePayload):**
```json
{
  "entity_id": "uuid",
  "score": 4.5
}
```

Nota: Score 1.0–5.0. Un voto por usuario por entidad por evento (UNIQUE constraint).

---

## Relación APIs ↔ Base de Datos

```
auth.users (Supabase Auth — gestionado internamente)
    │ id (implícito, mismo UUID que public.users.id)
    ▼
public.users
    │ id ──────────────────────────────────┐
    │                                       │
    ▼                                       ▼
public.entity_reviews              public.audit_logs
    │ entity_id                     (actor_id: TEXT, sin FK
    │ (ON DELETE CASCADE)            permite 'SYSTEM' y UUIDs)
    ▼
public.entities
    │ category ─────────────────────────────┐
    │                                        ▼
    │                          public.evaluation_dimensions
    │                          (relación conceptual por 'key',
    │                           sin FK — entity_reviews guarda
    │                           el score total, no por dimensión)
    └──────► public.audit_logs
             (entity_id: TEXT, sin FK — preserva logs de
              entidades eliminadas)

public.config_params (standalone — configuración dinámica)
```

**Nota sobre `config_params`:** Los valores `VOTE_WEIGHT_*` y `DECAY_HALF_LIFE_DAYS` están definidos pero ningún endpoint los consume actualmente.

---

## Acciones de Audit Log

| Acción | Origen | Datos en `details` |
|--------|--------|---------------------|
| `ENTITY_CREATED` | Trigger SQL `fn_audit_entity_creation` | `entity_name`, `entity_type`, `service_tags`, `is_verified`, `ip_context` |
| `OVERLORD_ACTION_CREATE_ENTITY` | `admin/entities POST` | `new_data`, `change_reason` |
| `OVERLORD_ACTION_UPDATE_ENTITY` | `admin/entities PATCH` | `old_data`, `new_data`, `change_reason` |
| `OVERLORD_ACTION_DELETE_ENTITY` | `admin/entities DELETE` | `old_data`, `soft_deleted: true` |
| `OVERLORD_ACTION_UPLOAD_PHOTO` | `admin/entities/upload-photo` | `filename`, `size_bytes`, `content_type` |
| `USER_VERIFIED_RUT` | `verify-identity POST` | `previous_rank`, `new_rank`, `new_integrity_score` |
| `USER_RANK_CHANGED` | `verify-identity POST` | `from`, `to`, `reason` |
| `RUT_VALIDATION_FAILED` | `verify-identity POST` | `reason: INVALID_CHECK_DIGIT` |
| `RUT_DUPLICATE_ATTEMPT` | `verify-identity POST` | `existing_user_id`, `alert: POSSIBLE_MULTI_ACCOUNT` |
| `VOTE_SUBMITTED` | `entities/{id}/vote POST` | `vote_avg`, `scores`, `new_score`, `total_reviews` |
| `PROFILE_DEMOGRAPHIC_UPDATED` | `profile PUT` | `fields_updated`, `fields_count` |


---

## 13. Admin — Polls

> Requiere rol admin. Auth: Bearer JWT con `role = admin`.

### POST `/admin/polls/ingest` ✅

**Endpoint nativo para el pipeline de agentes (AGENTE_05 / PUBLISHER).** Acepta el schema del agente directamente — sin transformación externa. El backend normaliza internamente y registra el audit trail del pipeline.

| Campo | Valor |
|-------|-------|
| **Auth** | `PIPELINE_API_KEY` (Bearer token, no JWT de usuario) |
| **Tabla DB** | `polls` + `audit_log` |
| **Estado** | ✅ |

**Auth M2M (machine-to-machine):** Este endpoint NO usa JWT de usuario. Se autentica con `PIPELINE_API_KEY` definida en `.env` del backend. El pipeline envía `Authorization: Bearer <PIPELINE_API_KEY>`.

```bash
# Ejemplo de llamada desde el pipeline
curl -X POST https://beaconchile.cl/api/v1/admin/polls/ingest \
  -H "Authorization: Bearer $PIPELINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d @payload.json
```

**Request body (`AgentPollIn`):**
```json
{
  "title": "¿Cómo ves la economía chilena en abril?",
  "context": "Texto contextual neutral...",
  "category": "economia",
  "duration_days": 7,
  "tags": ["inflacion", "costo-de-vida"],
  "is_active": true,
  "header_image_query": "Gasoline pump rising prices",
  "questions": [
    {
      "text": "¿Cómo describes la situación económica?",
      "question_type": "single_choice",
      "options": ["Mejora", "Igual", "Empeora"]
    },
    {
      "text": "Expectativa para los próximos 3 meses (1-7)",
      "question_type": "scale",
      "scale_points": 7,
      "scale_labels": ["Muy pesimista", "Pesimista", "Algo pesimista", "Neutral", "Algo optimista", "Optimista", "Muy optimista"]
    },
    {
      "text": "¿Qué factores afectan tu percepción? (hasta 3)",
      "question_type": "multiple_choice",
      "options": ["Combustibles", "Inflación en alimentos", "Salarios", "Empleo"]
    }
  ],
  "metadata": {
    "idea_id": "IDEA-003",
    "confidence_score": 96,
    "variante_generator": "A",
    "sources": ["CADEM (05/04/2026)", "Cooperativa.cl (11/04/2026)"],
    "curated_by": "CURATOR AGENTE_02",
    "verified_by": "VERIFIER AGENTE_03",
    "generated_by": "GENERATOR AGENTE_04",
    "overlord_selection": "VARIANTE A"
  }
}
```

**Transformaciones internas:**
| Campo agente | → | Campo interno |
|---|---|---|
| `question_type: "single_choice"` | → | `type: "multiple_choice"`, `allow_multiple: false` |
| `question_type: "multiple_choice"` | → | `type: "multiple_choice"`, `allow_multiple: true` |
| `question_type: "scale"` | → | `type: "scale"` |
| `duration_days: 7` | → | `starts_at: now`, `ends_at: now + 7d` |
| `is_active: true` | → | `status: "active"` |
| `metadata` | → | `audit_log` (acción `AGENT_PIPELINE_INGEST_POLL`) |

**Response 201:**
```json
{ "poll": { "id": "uuid", "slug": "como-ves-la-economia-...", ... }, "ingested_from": "agent_pipeline" }
```

---

### POST `/admin/polls` ✅

Crea una encuesta desde la UI admin (schema del formulario web).

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tabla DB** | `polls` |
| **Estado** | ✅ |

**Request body (`PollCreateIn`):**
```json
{
  "title": "string (1–300)",
  "context": "string | null",
  "description": "string | null",
  "tags": ["string"],
  "category": "general|politica|economia|salud|educacion|espectaculos|deporte|cultura|seguridad|justicia",
  "starts_at": "ISO 8601",
  "ends_at": "ISO 8601",
  "status": "draft|active|paused|closed",
  "is_featured": false,
  "requires_auth": true,
  "header_image": "URL | null",
  "questions": [
    {
      "text": "string",
      "type": "multiple_choice|scale",
      "allow_multiple": false,
      "options": ["string"],
      "scale_points": 5,
      "scale_labels": ["Muy malo", "", "", "", "Muy bueno"]
    }
  ]
}
```

**Tipos de pregunta:**

| `type` | `allow_multiple` | UI label | Descripción |
|--------|-----------------|----------|-------------|
| `multiple_choice` | `false` | Única | Radio (selección única) |
| `multiple_choice` | `true` | Múltiple | Checkboxes (varias opciones) |
| `scale` | — | Escala | Escala numérica 2–10 puntos |

**Escala — campos:**
- `scale_points` (int 2–10): número de puntos de la escala
- `scale_labels` (array, len == scale_points): etiqueta por punto. Vacío permitido.
- `scale_min_label` / `scale_max_label`: alternativa legacy (solo extremos).

**Response 201:**
```json
{ "poll": { "id": "uuid", "slug": "auto-generado", ... } }
```

**Categorías válidas (backend + frontend):**
`general`, `politica`, `economia`, `salud`, `educacion`, `espectaculos`, `deporte`, `cultura`, `seguridad`, `justicia`

---

### GET `/admin/polls` ✅

Lista todas las encuestas (todas las categorías, sin filtro de status).

---

### PATCH `/admin/polls/{id}` ✅

Actualiza campos parciales. Acepta los mismos campos que POST excepto `questions` completo.

---

### DELETE `/admin/polls/{id}` ✅

Elimina encuesta. Genera audit log `OVERLORD_ACTION_DELETE_POLL`.

---

### POST `/admin/polls/upload-image` ✅

Sube imagen de cabecera al bucket `encuestas` en Supabase Storage.

| Campo | Valor |
|-------|-------|
| **Content-Type** | `multipart/form-data` |
| **Formatos** | JPEG, PNG, WEBP |
| **Límite** | 5 MB |

**Response 200:**
```json
{ "url": "https://...supabase.../encuestas/covers/abc123.jpg", "path": "covers/abc123.jpg" }
```

---

### GET `/admin/polls/analytics/voters` ✅

Ranking de usuarios por votos en encuestas, filtrable por período.

| Query param | Tipo | Descripción |
|-------------|------|-------------|
| `from_date` | ISO 8601 | Fecha inicio (opcional) |
| `to_date`   | ISO 8601 | Fecha fin (opcional) |

---

## Pipeline de Agentes

**Flujo de publicación nativo:** AGENTE_05 (PUBLISHER) hace un `POST /api/v1/admin/polls/ingest` con su payload directamente. El backend transforma, valida y persiste sin intermediarios.

```
SCRAPER → CURATOR → VERIFIER → GENERATOR → [Overlord aprueba] → PUBLISHER → POST /admin/polls/ingest
```

El endpoint `/ingest` registra el `metadata` del pipeline en `audit_log` con acción `AGENT_PIPELINE_INGEST_POLL` para trazabilidad forense completa.

> `publish_polls.py` (raíz del repo) existe como utilidad de emergencia/fallback para publicación manual desde archivo `.md`.
