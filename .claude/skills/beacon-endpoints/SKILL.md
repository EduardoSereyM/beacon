---
name: beacon-endpoints
description: Auditoría de contratos de todos los endpoints de BEACON (26+), contrastando response models con el esquema real de la BBDD y detectando hardcoding, inconsistencias y gaps
allowed-tools: Read, Grep, Glob
disable-model-invocation: false
---

# beacon-endpoints — Auditoría de Endpoints vs BBDD

## Propósito
Este skill guía la **auditoría de contratos de API** de BEACON: verifica que cada endpoint retorne datos reales de la base de datos, detecta campos hardcodeados, inconsistencias entre Pydantic schemas y el esquema real, y contrasta auth requerida vs ACM.

Invoca con `/beacon-endpoints` cuando el usuario necesite:
- Auditar todos los endpoints del proyecto
- Verificar que un endpoint específico usa datos reales
- Contrastar el response model de un endpoint con el esquema de BBDD
- Identificar qué endpoints tienen bugs activos

---

## Estado Actual de Endpoints (27 total)

### Módulo Auth (`/api/v1/user/auth/`)
| # | Método | Ruta | Auth | BBDD | Estado |
|---|--------|------|------|------|--------|
| 1 | POST | `/register` | No | `users`, `audit_logs` | ⚠️ Email rate limit Supabase gratuito (~3/hora) |
| 2 | POST | `/confirm-email` | No | `auth.users` | ✅ |
| 3 | POST | `/login` | No | `users` | ⚠️ Exception genérico puede revelar info |
| 4 | POST | `/verify-identity` | Bearer | `users`, `audit_logs` | ✅ |
| 5 | GET | `/me` | Bearer | `users` | ✅ |
| 6 | PUT | `/profile` | Bearer | `users`, `audit_logs` | ✅ |

### Módulo Entities (`/api/v1/entities/`)
| # | Método | Ruta | Auth | BBDD | Estado |
|---|--------|------|------|------|--------|
| 7 | GET | `/filters` | No | `entities` | ✅ |
| 8 | GET | `/` | No | `entities` | ❌ `is_verified: True` y `rank: BRONZE` hardcodeados |
| 9 | GET | `/{id}` | No | `entities` | ❌ mismos campos hardcodeados |

### Módulo Votes (`/api/v1/entities/`)
| # | Método | Ruta | Auth | BBDD | Estado |
|---|--------|------|------|------|--------|
| 10 | POST | `/{id}/vote` | Bearer | `entity_reviews`, `entities`, `audit_logs` | ❌ `publish_verdict_pulse()` nunca se llama → WebSocket sin datos reales |

### Módulo Dimensions
| # | Método | Ruta | Auth | BBDD | Estado |
|---|--------|------|------|------|--------|
| 11 | GET | `/api/v1/dimensions` | No | `evaluation_dimensions` | ✅ |

### Módulo Realtime
| # | Método | Ruta | Auth | BBDD | Estado |
|---|--------|------|------|------|--------|
| 12 | WS | `/api/v1/realtime/pulse/{entity_id}` | No | Redis | ⚠️ Nunca recibe datos reales (bug DT-2) |
| 13 | GET | `/api/v1/realtime/status` | No | Redis | ✅ |

### Módulo Admin (`/api/v1/admin/`)
| # | Método | Ruta | Auth | BBDD | Estado |
|---|--------|------|------|------|--------|
| 14 | GET | `/stats` | Admin | `entities`, `users`, `entity_reviews`, `audit_logs` | ⚠️ Trae todas las filas a Python para contar |
| 15 | GET | `/entities` | Admin | `entities` | ✅ |
| 16 | POST | `/entities` | Admin | `entities`, `audit_logs` | ❌ `audit_bus` sin `await` |
| 17 | PATCH | `/entities/{id}` | Admin | `entities`, `audit_logs` | ❌ `audit_bus` sin `await` |
| 18 | DELETE | `/entities/{id}` | Admin | `entities`, `audit_logs` | ❌ `audit_bus` sin `await` + resultado no chequeado |
| 19 | POST | `/entities/upload-photo` | Admin | Storage | ❌ `audit_bus` sin `await` |
| 20 | GET | `/dimensions` | Admin | `evaluation_dimensions` | ✅ |
| 21 | POST | `/dimensions` | Admin | `evaluation_dimensions` | ⚠️ Sin audit log |
| 22 | PATCH | `/dimensions/{id}` | Admin | `evaluation_dimensions` | ⚠️ Sin audit log |
| 23 | DELETE | `/dimensions/{id}` | Admin | `evaluation_dimensions` | ❌ Sin audit, sin verificación de existencia |
| 24 | GET | `/audit-logs` | Admin | `audit_logs` | ✅ |
| 25 | GET | `/audit-logs/actions` | Admin | `audit_logs` | ⚠️ Trae todas las filas para DISTINCT |
| 26 | GET | `/aum` | Admin | `users` | ⚠️ Fallback a datos demo hardcodeados |
| 27 | GET | `/health` | No | — | ✅ |

---

## Cómo usar este skill

### Al invocar `/beacon-endpoints`:

1. **Leer todos los archivos de endpoints** del proyecto:
   ```
   backend/app/api/v1/user/auth.py
   backend/app/api/v1/endpoints/entities.py
   backend/app/api/v1/endpoints/votes.py
   backend/app/api/v1/endpoints/dimensions.py
   backend/app/api/v1/endpoints/realtime.py
   backend/app/api/v1/admin/entities_admin.py
   backend/app/api/v1/admin/admin_dimensions.py
   backend/app/api/v1/admin/aum_endpoint.py
   ```

2. **Leer el esquema real** de la BBDD: `docs/esquema_bbdd.md`

3. **Para cada endpoint, verificar**:
   - ¿El `response_model` Pydantic corresponde a los campos reales de la tabla?
   - ¿Hay campos hardcodeados que deberían venir de la DB?
   - ¿El nivel de auth requerido es correcto según la ACM?
   - ¿El `audit_bus.log_event()` usa `await` correctamente?
   - ¿Se verifican los resultados de las operaciones (update/delete)?

4. **Reportar hallazgos** en formato tabla con:
   - Archivo y número de línea
   - Severidad (❌ Bug / ⚠️ Warning / ✅ OK)
   - Descripción del problema
   - Fix sugerido

---

## Contraste Endpoint ↔ BBDD

### Tabla `entities` — columnas reales vs response model

| Columna en DB | En response model | Nota |
|--------------|-------------------|------|
| `id` | ✅ | |
| `entity_type` | ✅ | ENUM: PERSON/COMPANY/EVENT/POLL |
| `name` | ✅ | |
| `reputation_score` | ⚠️ | Se lee de DB pero puede estar hardcodeado en el endpoint |
| `total_reviews` | ⚠️ | Ver DT-6 — posible hardcoding |
| `is_verified` | ❌ | Hardcodeado `True` en `entities.py` |
| `rank` | ❌ | Hardcodeado `BRONZE` — campo no existe en `entities` tabla |
| `metadata` | ⚠️ | JSONB — verificar qué campos se exponen del JSONB |
| `party` | ✅ | Agregado en migración 005 |
| `service_tags` | ✅ | JSONB |
| `integrity_index` | ✅ | |
| `commune`, `region` | ✅ | |

> ⚠️ **Nota**: `rank` NO es un campo de la tabla `entities`. Es un campo de `users`. Que aparezca hardcodeado en la respuesta de entidades es un bug de diseño.

---

## Relación API ↔ BBDD (diagrama)

```
auth.users (Supabase Auth — managed)
    │ id referenciado por:
    ▼
users (public.users)
    │ id FK en:
    ├──► entity_reviews.user_id
    └──► audit_logs.actor_id (TEXT, sin FK real)

entities (public.entities)
    │ id FK en:
    ├──► entity_reviews.entity_id
    ├──► entities.created_by → users.id
    └──► audit_logs.entity_id (TEXT, sin FK real)

evaluation_dimensions (por category)
config_params (standalone, sin FK)
```

---

## Referencia de archivos

- `docs/esquema_bbdd.md` → Esquema completo con columnas e índices
- `backend/app/api/v1/` → Todos los endpoints
- `backend/app/core/security/access_control_matrix.py` → ACM para validar permisos
- `ROADMAP_LOG.md` → Estado de cada feature y deuda técnica documentada
