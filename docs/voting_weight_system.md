# BEACON Protocol — Sistema de Peso de Voto

> **Versión del documento:** 2.0 (Sistema 2 rangos)
> **Fecha:** 2026-03-12
> **Aplica desde:** Migración 014

---

## 1. Filosofía de diseño

El sistema de peso de voto de BEACON está inspirado en metodología de encuestas estadísticas (Cadem/Ipsos):
la **verificación de identidad ponderada** da más peso a votos de ciudadanos que acreditan sus datos demográficos,
reduciendo el ruido de cuentas anónimas o de perfil incompleto.

> Principio rector: **un voto verificado vale lo que un voto de muestra representativa**.

---

## 2. Jerarquía de rangos (v2 — sistema vigente)

| Rango | Peso base | Requisitos | Label UI |
|-------|-----------|------------|----------|
| `BASIC` | **0.5x** | Solo cuenta activa | Voto Estándar |
| `VERIFIED` | **1.0x** | 5 campos demográficos completos | Veredicto Verificado |

> Los rangos legacy `BRONZE / SILVER / GOLD / DIAMOND` se normalizan automáticamente:
> `BRONZE → BASIC`, `SILVER / GOLD / DIAMOND → VERIFIED`.

### 2.1 Requisitos para VERIFIED (5 campos)

El backend evalúa automáticamente si el usuario califica como VERIFIED cada vez que se actualiza su perfil:

```
rut_hash      — RUT hasheado con SHA-256 + salt (endpoint /verify-identity)
birth_year    — Año de nacimiento (1920–2010)
country       — País (texto, ej. "Chile")
region        — Región administrativa
commune       — Comuna
```

Todos los campos deben estar presentes (`NOT NULL`, no vacíos).
Si falta **cualquiera**, el rango es `BASIC`.

---

## 3. Peso efectivo de voto

```
effective_weight = rank_weight × vote_penalty
```

| Variable | Fuente | Descripción |
|----------|--------|-------------|
| `rank_weight` | `config_params.VOTE_WEIGHT_{RANK}` | Peso base del rango (0.5 o 1.0) |
| `vote_penalty` | `users.vote_penalty` (DEFAULT 1.0) | Multiplicador de penalización controlado por el Overlord |
| `effective_weight` | Calculado en `votes.py` | Peso real usado en el cómputo del score |

### Ejemplos de effective_weight

| Usuario | Rango | vote_penalty | effective_weight |
|---------|-------|-------------|-----------------|
| Ciudadano nuevo | BASIC | 1.0 | **0.5** |
| Ciudadano verificado | VERIFIED | 1.0 | **1.0** |
| VERIFIED sancionado | VERIFIED | 0.3 | **0.3** |
| BASIC sancionado | BASIC | 0.0 | **0.0** (bloqueado) |

---

## 4. Fórmula de cómputo de score (v1 — vigente)

Se usa **media ponderada acumulada** (sin prior Bayesiano — ver §9 para v4.0).

### 4.1 Voto nuevo (primera vez)

```
new_score = (old_score × old_n + vote_avg × effective_weight)
            ──────────────────────────────────────────────────
                      (old_n + effective_weight)
```

### 4.2 Modificación de voto (dentro del time-lock)

No permitido: el voto queda bloqueado durante `VOTE_EDIT_LOCK_DAYS`.

### 4.3 Reemplazo de voto (tras expirar time-lock)

```
new_score = (old_score × old_n - old_vote_avg × old_eff_weight + vote_avg × new_eff_weight)
            ─────────────────────────────────────────────────────────────────────────────────
                                         old_n
```

> `old_vote_avg` y `old_eff_weight` se leen desde `entity_reviews.vote_avg` y `entity_reviews.effective_weight`.

---

## 5. Time-lock de votos

| Parámetro | Tabla | Descripción |
|-----------|-------|-------------|
| `VOTE_EDIT_LOCK_DAYS` | `config_params` | Días hasta poder modificar un voto (default: 30) |

- Si el usuario intenta re-votar antes del plazo → **HTTP 423 Locked**
- Response body incluye `unlock_date` (ISO 8601)
- Después del plazo → UPSERT en `entity_reviews` con reemplazo de score

---

## 6. Dimensiones de voto por categoría

### POLITICO
| Dimensión | Descripción |
|-----------|-------------|
| `transparency` | Transparencia en su gestión |
| `management` | Calidad de la gestión pública |
| `coherence` | Coherencia entre discurso y acción |

### PERSONA_PUBLICA
| Dimensión | Descripción |
|-----------|-------------|
| `probity` | Probidad e integridad personal |
| `trust` | Confianza ciudadana |
| `influence` | Influencia legítima |

### COMPANY
| Dimensión | Descripción |
|-----------|-------------|
| `transparency` | Transparencia corporativa |
| `ethics` | Conducta ética |
| `impact` | Impacto social/ambiental |
| `reliability` | Confiabilidad / cumplimiento |

`vote_avg` = promedio simple de las dimensiones del voto.

---

## 7. Tablas involucradas

### `users` (campos relevantes)
```sql
rank          TEXT     DEFAULT 'BASIC'      -- 'BASIC' | 'VERIFIED'
vote_penalty  NUMERIC  DEFAULT 1.0          -- Multiplicador overlord
rut_hash      TEXT                          -- SHA-256 + salt del RUT
birth_year    INT                           -- 1920–2010
country       TEXT
region        TEXT
commune       TEXT
```

### `entity_reviews`
```sql
entity_id        UUID   NOT NULL
user_id          UUID   NOT NULL
vote_avg         FLOAT  NOT NULL            -- Promedio de dimensiones
effective_weight FLOAT  DEFAULT 1.0         -- Peso efectivo al momento del voto
created_at       TIMESTAMPTZ
updated_at       TIMESTAMPTZ                -- Base del time-lock
UNIQUE(entity_id, user_id)                  -- Anti-brigada: 1 voto por entidad/usuario
```

### `entities`
```sql
reputation_score FLOAT  DEFAULT 0.5        -- Score acumulado (actualizado por votes.py)
total_reviews    INT    DEFAULT 0           -- Contador de votos
```

### `config_params`
```sql
VOTE_WEIGHT_BASIC    = '0.5'
VOTE_WEIGHT_VERIFIED = '1.0'
VOTE_EDIT_LOCK_DAYS  = '30'
```

---

## 8. Anti-fraude

| Mecanismo | Implementación |
|-----------|---------------|
| 1 voto por entidad/usuario | `UNIQUE(entity_id, user_id)` en `entity_reviews` |
| Time-lock de modificación | `VOTE_EDIT_LOCK_DAYS` días desde `updated_at` |
| Peso 0 bloqueado | `vote_penalty = 0.0` → `effective_weight = 0` |
| Shadow ban | `is_shadow_banned = true` → voto no computa (pendiente P-security) |
| Mínimo para ranking | 3+ votos para aparecer en scores públicos |

---

## 9. Roadmap futuro (v4.0)

### Prior Bayesiano
Añadir un prior de confianza para entidades con pocos votos:

```
score = (m × C + Σ_votes) / (m + n)
```

| Parámetro | Valor sugerido | Descripción |
|-----------|----------------|-------------|
| `m` | 30 | Prior weight (votos "fantasma") |
| `C` | 3.0 / 5.0 | Prior mean (score neutro en escala 1-5) |
| `n` | `total_reviews` | Votos reales |

### Decay temporal
Reducir el peso de votos antiguos para reflejar conducta reciente:

```
decayed_weight = effective_weight × e^(-λ × days_elapsed)
```

`λ = ln(2) / half_life_days` donde `half_life_days` ≈ 180 (6 meses).

---

## 10. Parámetros configurables (config_params)

| Clave | Valor actual | Descripción |
|-------|-------------|-------------|
| `VOTE_WEIGHT_BASIC` | `0.5` | Peso voto BASIC |
| `VOTE_WEIGHT_VERIFIED` | `1.0` | Peso voto VERIFIED |
| `VOTE_EDIT_LOCK_DAYS` | `30` | Días hasta poder modificar voto |
