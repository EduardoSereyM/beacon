-- ============================================================
-- BEACON PROTOCOL — Migration 009: reputation_score + total_reviews en entities
-- ============================================================
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Agregar columnas de reputación si no existen
ALTER TABLE public.entities
    ADD COLUMN IF NOT EXISTS reputation_score  FLOAT   NOT NULL DEFAULT 3.0
                                               CHECK (reputation_score >= 0 AND reputation_score <= 5),
    ADD COLUMN IF NOT EXISTS total_reviews     INTEGER NOT NULL DEFAULT 0
                                               CHECK (total_reviews >= 0);

-- Índice para ordenamiento por reputación (query más frecuente del frontend)
CREATE INDEX IF NOT EXISTS idx_entities_reputation_score
    ON public.entities (reputation_score DESC);

COMMENT ON COLUMN public.entities.reputation_score IS
    'Score bayesiano [0-5]. Fórmula: (m*C + Σvotos) / (m + n), m=30, C=3.0. Default=3.0 (prior neutral).';

COMMENT ON COLUMN public.entities.total_reviews IS
    'Número de veredictos emitidos. Incrementado atómicamente por el endpoint /vote.';
