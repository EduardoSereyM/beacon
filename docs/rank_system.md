# BEACON Protocol — Sistema de Rangos (v2)

> **Versión:** 2.0 — Sistema 2 rangos
> **Fecha:** 2026-03-12
> **Migración asociada:** 014_rank_simplification.sql + 015_fix_rank_constraint.sql

---

## 1. Resumen

BEACON usa un sistema de **2 rangos** inspirado en metodología de encuestas estadísticas (Cadem/Ipsos).
La simplificación reduce fricción de onboarding y alinea el peso del voto con la calidad estadística de la muestra.

| Rango | Peso de voto | Descripción |
|-------|-------------|-------------|
| `BASIC` | **0.5x** | Cuenta activa sin verificación completa |
| `VERIFIED` | **1.0x** | Identidad y perfil demográfico completo |

---

## 2. Flujo de promoción

```
Registro
   │
   ▼
BASIC (default)
   │  completa los 5 campos:
   │  rut_hash + birth_year + country + region + commune
   ▼
VERIFIED (automático vía _evaluate_rank)
```

La promoción es **automática**: el backend evalúa `_evaluate_rank()` después de cada update de perfil o verificación de RUT. No requiere acción manual del Overlord.

---

## 3. Los 5 campos requeridos para VERIFIED

| Campo | Endpoint que lo recibe | Descripción |
|-------|------------------------|-------------|
| `rut_hash` | `POST /verify-identity` | SHA-256 + salt del RUT chileno |
| `birth_year` | `PUT /profile` o registro | Año de nacimiento (1920–2010) |
| `country` | `PUT /profile` o registro | País |
| `region` | `PUT /profile` o registro | Región administrativa |
| `commune` | `PUT /profile` o registro | Comuna |

> El RUT **nunca** se persiste en texto plano. Solo se almacena `rut_hash`.
> La validación módulo 11 ocurre en el cliente (frontend) y es verificada en el backend.

---

## 4. Lógica `_evaluate_rank()` (backend)

```python
# backend/app/services/identity_service.py

async def _evaluate_rank(supabase, user_id: str) -> str:
    result = await supabase.table("users")
        .select("rut_hash, birth_year, country, region, commune")
        .eq("id", user_id).single().execute()
    u = result.data
    all_present = all([
        u.get("rut_hash"),
        u.get("birth_year"),
        u.get("country"),
        u.get("region"),
        u.get("commune"),
    ])
    return UserRank.VERIFIED if all_present else UserRank.BASIC
```

Se llama desde:
- `verify_rut()` — tras registrar el RUT
- `update_demographic_profile()` — tras actualizar perfil

---

## 5. Frontend — Flujo de verificación (P5)

### 5.1 BasicUserBanner
- Aparece **fijo** bajo el navbar (top: 64px, z-index: 40) para usuarios BASIC
- Mensaje: _"🔒 Tu voto vale 0.5x. Verifica tu identidad y valdrá el doble."_
- Dismissible via `sessionStorage` (clave `beacon_banner_dismissed`)
- Botón "Verificar ahora" → abre `VerifyIdentityModal`

### 5.2 VerifyIdentityModal
- Validación módulo 11 **en el cliente** (sin round-trip al servidor)
- POST a `/api/v1/user/auth/verify-identity` con Bearer JWT
- En éxito:
  - Actualiza store Zustand (`setAuth(token, { ...user, rank: data.new_rank })`)
  - Actualiza `localStorage.beacon_user` (compatibilidad legacy)
  - Auto-cierre en 3 segundos
- Mensajes diferenciados:
  - Si nuevo rango = VERIFIED → "¡Identidad Verificada! Tu voto ahora vale 1.0x"
  - Si nuevo rango = BASIC → "RUT registrado — completa año, país, región y comuna para subir a VERIFIED"

### 5.3 Navbar — Botón 🔒 Verificar
- Visible solo para usuarios BASIC (oculto para VERIFIED y ANONYMOUS)
- Mismo efecto que "Verificar ahora" del banner
- Badge de rango: **verde** para VERIFIED, **ámbar** para BASIC

---

## 6. Normalización de rangos legacy

Los rangos del sistema anterior (`BRONZE / SILVER / GOLD / DIAMOND`) se normalizan automáticamente en el frontend:

```typescript
// frontend/src/hooks/usePermissions.ts
function normalizeRank(raw: string): Role {
    if (raw === "VERIFIED") return "VERIFIED";
    if (raw === "BASIC" || raw === "BRONZE") return "BASIC";
    if (raw === "SILVER" || raw === "GOLD" || raw === "DIAMOND") return "VERIFIED";
    return "ANONYMOUS";
}
```

En el backend, la migración 014 convirtió todos los registros:
- `BRONZE → BASIC`
- `SILVER / GOLD / DIAMOND → VERIFIED`

---

## 7. Permisos por rango (ACM Frontend)

| Permiso | ANONYMOUS | BASIC | VERIFIED |
|---------|-----------|-------|----------|
| `browse_entities` | ✅ | ✅ | ✅ |
| `view_rankings` | ✅ | ✅ | ✅ |
| `view_objective_data` | ✅ | ✅ | ✅ |
| `evaluate` | ❌ | ✅ | ✅ |
| `view_own_impact` | ❌ | ✅ | ✅ |
| `edit_own_verdict` | ❌ | ✅ | ✅ |
| `verified_badge` | ❌ | ❌ | ✅ |
| `view_advanced_metrics` | ❌ | ❌ | ✅ |
| `view_integrity_stats` | ❌ | ❌ | ✅ |

---

## 8. Campos `users` relacionados

```sql
rank          TEXT     DEFAULT 'BASIC'   -- 'BASIC' | 'VERIFIED'
rut_hash      TEXT                       -- SHA-256 + salt
is_rut_verified BOOL   DEFAULT false
birth_year    INT                        -- 1920–2010
country       TEXT
region        TEXT
commune       TEXT
age_range     TEXT                       -- Complementario (no requerido para VERIFIED)
vote_penalty  NUMERIC  DEFAULT 1.0       -- Overlord-controlled penalty multiplier
```

---

## 9. Deuda técnica relacionada

| Ítem | Estado | Prioridad |
|------|--------|-----------|
| Recovery "Olvidé mi contraseña" | ❌ No implementado | P6 |
| Formulario de perfil completo (birth_year + country + region + commune) | ❌ No implementado | P5b |
| `create_admin.py` usa columnas eliminadas (`hashed_password`) | ⚠️ Script roto | Deuda |
| `identity_service.update_demographic_profile` conectar `comuna_id` FK | ⚠️ Parcial | P5b |
