-- ============================================================
-- BEACON PROTOCOL — Migration 014: Rank Simplification
-- Sistema de 2 rangos: BASIC (0.5x) / VERIFIED (1.0x)
-- ============================================================
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================
-- Cambios:
--   1. Nuevas columnas en users: birth_year, country, region, commune, vote_penalty
--   2. Migración de valores rank: BRONZE→BASIC, SILVER/GOLD/DIAMOND→VERIFIED
--   3. Actualización de constraint rank CHECK
--   4. entity_reviews: columnas updated_at + effective_weight (soporte time-lock)
--   5. config_params: nuevos pesos BASIC/VERIFIED + VOTE_EDIT_LOCK_DAYS
-- ============================================================

-- ─── 1. Nuevas columnas en public.users ───────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birth_year     INT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country        TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS region         TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS commune        TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vote_penalty   NUMERIC DEFAULT 1.0;

-- ─── 2. Migración de rangos existentes ────────────────────────────────────
-- BRONZE → BASIC (solo email, peso 0.5x)
UPDATE public.users SET rank = 'BASIC'    WHERE rank = 'BRONZE';
-- SILVER / GOLD / DIAMOND → VERIFIED (identidad completa, peso 1.0x)
UPDATE public.users SET rank = 'VERIFIED' WHERE rank IN ('SILVER', 'GOLD', 'DIAMOND');

-- ─── 3. Actualizar DEFAULT y CHECK del rank ───────────────────────────────
ALTER TABLE public.users ALTER COLUMN rank SET DEFAULT 'BASIC';

-- Eliminar constraint anterior (PostgreSQL la autogenera como users_rank_check)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_rank_check;
ALTER TABLE public.users ADD CONSTRAINT users_rank_check
    CHECK (rank IN ('BASIC', 'VERIFIED'));

-- ─── 4. entity_reviews: soporte time-lock y weighted avg ──────────────────
-- updated_at: timestamp de la última modificación del voto
ALTER TABLE public.entity_reviews
    ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ;
-- effective_weight: peso efectivo (rank_weight × vote_penalty) al momento del voto
-- Necesario para revertir la contribución correctamente en modificaciones
ALTER TABLE public.entity_reviews
    ADD COLUMN IF NOT EXISTS effective_weight FLOAT DEFAULT 1.0;

-- ─── 5. config_params: actualizar pesos de voto ───────────────────────────
-- Eliminar pesos del sistema de 4 rangos
DELETE FROM public.config_params
WHERE key IN ('VOTE_WEIGHT_BRONZE', 'VOTE_WEIGHT_SILVER', 'VOTE_WEIGHT_GOLD', 'VOTE_WEIGHT_DIAMOND');

-- Insertar pesos del sistema de 2 rangos + configuración time-lock
INSERT INTO public.config_params (key, value, description) VALUES
    ('VOTE_WEIGHT_BASIC',    '0.5',  'Peso de voto para usuarios BASIC (solo email verificado)'),
    ('VOTE_WEIGHT_VERIFIED', '1.0',  'Peso de voto para usuarios VERIFIED (identidad completa: RUT + datos demográficos)'),
    ('VOTE_EDIT_LOCK_DAYS',  '30',   'Días mínimos antes de que un ciudadano pueda modificar su voto sobre una entidad')
ON CONFLICT (key) DO UPDATE
    SET value       = EXCLUDED.value,
        description = EXCLUDED.description;

-- ─── 6. Comentarios actualizados ──────────────────────────────────────────
COMMENT ON COLUMN public.users.birth_year IS
    'Año de nacimiento (ej: 1990). Requerido para ascender a VERIFIED junto con RUT.';
COMMENT ON COLUMN public.users.country IS
    'País de residencia (ej: Chile). Requerido para VERIFIED. Mina de Oro.';
COMMENT ON COLUMN public.users.region IS
    'Región de residencia (ej: Metropolitana). Requerido para VERIFIED. Mina de Oro.';
COMMENT ON COLUMN public.users.commune IS
    'Comuna de residencia (ej: Providencia). Requerido para VERIFIED. Mina de Oro.';
COMMENT ON COLUMN public.users.vote_penalty IS
    'Multiplicador de penalización [0.0-1.0]. Default 1.0 = sin penalización. '
    'El Overlord puede degradar pesos sin shadow ban: BASIC → 0.25x, VERIFIED → 0.5x.';
COMMENT ON COLUMN public.entity_reviews.updated_at IS
    'Timestamp de la última modificación del voto. NULL si nunca fue modificado.';
COMMENT ON COLUMN public.entity_reviews.effective_weight IS
    'Peso efectivo del voto al emitirse (rank_weight × vote_penalty). '
    'Requerido para revertir correctamente la contribución en modificaciones.';

-- ─── Verificación post-migración ──────────────────────────────────────────
-- SELECT rank, COUNT(*) FROM public.users GROUP BY rank;
-- SELECT key, value FROM public.config_params WHERE key LIKE 'VOTE_%' OR key = 'VOTE_EDIT_LOCK_DAYS';
