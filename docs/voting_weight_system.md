# ⚖️ BEACON — Sistema de Pesos, Votación y Rangos

> Versión: 1.0 | Fecha: 2026-03-11
> *"No todos los votos pesan lo mismo. El que más se ha expuesto a la verificación, más pesa."*

---

## 1. Jerarquía de Rangos

Los ciudadanos de BEACON existen en una jerarquía soberana de cuatro niveles. El rango determina el peso del voto, los privilegios de UI y el valor de mercado del perfil.

```
╔═══════════════════════════════════════════════════════════╗
║   💎 DIAMOND   │  Poder: 5.0x  │  Valor: ~$100 USD        ║
║   Auditor de la Verdad                                    ║
║   Verificación: presencial + criterio admin               ║
╠═══════════════════════════════════════════════════════════╣
║   🥇 GOLD      │  Poder: 2.5x  │  Valor: ~$25 USD          ║
║   Referente de Integridad                                 ║
║   Verificación: perfil completo + comportamiento íntegro  ║
╠═══════════════════════════════════════════════════════════╣
║   🥈 SILVER    │  Poder: 1.5x  │  Valor: ~$5-13 USD        ║
║   Ciudadano Verificado                                    ║
║   Verificación: RUT hash (SHA-256 + salt)                 ║
╠═══════════════════════════════════════════════════════════╣
║   🥉 BRONZE    │  Poder: 1.0x  │  Valor: ~$0.50-2 USD      ║
║   Masa Crítica                                            ║
║   Verificación: solo email confirmado                     ║
╚═══════════════════════════════════════════════════════════╝
```

### 1.1 Rito de Ascensión

| Paso | Acción | Resultado |
|------|--------|-----------|
| 1 | Registro con email | Rango **BRONZE** · `integrity_score: 0.5` |
| 2 | Verificar RUT (módulo 11) | Ascenso a **SILVER** · `integrity_score: 0.75` |
| 3 | Completar perfil demográfico | Cada campo suma `+0.02` al integrity_score |
| 4 | Comportamiento íntegro sostenido | El sistema evalúa la ascensión a **GOLD** |
| 5 | Criterio Overlord | Ascenso manual a **DIAMOND** |

> ⚠️ **DISPLACED** no es un rango formal — es una clasificación forense del DNA Scanner.
> Los usuarios DISPLACED pueden votar pero sus votos se marcan `is_counted=False` y no afectan el ranking público.

---

## 2. Peso del Voto por Rango

Los pesos de voto se almacenan en la tabla `config_params` y son ajustables en tiempo real sin redeploy.

### 2.1 Tabla de pesos

| Rango | Clave en `config_params` | Multiplicador | Label en UI |
|-------|--------------------------|--------------|-------------|
| BRONZE | `VOTE_WEIGHT_BRONZE` | **1.0x** | Voto Estándar |
| SILVER | `VOTE_WEIGHT_SILVER` | **1.5x** | Veredicto Certificado |
| GOLD | `VOTE_WEIGHT_GOLD` | **2.5x** | Veredicto Magistral |
| DIAMOND | `VOTE_WEIGHT_DIAMOND` | **5.0x** | Sentencia Suprema |

### 2.2 Cómo se aplica el peso

El sistema lanza sliders por cada dimensión evaluativa (0–5). El backend:

1. Calcula el **promedio simple** de todos los sliders entregados por el usuario → `vote_avg`
2. Convierte el promedio en una **suma ponderada** multiplicando por el peso del rango:
   ```
   weighted_contribution = vote_avg × vote_weight
   ```
3. Esta suma ponderada se incorpora al score bayesiano (ver sección 3)

**Ejemplo práctico:**

Un usuario GOLD evalúa a un político con: transparencia=3, gestión=4, coherencia=4

```
vote_avg = (3 + 4 + 4) / 3 = 3.67
vote_weight = 2.5   ← GOLD
weighted_contribution = 3.67 × 2.5 = 9.17
```

Un usuario BRONZE con los mismos sliders aportaría solo `3.67 × 1.0 = 3.67` — la misma opinión pero sin el respaldo de la verificación de identidad.

---

## 3. Fórmula Bayesiana de Reputación

El score de reputación de una entidad nunca es un promedio simple. Usa un **modelo bayesiano de regresión hacia la media** que protege a las entidades sin votos de dominar el ranking.

### 3.1 Fórmula

```
score_nuevo = (m · C + Σ_ponderada) / (m + n_efectiva)

Donde:
  m              = prior de confianza (30 votos "fantasma" neutrales)
  C              = media global prior (3.0 — punto neutro en escala 0-5)
  Σ_ponderada    = suma acumulada de (vote_avg × vote_weight) de todos los votos
  n_efectiva     = número de votos reales registrados
```

### 3.2 Parámetros del sistema

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `BAYESIAN_M` | 30 | Votos previos neutrales (prior strength) |
| `BAYESIAN_C` | 3.0 | Score neutro (media global esperada) |
| Escala | 0.0 – 5.0 | Score mínimo / máximo posible |
| Score inicial | ~3.0 | Toda entidad comienza en el punto neutro |

### 3.3 Comportamiento por volumen

| Votos reales | Peso del prior | Estabilidad |
|---|---|---|
| 1 | 96.8% | Mínima — el score apenas se mueve |
| 10 | 75.0% | Baja — el prior domina |
| 30 | 50.0% | Media — prior y votos pesan igual |
| 100 | 23.1% | Alta — los votos ya dominan |
| 300+ | 9.1% | Muy alta — el score es representativo |

> **Por qué esto importa:** Una entidad con 2 votos perfectos (5.0) no aparece primera en el ranking. Debe ganarse su posición con volumen.

---

## 4. Dimensiones Evaluativas por Categoría

Cada categoría tiene su propio conjunto de dimensiones de voto (sliders). Están almacenadas en la tabla `evaluation_dimensions`.

| Categoría | Dimensiones |
|-----------|-------------|
| **politico** | Transparencia · Gestión · Coherencia |
| **periodista** | Probidad · Confianza · Influencia |
| **empresario** | Probidad · Confianza · Influencia |
| **empresa** | Servicio al Cliente · Ética Corporativa · Calidad de Producto · Transparencia |
| **evento** | Organización · Experiencia · Seguridad |

Escala de cada slider: **0 (pésimo) → 5 (excelente)**

---

## 5. Mecanismos Anti-Fraude

### 5.1 Anti-Brigada (1 voto por usuario por entidad)

La tabla `entity_reviews` tiene una restricción `UNIQUE(entity_id, user_id)`. Si un usuario intenta votar dos veces por la misma entidad, el endpoint devuelve `HTTP 409 Conflict`. No hay actualizaciones silenciosas — el primer voto es permanente.

> Roadmap P3: `vote_engine.py` implementará **upsert** (sobreescritura del voto anterior) para votaciones de tipo evento/versus donde el cambio de opinión tiene sentido.

### 5.2 Shadow Mode (votos fantasma)

Los usuarios clasificados como DISPLACED por el DNA Scanner pueden emitir votos, pero estos se registran con `is_counted = False`. El usuario ve una confirmación exitosa, pero el voto no modifica el `reputation_score` público de la entidad.

**Criterios de activación del Shadow Mode:**
- `is_shadow_banned = True` en el perfil
- `integrity_score < 0.2`
- Clasificación DNA = `DISPLACED`
- Cuenta desactivada

### 5.3 DNA Scanner — Clasificación Previa al Voto

Antes de procesar cualquier petición, el DNA Scanner evalúa la autenticidad del cliente:

| Clasificación | Score DNA | Acceso |
|---|---|---|
| `HUMAN` | > 70 | Acceso completo al sistema de voto |
| `SUSPICIOUS` | 30 – 70 | Voto procesado con vigilancia aumentada |
| `DISPLACED` | ≤ 30 | Shadow Mode silencioso |

**Tests forenses:**
- Velocidad de submit < 2 segundos → bot
- User-Agent de automatización (Selenium, Puppeteer, python-requests)
- `navigator.webdriver = true`
- User-Agent genérico o vacío

---

## 6. Decaimiento Temporal de Reputación

Los scores no son permanentes. Con el tiempo, toda entidad se mueve hacia el punto neutro (3.0) si no recibe votos nuevos.

### 6.1 Fórmula de decaimiento

```
score_nuevo = C + (score_actual − C) × exp(−ln(2) × días_transcurridos / semivida)

Donde:
  C           = 3.0 (punto neutro, en config_params)
  semivida    = DECAY_HALF_LIFE_DAYS (default: 180 días, en config_params)
```

### 6.2 Comportamiento

| Días sin votos | Score si partía en 5.0 | Score si partía en 1.0 |
|---|---|---|
| 0 | 5.00 | 1.00 |
| 90 | 4.29 | 1.71 |
| 180 | 4.00 (semivida) | 2.00 (semivida) |
| 360 | 3.50 | 2.50 |
| ∞ | 3.00 | 3.00 |

> El decaimiento es **simétrico**: tanto los scores altos como los bajos convergen hacia 3.0.

### 6.3 Config ajustable

| Clave en `config_params` | Default | Efecto |
|---|---|---|
| `DECAY_HALF_LIFE_DAYS` | `180` | Semivida del decaimiento |
| `DECAY_NEUTRAL_PRIOR` | `3.0` | Punto de convergencia |

El job de decaimiento se ejecuta periódicamente (configurar cron `0 3 * * *` en producción).

---

## 7. Valoración de Activo por Usuario (Asset Engine)

Cada usuario verificado tiene un **valor de mercado** calculado en tiempo real. Este valor representa el potencial de monetización de su identidad verificada.

### 7.1 Fórmula

```
Valor_USD = (Base_Tier × integrity_score × 1.2) + Data_Bonus + RUT_Bonus

Donde:
  Base_Tier   = valor base según rango (ver tabla)
  Integrity   = 0.0 – 1.0 (score de comportamiento)
  Data_Bonus  = +$5.00 si commune + age_range completos
                +$2.00 si solo uno de los dos
                +$1.00 si region informada
  RUT_Bonus   = +$3.00 si rut_hash presente (identidad verificada)
```

### 7.2 Valor base por rango

| Rango | Base_Tier | Valor máximo posible |
|-------|-----------|----------------------|
| BRONZE | $0.50 | $0.60 + bonuses |
| SILVER | $5.00 | $6.00 + bonuses |
| GOLD | $25.00 | $30.00 + bonuses |
| DIAMOND | $100.00 | $120.00 + bonuses |

### 7.3 Ejemplo: SILVER con perfil completo

```
Base:       $5.00 × 0.90 × 1.2  = $5.40
Data Bonus: commune + age_range  = $5.00
RUT Bonus:  rut_hash presente    = $3.00
─────────────────────────────────────────
Total:                            $13.40 USD
```

---

## 8. Diagrama de Flujo del Voto

```
Usuario emite voto (sliders)
        │
        ▼
[DNA Scanner] ─── DISPLACED ──→ Shadow Mode (is_counted=False)
        │
      HUMAN/SUSPICIOUS
        │
        ▼
[Anti-Brigada Check]
  UNIQUE(entity_id, user_id)
        │ ── YA VOTÓ ──→ HTTP 409 Conflict
        │
     PRIMER VOTO
        │
        ▼
[Fetch vote_weight desde config_params]
  key = "VOTE_WEIGHT_{user_rank}"
        │
        ▼
[Calcular vote_avg]
  promedio de todos los sliders
        │
        ▼
[Aplicar Bayesian Update]
  score_nuevo = (m·C + Σ_ponderada) / (m + n)
        │
        ▼
[Persistir en entities]
  reputation_score, total_reviews
        │
        ▼
[Publicar pulse Redis]
  canal: beacon:pulse:{entity_id}
        │
        ▼
[Registrar entity_review]
  (anti-brigada: ocupa el slot)
        │
        ▼
[Emitir audit_log]
  acción: VOTE_SUBMITTED
```

---

## 9. Tabla Resumen de Configuración Activa

Todos los parámetros son ajustables por el Overlord sin redeploy a través de la tabla `config_params`.

| Clave | Valor default | Descripción |
|-------|--------------|-------------|
| `VOTE_WEIGHT_BRONZE` | `1.0` | Multiplicador de voto BRONZE |
| `VOTE_WEIGHT_SILVER` | `1.5` | Multiplicador de voto SILVER |
| `VOTE_WEIGHT_GOLD` | `2.5` | Multiplicador de voto GOLD |
| `VOTE_WEIGHT_DIAMOND` | `5.0` | Multiplicador de voto DIAMOND |
| `DECAY_HALF_LIFE_DAYS` | `180` | Semivida del decaimiento (días) |
| `DECAY_NEUTRAL_PRIOR` | `3.0` | Punto neutro de convergencia |
| `PROBATION_DAYS` | `30` | Días de incubación para cuentas nuevas |
| `MAX_VOTES_PER_HOUR` | `20` | Rate limit de votos por hora por usuario |
| `SHADOW_BAN_THRESHOLD` | `0.2` | integrity_score mínimo antes de shadow ban |

---

<p align="center">
  <strong>BEACON Protocol — Motor de Integridad</strong><br>
  <em>"El peso del voto es proporcional al compromiso con la verdad."</em>
</p>
