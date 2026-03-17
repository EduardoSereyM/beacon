---
name: beacon-debt
description: Protocolo para identificar, priorizar y resolver ítems de deuda técnica de BEACON sin romper producción ni afectar los datos históricos
allowed-tools: Read, Write, Bash, Grep, Glob
disable-model-invocation: false
---

# beacon-debt — Protocolo de Deuda Técnica

## Propósito
Este skill guía cómo abordar la **deuda técnica activa** de BEACON de forma segura, con cambios auditables y sin afectar el flujo de producción en `www.beaconchile.cl`.

Invoca con `/beacon-debt` cuando el usuario necesite:
- Revisar qué deuda técnica existe y su prioridad
- Implementar un fix de deuda técnica específico
- Decidir el orden de ataque entre varios ítems

---

## Deuda Técnica Actual (fuente: ROADMAP_LOG.md + auditoría código)

### 🔴 ALTA — Bugs activos en producción

| # | Archivo | Línea | Problema |
|---|---------|-------|---------|
| DT-1 | `entities_admin.py` | 118,203,258,314 | `audit_bus.log_event()` llamado **sin `await`** en contexto async → fire-and-forget no garantizado |
| DT-2 | `votes.py` | - | `publish_verdict_pulse()` **nunca se llama** tras un voto → WebSocket no recibe actualizaciones reales |
| DT-3 | `entities_admin.py` | - | `admin_delete_entity()`: resultado del soft-delete no se verifica → falla silenciosa posible |
| DT-4 | `admin_dimensions.py` | DELETE | Sin verificación de existencia, sin audit log, retorna éxito aunque nada se borre |
| DT-5 | `database.py` | - | `get_async_supabase_client()` crea un `AsyncClient` **nuevo en cada llamada** → sin connection pooling |
| DT-6 | `entities.py` | 124,125 | `is_verified: True` y `rank: BRONZE` **hardcodeados** para TODAS las entidades → dato falso en API pública |
| DT-7 | `aum_endpoint.py` | 44-55 | Fallback a **datos demo hardcodeados** expuesto en producción a admins |

### 🟡 MEDIA — Deprecated / inconsistencias

| # | Archivo | Problema |
|---|---------|---------|
| DT-8 | `database.py` | `get_supabase_client()` marcado DEPRECATED pero usado en `audit_logger.py` (síncrono en contexto async) |
| DT-9 | `main.py` | `@app.on_event("startup/shutdown")` deprecated en FastAPI 0.109+ → debe usar `lifespan` context manager |
| DT-10 | `identity_service.py` | Columnas antiguas (`commune`, `region` como TEXT) → migrar a `comuna_id` FK de `geography_cl` |
| DT-11 | `create_admin.py` / `create_test_users.py` | Referencian `hashed_password` (columna eliminada) → scripts rotos |

### 🟢 BAJA — Código muerto

| # | Archivo | Problema |
|---|---------|---------|
| DT-12 | `services/voting/vote_engine.py` | Existe pero **no es usado** por `votes.py` → dead code |
| DT-13 | `api/v1/public/__init__.py`, `api/v1/events/__init__.py` | Directorios vacíos sin implementación |
| DT-14 | Frontend: `components/bunker/index.ts`, `components/status/index.ts`, etc. | Archivos `export {}` sin contenido |
| DT-15 | Frontend: `AuthModal.tsx` | `localStorage.getItem("beacon_token")` Y `beacon-auth` en Zustand → dos sistemas de auth coexistiendo |

---

## Protocolo de Resolución (paso a paso)

### Paso 1 — Elegir el ítem de mayor impacto
Priorizar: ALTA → MEDIA → BAJA. Dentro de ALTA, empezar por DT-1 (await) ya que afecta múltiples endpoints.

### Paso 2 — Crear rama dedicada
```bash
git checkout -b fix/dt-<número>-descripcion
# Ejemplo: fix/dt-1-await-audit-bus
```
**Nunca** trabajar deuda técnica directamente en `main`.

### Paso 3 — Aplicar el fix con el mínimo de cambios
- Un ítem de deuda = un PR = un commit
- Máximo 300 líneas por PR (regla beacon-pr-plan)
- Incluir comentario explicando el "por qué" del fix

### Paso 4 — Verificar tests antes de merge
```bash
cd backend
pytest tests/ -v --tb=short
```
Si no hay tests para el módulo afectado, crear al menos 1 test de sanity.

### Paso 5 — Documentar en ROADMAP_LOG.md
Al cerrar el ítem, agregar entrada en la sección "Deuda Técnica resuelta" con:
- Descripción del problema
- Solución implementada
- Commit de referencia

---

## PRs recomendados (orden de ejecución)

| PR | Título | Archivos | Prioridad |
|----|--------|----------|-----------|
| PR-1 | `fix: await audit_bus en admin endpoints` | `entities_admin.py` | 🔴 |
| PR-2 | `fix: llamar publish_verdict_pulse tras voto` | `votes.py`, `realtime.py` | 🔴 |
| PR-3 | `fix: eliminar is_verified/rank hardcoded` | `entities.py` | 🔴 |
| PR-4 | `fix: eliminar demo data de aum_endpoint` | `aum_endpoint.py` | 🔴 |
| PR-5 | `fix: connection pool AsyncClient` | `database.py` | 🟡 |
| PR-6 | `fix: lifespan context manager en main.py` | `main.py` | 🟡 |
| PR-7 | `chore: eliminar vote_engine.py dead code` | `services/voting/` | 🟢 |

---

## Reglas de oro

1. **Nunca** resolver deuda técnica y agregar features en el mismo PR
2. **Siempre** verificar que los tests de ACM y seguridad pasan (`test_access_control_matrix.py`, `test_redis_panic_gate.py`)
3. Los "Amigos Bits" (`dna_scanner.py`, `stealth_ban.py`, `user_asset_calculator.py`) son **protegidos** — no modificar sin aprobación explícita del Overlord

---

## Referencia de archivos clave

- `ROADMAP_LOG.md` → Sección "Deuda Técnica"
- `MEMORY.md` → Arquitectura de datos y pendientes
- `backend/app/api/v1/admin/entities_admin.py` → DT-1, DT-3
- `backend/app/api/v1/endpoints/votes.py` → DT-2
- `backend/app/api/v1/endpoints/entities.py` → DT-6
- `backend/tests/` → Suite de tests existentes
