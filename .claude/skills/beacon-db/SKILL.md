---
name: beacon-db
description: Guía de migraciones Supabase, esquema real de la BBDD, reglas RLS, uso correcto del Transaction Pooler y diagnóstico de conexión para el proyecto BEACON
allowed-tools: Read, Write, Bash, Grep, Glob
disable-model-invocation: false
---

# beacon-db — Base de Datos & Migraciones BEACON

## Propósito
Este skill guía todo lo relativo a la base de datos de BEACON: cómo crear y ejecutar migraciones, entender el esquema real, diagnosticar problemas de conexión y aplicar políticas RLS correctamente.

Invoca con `/beacon-db` cuando el usuario necesite:
- Crear una nueva migración SQL
- Diagnosticar problemas de conexión a Supabase
- Entender el esquema real vs el teórico
- Aplicar o verificar políticas RLS

---

## ⚠️ Seguridad Crítica

> **`bbdd_connection.md`** está en la raíz del proyecto y contiene credenciales reales (password, service_role key, anon key) **en texto plano**. Este archivo DEBE estar en `.gitignore` para evitar exposición de credenciales en el repositorio.

```
# .gitignore — DEBE incluir:
bbdd_connection.md
```

---

## Arquitectura de Conexión

```
                    Puerto 6543 (Transaction Pooler)
Backend FastAPI ──► aws-0-us-west-2.pooler.supabase.com ──► Supabase PostgreSQL
                    Puerto 5432 (Session Pooler)

Regla:
- Puerto 6543 (Transaction Pooler) → Para queries normales de la app (INSERT, SELECT, UPDATE)
- Puerto 5432 (Session Pooler)    → Para migraciones, queries de catálogo, scripts administrativos
```

### ⚠️ Limitación del Transaction Pooler (6543)
El Transaction Pooler **NO soporta** correctamente:
- Queries a `information_schema` y `pg_catalog`
- Prepared statements con tipos complejos
- Funciones que requieren sesión persistente

Para scripts como `fetch_db_schema.py` → usar **Session Pooler (5432)** o **REST API con service_role**.

---

## Convención de Nombres de Migraciones

```
supabase/migrations/NNN_descripcion_breve.sql
```
- `NNN` = número de 3 dígitos en orden (001, 002, ..., 012)
- `descripcion_breve` = snake_case, máximo 30 caracteres
- Ejemplos válidos: `006_versus_events.sql`, `007_add_evaluation_dims.sql`

### Migraciones existentes
| Archivo | Contenido |
|---------|-----------|
| `001_initial_schema.sql` | `users`, `audit_logs`, `config_params`, índices, RLS |
| `002_entities_schema.sql` | `entities` (ENUM, metadata JSONB, triggers, RLS) |
| `003_territorial_config.sql` | `TERRITORIAL_BONUS_WEIGHT`, trigger audit de `config_params` |
| `004_add_country_to_users.sql` | Columna `country` en `users` |
| `005_add_party_to_entities.sql` | Columna `party` en `entities` + índice |
| *006+ (backend/migrations)* | Revisado en `backend/migrations/` — migraciones 008-011 |

> ⚠️ **Gap Detectado**: Las migraciones 006 y 007 no están en `supabase/migrations/`. El backend usa columnas (`first_name`, `last_name`, `is_rut_verified`, `role`) que no están en ninguna migración documentada → **esquema real diverge del documentado**.

---

## Esquema Real (Tablas Conocidas)

Ver `docs/esquema_bbdd.md` para el esquema completo con columnas, índices y RLS.

Resumen de tablas:

| Tabla | Descripción |
|-------|-------------|
| `users` | Ciudadanos BEACON (rango, hash RUT, demografía) |
| `entities` | Figuras públicas evaluables (ENUM: PERSON/COMPANY/EVENT/POLL) |
| `audit_logs` | Bitácora forense append-only |
| `config_params` | Parámetros del Overlord (pesos, thresholds) |
| `geography_cl` | Regiones y comunas de Chile |
| `evaluation_dimensions` | Dimensiones de evaluación por categoría |
| `entity_reviews` | Votos de usuarios sobre entidades |

---

## Cómo Crear y Ejecutar una Migración

### Paso 1 — Crear el archivo
```bash
# En supabase/migrations/
# Crear 006_versus_events.sql con el SQL de la nueva tabla
```

### Paso 2 — Revisar el SQL
Verificar siempre:
- `CREATE TABLE IF NOT EXISTS` (idempotente)
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (idempotente)
- RLS habilitado: `ALTER TABLE nueva_tabla ENABLE ROW LEVEL SECURITY`
- Al menos una política RLS definida
- Índices para campos de filtrado frecuente

### Paso 3 — Ejecutar en Supabase Dashboard
1. Dashboard → SQL Editor
2. Pegar el contenido del archivo `.sql`
3. Ejecutar
4. Verificar en Table Editor que la tabla/columna existe

> ⚠️ Supabase NO tiene CLI de migraciones automáticas en el plan gratuito. Las migraciones se aplican manualmente en el SQL Editor.

---

## Reglas RLS (Row Level Security) — Estándar BEACON

```sql
-- Patrón básico para tabla nueva:
ALTER TABLE nueva_tabla ENABLE ROW LEVEL SECURITY;

-- Lectura pública de registros activos
CREATE POLICY nueva_tabla_public_read ON nueva_tabla
    FOR SELECT
    USING (is_active = true);

-- Escritura solo para service_role (backend)
CREATE POLICY nueva_tabla_service_write ON nueva_tabla
    FOR INSERT
    WITH CHECK (true);  -- service_role bypasea RLS automáticamente

-- Soft delete (nunca DELETE físico)
CREATE POLICY nueva_tabla_no_hard_delete ON nueva_tabla
    FOR DELETE
    USING (false);
```

### Principios RLS de BEACON
- `audit_logs`: **nunca UPDATE, nunca DELETE** (append-only)
- `users`: SELECT solo para el propio usuario (`auth.uid() = id`)
- `entities`: lectura pública, escritura solo service_role
- `config_params`: lectura solo backend, escritura solo admin con audit trigger

---

## Diagnóstico de Problemas Comunes

| Síntoma | Causa | Fix |
|---------|-------|-----|
| `connection refused :6543` | Puerto bloqueado (IP local) | Usar Session Pooler :5432 |
| `prepared statement already exists` | Transaction Pooler no soporta prepared statements | Deshabilitar prepared statements en la conexión |
| `RLS violation` | El backend usa `anon_key` en vez de `service_role` | Verificar que `SUPABASE_SERVICE_KEY` está configurado |
| `column X does not exist` | Migración no ejecutada | Ejecutar la migración faltante en SQL Editor |
| `unique constraint violation` | Dato duplicado en columna UNIQUE | Verificar con SELECT antes del INSERT |
| Datos reales vs 0 | `reputation_score` y `total_reviews` hardcodeados en `entities.py` | Ver DT-6 en beacon-debt |

---

## Variables de Entorno de Base de Datos

```env
# backend/.env
DATABASE_URL=postgresql://postgres.ejholgyffguoxlflvoqx:[password]@aws-0-us-west-2.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://ejholgyffguoxlflvoqx.supabase.co
SUPABASE_KEY=<anon_key>
SUPABASE_SERVICE_KEY=<service_role_key>   # NUNCA al frontend
```

Para scripts administrativos (fetch_db_schema.py, etc.):
```python
# Usar Session Pooler (5432) para queries de catálogo
ADMIN_DATABASE_URL = DATABASE_URL.replace(":6543/", ":5432/")
```

---

## Tablas config_params importantes

| Key | Valor default | Descripción |
|-----|---------------|-------------|
| `SECURITY_LEVEL` | `GREEN` | Nivel Panic Gate: GREEN/YELLOW/RED |
| `VOTE_WEIGHT_BRONZE` | `1.0` | Multiplicador voto BRONZE |
| `VOTE_WEIGHT_SILVER` | `1.5` | Multiplicador voto SILVER |
| `VOTE_WEIGHT_GOLD` | `2.5` | Multiplicador voto GOLD |
| `VOTE_WEIGHT_DIAMOND` | `5.0` | Multiplicador voto DIAMOND |
| `TERRITORIAL_BONUS_WEIGHT` | `1.5` | Bonus voto local (misma comuna) |
| `SHADOW_BAN_THRESHOLD` | `0.2` | Integrity score mínimo |
| `MAX_VOTES_PER_HOUR` | `20` | Rate limiting por usuario |
| `DECAY_HALF_LIFE_DAYS` | `180` | Vida media decaimiento temporal |

---

## Referencia

- `supabase/migrations/` → Todas las migraciones documentadas
- `docs/esquema_bbdd.md` → Esquema completo con columnas reales
- `bbdd_connection.md` → Strings de conexión (⚠️ agregar a .gitignore)
- `backend/app/core/database.py` → Cliente Supabase del backend
- `backend/app/core/config.py` → Variables de entorno de BD
