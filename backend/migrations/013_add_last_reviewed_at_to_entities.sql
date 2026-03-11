-- ============================================================
-- BEACON PROTOCOL — Migration 013: last_reviewed_at en entities
-- ============================================================
-- CONTEXTO:
--   El job de decay (reputation_decay.py) necesita saber cuándo fue
--   el último voto de cada entidad para calcular el decaimiento temporal.
--   Sin esta columna, el job haría JOINs costosos con entity_reviews.
--
-- IMPACTO:
--   - ADD COLUMN IF NOT EXISTS → idempotente y seguro
--   - UPDATE: inicializa last_reviewed_at = updated_at para entidades existentes
--   - votes.py actualiza esta columna en cada voto (ver PR-12)
--
-- EJECUTAR EN: Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

ALTER TABLE public.entities
    ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

-- Inicializar con updated_at para entidades que ya tienen votos
UPDATE public.entities
    SET last_reviewed_at = updated_at
    WHERE last_reviewed_at IS NULL
      AND total_reviews > 0;

-- Índice para el decay job (consulta: WHERE last_reviewed_at < now() - interval)
CREATE INDEX IF NOT EXISTS idx_entities_last_reviewed_at
    ON public.entities (last_reviewed_at)
    WHERE last_reviewed_at IS NOT NULL;

COMMENT ON COLUMN public.entities.last_reviewed_at IS
    'Timestamp del último voto recibido. Usado por el decay job para calcular '
    'el decaimiento temporal del reputation_score hacia el prior Bayesiano (3.0). '
    'NULL = nunca votada (sin decay).';
