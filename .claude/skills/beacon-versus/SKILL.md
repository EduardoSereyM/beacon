---
name: beacon-versus
description: Guía de arquitectura e implementación del feature P3 Versus (VS head-to-head) con tabla event_votes, endpoints y UI de comparación lado a lado
allowed-tools: Read, Write, Bash, Grep, Glob
disable-model-invocation: false
---

# beacon-versus — Feature P3: Sistema VS/Versus

## Propósito
Este skill guía la implementación completa del feature **P3 Versus** definido en el `ROADMAP_LOG.md`: un sistema de comparación head-to-head entre dos entidades con votación de evento independiente del `reputation_score` permanente.

Invoca con `/beacon-versus` cuando el usuario necesite:
- Diseñar o implementar el sistema VS
- Crear la tabla `event_votes` o sus endpoints
- Construir la UI de comparación `/versus`

---

## Arquitectura del Feature

### Principio clave
> Los votos del sistema Versus **NUNCA** afectan el `reputation_score` permanente de una entidad. Son votos de evento efímeros, almacenados en una tabla separada.

```
entities (permanente) ──────────────────────────────┐
                                                     │
event_votes (efímero por evento) ──► SOLO estadísticas de evento
                                                     │
NO hay UPDATE a entities.reputation_score ───────────┘
```

---

## Esquema de Base de Datos

### Tabla `versus_events` (nueva)
```sql
CREATE TABLE versus_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           TEXT NOT NULL,
    description     TEXT,
    entity_a_id     UUID REFERENCES entities(id) NOT NULL,
    entity_b_id     UUID REFERENCES entities(id) NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    starts_at       TIMESTAMPTZ DEFAULT now(),
    ends_at         TIMESTAMPTZ,
    created_by      TEXT,  -- actor_id del admin
    created_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT different_entities CHECK (entity_a_id != entity_b_id)
);
```

### Tabla `event_votes` (nueva)
```sql
CREATE TABLE event_votes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    versus_id       UUID REFERENCES versus_events(id) NOT NULL,
    user_id         UUID REFERENCES users(id) NOT NULL,
    voted_for       UUID REFERENCES entities(id) NOT NULL,  -- entity_a o entity_b
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(versus_id, user_id)  -- 1 voto por VS por usuario
);
```

---

## Endpoints del Backend

### GET `/api/v1/versus`
- Auth: ninguna (lectura pública)
- Respuesta: lista de eventos VS activos con `entity_a`, `entity_b`, conteo de votos
- Tabla: `versus_events` JOIN `event_votes` COUNT

### GET `/api/v1/versus/{versus_id}`
- Auth: ninguna
- Respuesta: detalle del VS con score en tiempo real
- Incluir: porcentaje A vs B, total votos, tiempo restante

### POST `/api/v1/versus/{versus_id}/vote`
- Auth: Bearer JWT (mínimo BRONZE)
- Body: `{"voted_for": "<entity_uuid>"}`
- Validaciones:
  1. El evento VS debe estar activo (`is_active = true`, dentro de fechas)
  2. El `voted_for` debe ser `entity_a_id` o `entity_b_id` del evento
  3. El usuario no debe haber votado antes (UNIQUE constraint)
  4. El usuario no debe ser `is_shadow_banned`
- Registrar en `audit_logs` con action `VERSUS_VOTE_CAST`
- **NO** actualizar `entities.reputation_score`

### POST `/api/v1/admin/versus` (admin)
- Auth: Admin JWT
- Body: `{"title": ..., "entity_a_id": ..., "entity_b_id": ..., "ends_at": ...}`
- Crear nuevo evento VS

---

## Lógica de Score del Versus

```python
total = votes_a + votes_b
if total == 0:
    pct_a, pct_b = 50.0, 50.0
else:
    pct_a = (votes_a / total) * 100
    pct_b = (votes_b / total) * 100
```

El score Bayesiano NO se usa aquí — el Versus es votación directa sin shrinkage.

---

## UI (Frontend Next.js)

### Ruta: `/versus`
```
┌─────────────────────────────────────────────────────────┐
│                  VS  |  BEACON PROTOCOL                  │
├────────────────────────┬────────────────────────────────┤
│    [EntityCard A]      │       [EntityCard B]           │
│                        │                                │
│    Nombre A            │       Nombre B                 │
│    Foto               │       Foto                     │
│    Score permanente    │       Score permanente         │
│                        │                                │
│    [████████── 65%]   │   [35% ──████████]            │
│                        │                                │
│    [VOTAR POR A]       │       [VOTAR POR B]           │
└────────────────────────┴────────────────────────────────┘
│              Total votos: 1,247  │  Cierra en 2h         │
```

### Componentes a crear
- `frontend/src/app/versus/page.tsx` — lista de VS activos
- `frontend/src/app/versus/[id]/page.tsx` — VS individual
- `frontend/src/components/versus/VersusCard.tsx` — comparación lado a lado
- `frontend/src/components/versus/VersusBar.tsx` — barra de progreso A vs B

### Hook
- `frontend/src/hooks/useVersus.ts` — fetch + votación + estado

---

## ACM (Access Control Matrix)

El Versus usa la misma ACM que los votos normales:
- `ANONYMOUS` → solo lectura, no puede votar
- `BRONZE` → puede votar en VS (peso: 1.0x)
- `SILVER` → peso: 1.5x en VS
- `GOLD` → peso: 2.5x + partículas doradas en UI
- `DIAMOND` → peso: 5.0x

---

## Audit Log

```python
await audit_bus.log_event(
    action="VERSUS_VOTE_CAST",
    actor_id=user.id,
    entity_type="VERSUS",
    entity_id=versus_id,
    details={
        "voted_for": voted_for_id,
        "entity_a": str(event.entity_a_id),
        "entity_b": str(event.entity_b_id),
        "user_rank": user.rank
    }
)
```

---

## Orden de implementación recomendado

1. Migración SQL: `supabase/migrations/006_versus_events.sql`
2. Schemas Pydantic: `backend/app/api/v1/events/schemas.py`
3. Endpoints backend: `backend/app/api/v1/events/versus.py`
4. Registrar router en `main.py`
5. Componentes frontend: `VersusCard`, `VersusBar`
6. Páginas: `/versus` y `/versus/[id]`
7. Tests: `backend/tests/test_versus.py`

---

## Referencia

- `ROADMAP_LOG.md` → P3 Versus (especificación)
- `backend/app/api/v1/endpoints/votes.py` → modelo a seguir para el endpoint de voto
- `backend/app/core/security/access_control_matrix.py` → ACM para validar rangos
- `docs/esquema_bbdd.md` → tablas actuales para no colisionar
- `frontend/src/components/status/VerdictButton.tsx` → referencia de botón de voto
