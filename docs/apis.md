# BEACON Protocol — Documentación de APIs

> **Generado:** 2026-03-11 · **Última actualización:** 2026-03-11 (sprint P0+P1+P2)
> **Proyecto creado:** 2026-02-24
> **Base URL:** `https://<host>/api/v1`
> **Formato:** JSON (application/json)
> **Auth:** Bearer JWT emitido por Supabase Auth

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
12. [Admin — Decay](#12-admin--decay)
13. [Mecánica de Votos y Pesos](#13-mecánica-de-votos-y-pesos)

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
3. Registro en Supabase Auth + inserción en `public.users` con `rank=BRONZE`, `integrity_score=0.5`

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

**Issue pendiente:** El DNA Scanner no persiste su análisis forense en `audit_logs` al registrar un `HUMAN`. Solo guarda rechazos. Los intentos `SUSPICIOUS` no generan log.

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
    "rank": "BRONZE",
    "integrity_score": 0.5,
    "reputation_score": 0.0,
    "is_verified": false,
    "role": "user"
  }
}
```

**Bug conocido:** El bloque `except Exception as e` en línea 234 captura toda excepción y la expone en el detalle del 401. Si Supabase devuelve un error con información sensible, se filtra al cliente.

---

### POST `/verify-identity` — Ascensión BRONZE → SILVER

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
1. Validación Módulo 11 del dígito verificador (acepta formatos: `12.345.678-9`, `12345678-9`, `123456789`)
2. `hash_rut(rut)` → SHA-256 con salt desde `settings.RUT_SALT` → `rut_hash`
3. Unicidad: consulta `users WHERE rut_hash = ?` → si duplicado, registra `RUT_DUPLICATE_ATTEMPT` en audit
4. UPDATE en `users`: `rut_hash=hash`, `is_verified=true`, `verification_level=2`, `rank=SILVER`, `integrity_score=0.75`
5. Registra `USER_VERIFIED_RUT` + `USER_RANK_CHANGED` en `audit_logs`

**Response 200:**
```json
{
  "status": "success",
  "new_rank": "SILVER",
  "integrity_score": 0.75,
  "message": "¡Bienvenido, Ciudadano de Plata! Tu voto ahora pesa 1.5x..."
}
```

**Notas:**
- El RUT en texto plano **NUNCA** se almacena; se descarta tras el hash
- El mensaje menciona "tu voto pesa 1.5x" pero esta multiplicación **no está implementada** en `votes.py` (ver [Sección 12](#12-mecánica-de-votos-y-pesos))

**Errores:**
- `400`: RUT con dígito verificador inválido o RUT duplicado en el sistema

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
  "rank": "BRONZE",
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
| **Estado** | ✅ Fix PR-3 (2026-03-10) |

**Body (UserProfileUpdate):**
```json
{
  "commune": "Providencia",
  "region": "Metropolitana",
  "age_range": "25-34"
}
```

**Fix aplicado (PR-3):** Eliminados `commune=` y `region=` del callsite en `auth.py`. La firma real del servicio en `identity_service.py` es `update_demographic_profile(user_id, age_range=None)`. Ya no lanza `TypeError`.

**Boost de integridad:**
- `+0.02` por cada campo entregado (`age_range`)
- Máximo capped a `1.0`
- Registra `PROFILE_DEMOGRAPHIC_UPDATED` en `audit_logs`

**Errores:**
- `400`: validación Pydantic o error de DB
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
| **Estado** | ✅ Fix PR-5 (2026-03-10) |

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

**Fix aplicado (PR-5):** `is_verified` y `rank` hardcodeados eliminados. Ahora se leen directamente desde la DB. `integrity_index` sigue siendo derivado de `reputation_score` — pendiente P4.

**Columnas que usa de `entities`:**
`id`, `first_name`, `last_name`, `second_last_name`, `category`, `position`, `region`, `district`, `bio`, `party`, `photo_path`, `official_links`, `is_active`, `reputation_score`, `total_reviews`

---

### GET `/entities/{entity_id}` — Detalle de entidad

| Campo | Valor |
|-------|-------|
| **Auth** | No |
| **Tablas DB** | `entities` |
| **Estado** | ✅ Fix PR-5 (2026-03-10) |

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
| **Estado** | ✅ Fix PR-1 + PR-2 (2026-03-10) |

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
  "your_vote": 3.33,
  "vote_weight": 1.5
}
```

**Fixes aplicados:**
- **PR-1:** `vote_weight` leído desde `config_params` por rango (`VOTE_WEIGHT_BRONZE/SILVER/GOLD/DIAMOND`). Fallback `1.0` si Redis/DB no responde. El campo `vote_weight` se expone en el response y en `audit_logs`.
- **PR-2:** `background_tasks.add_task(publish_verdict_pulse, ...)` ejecutado tras UPDATE exitoso. Los clientes WebSocket en `beacon:pulse:{entity_id}` ya reciben actualizaciones en tiempo real.

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

**Fix PR-2:** `publish_verdict_pulse()` ahora es llamado via `background_tasks` desde `votes.py` tras cada UPDATE exitoso → los mensajes se publican en `beacon:pulse:{entity_id}` → clientes WebSocket reciben actualizaciones en tiempo real.

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
| **Estado** | ✅ Fix PR-4 (2026-03-10) |

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

**Fix aplicado (PR-4):** `audit_logger.alog_event()` es ahora `async` y se llama con `await`. El audit log ya no es fire-and-forget — está garantizado antes de retornar la respuesta.

---

### PATCH `/admin/entities/{entity_id}` — Editar entidad

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `entities`, `audit_logs` |
| **Estado** | ✅ Fix PR-4 (2026-03-10) |

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
| **Estado** | ✅ Fix PR-4 (2026-03-10) |

Marca `is_active=false` y `deleted_at=now()`. La entidad permanece en la BBDD.

**Response 200:**
```json
{
  "status": "soft_deleted",
  "entity_id": "uuid"
}
```

**Nota:** El resultado del soft-delete UPDATE no se verifica explícitamente — si RLS bloquea silenciosamente, aún retorna 200. Pendiente PR futuro.

---

### POST `/admin/entities/upload-photo` — Subir foto

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | Supabase Storage (bucket `imagenes`) |
| **Estado** | ✅ Fix PR-4 (2026-03-10) |

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
| **Estado** | ✅ Fix PR-7 (2026-03-10) |

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

**Fix aplicado (PR-7):** `entity_reviews` usa `count="exact"` + `limit(0)` — PostgREST retorna solo el COUNT sin traer filas. `users` consulta rank/is_shadow_banned con `count="exact"`. Cero filas traídas a Python para agregaciones.

---

## 10. Admin — AUM

Base path: `/api/v1/admin`

### GET `/admin/aum` — Assets Under Management

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `users` |
| **Estado** | ✅ Fix PR-6 (2026-03-10) |

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

**Fix aplicado (PR-6):** Demo data eliminado. Si Supabase falla, retorna `503 Service Unavailable` con `{"detail": "AUM service temporarily unavailable"}`. Cuando funciona, `source: "SUPABASE_LIVE"` confirma que los datos son reales.

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

## 12. Admin — Decay

Base path: `/api/v1/admin`
**Auth requerida en todos:** Bearer JWT con `role = 'admin'`

### GET `/admin/decay/preview` — Dry-run del decay

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `entities`, `config_params` |
| **Estado** | ✅ Nuevo (PR-12, 2026-03-10) |

**Query params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `min_days` | int | 30 | Mínimo días de inactividad para aplicar decay |

**Response 200:** mismo contrato que `/admin/decay/run` pero con `dry_run: true` y `total_modified: 0`. Muestra qué cambiaría sin modificar la DB.

---

### POST `/admin/decay/run` — Ejecutar decay

| Campo | Valor |
|-------|-------|
| **Auth** | Admin |
| **Tablas DB** | `entities`, `config_params`, `audit_logs` |
| **Estado** | ✅ Nuevo (PR-12, 2026-03-10) |

**Query params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `min_days` | int | 30 | Mínimo días de inactividad |

**Response 200:**
```json
{
  "dry_run": false,
  "half_life_days": 180.0,
  "min_days_threshold": 30,
  "total_processed": 150,
  "total_eligible": 12,
  "total_modified": 12,
  "total_errors": 0,
  "changes": [
    {
      "entity_id": "uuid",
      "old_score": 4.5,
      "new_score": 3.75,
      "elapsed_days": 180.0,
      "delta": -0.75
    }
  ],
  "ran_at": "2026-03-11T03:00:00Z"
}
```

**Cron recomendado:** `0 3 * * *` (3 AM diario) via `scripts/run_decay.py`

**Fórmula de decay:**
```
new_score = C + (old_score − C) × exp(−ln(2) × elapsed_days / half_life)
```
Donde `C = 3.0` (prior Bayesiano) y `half_life = DECAY_HALF_LIFE_DAYS` desde `config_params`.

**Solo afecta entidades con:**
- `last_reviewed_at IS NOT NULL` (tienen al menos un voto)
- `is_active = true`
- `elapsed_days >= min_days`
- `|new_score - old_score| > 0.001` (cambio significativo)

**Audit log:** Registra `REPUTATION_DECAY_APPLIED` por cada entidad modificada con `actor_id: "SYSTEM"`.

---

## 13. Mecánica de Votos y Pesos

### 13.1 Fórmula Bayesiana del Reputation Score

Toda entidad tiene un `reputation_score` en escala `[0, 5]` calculado con estimación Bayesiana incremental.

**Parámetros del prior:**
| Parámetro | Valor | Significado |
|-----------|-------|-------------|
| `m` | 30 | Peso del prior (equivale a "30 votos imaginarios") |
| `C` | 3.0 | Media neutral del prior (punto medio de la escala) |

**Default al crear entidad:** `reputation_score = 3.0` (el prior puro, sin ningún voto real).

**Al recibir un voto nuevo:**

```
Paso 1: Promedio del veredicto multidimensional
  vote_avg = mean(scores.values())
  Ejemplo: {"transparencia": 4.5, "gestion": 3.0, "coherencia": 2.5}
  vote_avg = (4.5 + 3.0 + 2.5) / 3 = 3.333

Paso 2: Revertir Bayesiano al raw_sum acumulado
  Si old_n > 0:
    raw_sum = old_score × (m + old_n) - m × C
  Si old_n == 0:
    raw_sum = 0.0

Paso 3: Incorporar nuevo voto
  new_n = old_n + 1
  new_raw_sum = raw_sum + vote_avg

Paso 4: Nuevo score Bayesiano
  new_score = (m × C + new_raw_sum) / (m + new_n)
  new_score = clamp(new_score, 0.0, 5.0), round(4 decimales)
```

**Ejemplo completo (primera votación):**
```
old_score = 3.0 (prior), old_n = 0
vote_avg = 4.0
raw_sum = 0.0 (old_n == 0)
new_n = 1
new_raw_sum = 0.0 + 4.0 = 4.0
new_score = (30 × 3.0 + 4.0) / (30 + 1) = 94.0 / 31 = 3.0323
```

**Propiedad clave:** Con `m=30`, se necesitan muchos votos para mover el score significativamente. Un solo voto de 5.0 solo sube el score de 3.0 a 3.065. Esto evita que una entidad nueva sea manipulada por pocos votos.

### 13.2 Pesos por Rango de Votante

La tabla `config_params` define multiplicadores de voto por rango:

| Rango | Multiplicador (`config_params`) | Estado |
|-------|--------------------------------|--------|
| BRONZE | `1.0` | ✅ Implementado (PR-1, 2026-03-10) |
| SILVER | `1.5` | ✅ Implementado (PR-1, 2026-03-10) |
| GOLD | `2.5` | ✅ Implementado (PR-1, 2026-03-10) |
| DIAMOND | `5.0` | ✅ Implementado (PR-1, 2026-03-10) |

**Fix PR-1:** `votes.py` consulta `config_params` para obtener `VOTE_WEIGHT_{rank}`. Fallback a `1.0` si Redis/DB no responden. El peso aplicado se incluye en el response (`vote_weight`) y en `audit_logs.details`.

**Fórmula:**
```
vote_weighted = vote_avg × VOTE_WEIGHT_{rank}
new_raw_sum = raw_sum + vote_weighted
```

### 13.3 Decay Temporal

`config_params` define `DECAY_HALF_LIFE_DAYS = 180` (vida media de 6 meses). Job implementado (PR-12) — ver [Sección 12](#12-admin--decay) para endpoints de administración y `scripts/run_decay.py` para el cron.

### 13.4 Valor USD del Ciudadano (UserAssetCalculator)

Fórmula para el endpoint `/admin/aum`:

```
valor_usd = (base_tier × multiplier) + data_bonus + rut_bonus
```

**Base por tier:**
| Rango | Base USD |
|-------|----------|
| BRONZE | $0.50 |
| SILVER | $5.00 |
| GOLD | $25.00 |
| DIAMOND | $100.00 |

**Multiplicador de integridad:**
```
multiplier = integrity_score × 1.2
```
- `integrity_score = 0.5` (BRONZE recién registrado) → `multiplier = 0.6`
- `integrity_score = 0.75` (SILVER tras RUT) → `multiplier = 0.9`
- `integrity_score = 1.0` (máximo) → `multiplier = 1.2`

**Data bonus (Mina de Oro B2B):**
| Condición | Bonus |
|-----------|-------|
| `commune` Y `age_range` presentes | +$5.00 |
| Solo `commune` O `age_range` | +$2.00 |
| `region` presente | +$1.00 adicional |

**RUT bonus:**
| Condición | Bonus |
|-----------|-------|
| `rut_hash` presente | +$3.00 |

**Ejemplos completos:**
```
BRONZE sin datos:
  valor = ($0.50 × 0.6) + $0 + $0 = $0.30

SILVER solo email:
  valor = ($5.00 × 0.9) + $0 + $3.00 = $7.50

SILVER con commune + age_range + region:
  valor = ($5.00 × 0.9) + $5.00 + $1.00 + $3.00 = $13.50

GOLD con perfil completo:
  valor = ($25.00 × 1.14) + $5.00 + $1.00 + $3.00 = $37.50

DIAMOND con perfil completo + integrity=1.0:
  valor = ($100.00 × 1.2) + $5.00 + $1.00 + $3.00 = $129.00
```

### 13.5 Mecánica de Rangos (Ascensión)

| Rango | Requisito | integrity_score | verification_level |
|-------|-----------|-----------------|-------------------|
| BRONZE | Registro + email confirmado | 0.5 | 1 |
| SILVER | RUT chileno válido + único | 0.75 | 2 |
| GOLD | Pendiente implementar (Fase 2) | — | — |
| DIAMOND | Pendiente implementar (Fase 3) | — | — |

**Boost demográfico:** Cada campo del perfil entregado (+`age_range`) suma `+0.02` al `integrity_score`, capped en `1.0`.

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

**Nota sobre `config_params`:** `VOTE_WEIGHT_*` es consumido por `votes.py` (PR-1). `DECAY_HALF_LIFE_DAYS` es consumido por `reputation_decay.py` (PR-12). `DECAY_HALF_LIFE_DAYS` también es consultado por el job de decay en cada ejecución.

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
