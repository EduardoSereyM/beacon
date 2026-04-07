# ⚠️ ARCHIVADO — BEACON Protocol — Sistema de Votación y Rangos (Legacy 4-Tiers)

> **Estado:** OBSOLETO — Mantienen valor histórico solamente
> **Fecha de obsolescencia:** 2026-04-07
> **Reemplazado por:** docs/rank_system.md, docs/voting_weight_system.md
> **Documento histórico de referencia** · Original: `2026-03-11`
> **Nota:** El sistema actual usa BASIC (0.5x) / VERIFIED (1.0x), no los 4 tiers (BRONZE/SILVER/GOLD/DIAMOND) descritos aquí.

---

---

## 1. Rangos de Ciudadanos

Los ciudadanos del Búnker tienen un rango que refleja su nivel de integridad verificada.
El rango determina el **peso de su voto** y los privilegios en el sistema.

| Rango | Cómo se obtiene | Peso de voto | Privilegios |
|---|---|---|---|
| `BRONZE` | Cuenta nueva con email confirmado | **1.0×** | Puede leer y votar |
| `SILVER` | RUT verificado (Módulo 11 + formato válido) | **1.5×** | Puede sugerir entidades + voto pesa más |
| `GOLD` | Asignado manualmente por el Overlord | **2.5×** | Badge especial + partículas doradas en UI |
| `DIAMOND` | Reservado — máxima confianza | **5.0×** | Voto equivale a 5 votos BRONZE |

> Los pesos son configurables en tiempo real desde la tabla `config_params` (sin deploy):
> `VOTE_WEIGHT_BRONZE`, `VOTE_WEIGHT_SILVER`, `VOTE_WEIGHT_GOLD`, `VOTE_WEIGHT_DIAMOND`

---

## 2. El Voto Multidimensional

### 2.1 Cómo vota un ciudadano

El ciudadano evalúa a una entidad en **múltiples dimensiones** configurables (ej: Transparencia, Gestión, Coherencia), cada una con un score de `0.0` a `5.0`.

```json
POST /api/v1/entities/{entity_id}/vote
{
  "scores": {
    "transparencia": 4.5,
    "gestion": 3.0,
    "coherencia": 2.5
  }
}
```

Las dimensiones activas por categoría se obtienen de `GET /api/v1/dimensions`.

### 2.2 Restricciones

- **Un voto por par `(entity_id, user_id)`** — tabla `entity_reviews` con `UNIQUE` constraint
- No se puede votar a sí mismo
- El ciudadano debe estar autenticado (JWT Bearer)
- El email debe estar confirmado — sin confirmación no hay login

---

## 3. Fórmula Bayesiana de Reputación

### 3.1 Concepto

El sistema usa una **media Bayesiana incremental** con un *prior* neutral. Esto evita que una entidad recién ingresada con 1 solo voto extremo domine el ranking.

### 3.2 Parámetros

| Parámetro | Valor | Significado |
|---|---|---|
| `m` (prior weight) | **30** | Equivale a 30 votos ficticios neutros al inicio |
| `C` (prior mean) | **3.0** | Score neutral — punto de partida de toda entidad |
| Rango válido | `[0.0, 5.0]` | El score siempre se clampea a este rango |

### 3.3 Proceso de cálculo por voto

```
1. vote_avg  = promedio de todas las dimensiones del voto
2. vote_weighted = vote_avg × vote_weight(rank)
   — BRONZE: × 1.0, SILVER: × 1.5, GOLD: × 2.5, DIAMOND: × 5.0

3. Revertir Bayesiano para obtener raw_sum acumulado:
   raw_sum = old_score × (m + n) − m × C
   (donde n = total de votos previos)

4. Nuevo raw_sum:
   new_raw_sum = raw_sum + vote_weighted

5. Nuevo score Bayesiano:
   new_score = (m × C + new_raw_sum) / (m + n + 1)

6. Clamp al rango [0.0, 5.0]
```

### 3.4 Ejemplo numérico

Una entidad nueva recibe su primer voto de un ciudadano SILVER con score promedio 4.0:

```
vote_avg     = 4.0
vote_weight  = 1.5 (SILVER)
vote_weighted = 4.0 × 1.5 = 6.0

raw_sum      = 0   (sin votos previos)
new_raw_sum  = 0 + 6.0 = 6.0

new_score = (30 × 3.0 + 6.0) / (30 + 1)
          = (90 + 6.0) / 31
          = 96.0 / 31
          ≈ 3.097
```

> El prior de 30 amortigua el primer voto — la entidad apenas sube de 3.0 a 3.097.
> Después de 100 votos BRONZE con 4.0, el score converge hacia ~3.7.

### 3.5 Efecto del peso de rango

```
Mismo voto (avg=4.0) con distintos rangos — entidad en 3.0 (40 votos):

BRONZE  (×1.0): new_score ≈ 3.014
SILVER  (×1.5): new_score ≈ 3.021
GOLD    (×2.5): new_score ≈ 3.035
DIAMOND (×5.0): new_score ≈ 3.069
```

> Un DIAMOND tiene el poder de 5 votos BRONZE simultáneos.

---

## 4. Decaimiento Temporal (Reputation Decay)

### 4.1 Concepto

Una reputación que no se actualiza **se erosiona hacia el prior neutral (3.0)**. Esto evita que entidades olvidadas mantengan sus scores indefinidamente.

### 4.2 Fórmula

```
new_score = C + (old_score − C) × exp(−ln(2) × elapsed_days / half_life)
```

| Parámetro | Valor | Configurable |
|---|---|---|
| `C` (prior) | **3.0** | No (espejo del Bayesiano) |
| `half_life` | **180 días** | Sí — `DECAY_HALF_LIFE_DAYS` en `config_params` |
| `min_days` | **30 días** | Sí — umbral antes de aplicar decay |

### 4.3 Comportamiento por tiempo

| Días sin votos | Factor | Score 5.0 → | Score 1.0 → |
|---|---|---|---|
| 0 | 1.0 | 5.0 | 1.0 |
| 30 (mínimo) | 0.89 | 4.56 | 1.44 |
| 90 | 0.71 | 4.0 | 2.0 |
| 180 (half-life) | 0.50 | 4.0 | 2.0 |
| 360 | 0.25 | 3.5 | 2.5 |
| ∞ | 0 | 3.0 | 3.0 |

> La verdad se enfría, pero nunca llega a neutral si hay actividad sostenida.

### 4.4 Ejecución del Decay Job

```bash
# Dry-run (ver cambios sin escribir):
cd backend
python scripts/run_decay.py --dry-run

# Aplicar decay real:
python scripts/run_decay.py
```

Cada entidad modificada genera un `audit_log` con `action: REPUTATION_DECAY_APPLIED`.

---

## 5. Integridad Index (derivado)

El frontend muestra un `integrity_index` calculado en tiempo real desde el `reputation_score`:

```
integrity_index = reputation_score / 5.0
```

| Score | Integrity Index | Display |
|---|---|---|
| 5.0 | 100% | ████████████ |
| 3.5 | 70% | ████████░░░░ |
| 3.0 | 60% | ███████░░░░░ |
| 1.0 | 20% | ██░░░░░░░░░░ |

---

## 6. Flujo Completo de un Voto

```
Ciudadano (SILVER) → POST /vote { scores: {...} }
        │
        ▼
1. Anti-brigada: ¿ya votó? → entity_reviews (UNIQUE check)
        │ NO
        ▼
2. Leer entidad: reputation_score, total_reviews
        │
        ▼
3. Calcular vote_avg = media(scores)
        │
        ▼
4. Leer vote_weight de config_params según rank
        │
        ▼
5. Fórmula Bayesiana incremental
        │
        ▼
6. UPDATE entities SET reputation_score, total_reviews, last_reviewed_at
        │
        ▼  (background tasks — no bloquean el response)
7a. WebSocket: publish_verdict_pulse → Redis → clientes conectados
7b. INSERT entity_reviews (anti-brigada)
7c. audit_bus.log_event(action=VOTE_SUBMITTED)
        │
        ▼
Response: { new_score, total_reviews, your_vote, vote_weight, voter_rank }
```

---

## 7. Parámetros Configurables (sin deploy)

Todos modificables en **Supabase → SQL Editor** o vía panel admin:

```sql
UPDATE config_params SET value = '2.0' WHERE key = 'VOTE_WEIGHT_SILVER';
UPDATE config_params SET value = '365' WHERE key = 'DECAY_HALF_LIFE_DAYS';
```

| Key | Default | Efecto |
|---|---|---|
| `VOTE_WEIGHT_BRONZE` | `1.0` | Peso base |
| `VOTE_WEIGHT_SILVER` | `1.5` | +50% sobre BRONZE |
| `VOTE_WEIGHT_GOLD` | `2.5` | +150% sobre BRONZE |
| `VOTE_WEIGHT_DIAMOND` | `5.0` | ×5 BRONZE |
| `DECAY_HALF_LIFE_DAYS` | `180` | Inactividad para llegar al 50% de decay |
| `MAX_VOTES_PER_HOUR` | `20` | Rate limiting (no implementado aún) |
| `SHADOW_BAN_THRESHOLD` | `0.2` | integrity_score mínimo (no implementado aún) |

---

*BEACON Protocol — `docs/sistema_votacion.md` · Fuente: `votes.py` + `reputation_decay.py`*
