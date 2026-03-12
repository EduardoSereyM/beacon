-- ============================================================
-- Migración 014: Simplificación del sistema de rangos
-- BEACON Protocol — 2026-03-12
-- ============================================================
-- Cambios:
--   1. Nuevas columnas en users: birth_year, country, region,
--      commune (si no existen), vote_penalty
--   2. Migra rangos BRONZE→BASIC, SILVER|GOLD|DIAMOND→VERIFIED
--   3. Reemplaza CHECK constraint con los 2 nuevos valores
--   4. Agrega updated_at y effective_weight a entity_reviews
--   5. Actualiza config_params: elimina pesos legacy, agrega nuevos
-- ============================================================
-- NOTA: Esta migración fue ejecutada en producción via Supabase
--       SQL Editor (corregida por migración 015).
-- ============================================================

-- ─── 1. Columnas nuevas en users ───────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS birth_year    INT,
  ADD COLUMN IF NOT EXISTS vote_penalty  NUMERIC DEFAULT 1.0;

-- country, region, commune ya existen según schema real

-- ─── 2. Migrar valores de rank ──────────────────────────────

UPDATE public.users
  SET rank = 'BASIC'
  WHERE rank IN ('BRONZE')
    OR rank IS NULL;

UPDATE public.users
  SET rank = 'VERIFIED'
  WHERE rank IN ('SILVER', 'GOLD', 'DIAMOND');

-- ─── 3. Actualizar CHECK constraint ─────────────────────────
-- Nota: La constraint original podía llamarse 'check_rank_values'
-- o 'users_rank_check'. La migración 015 cubre ambos casos.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_rank_check;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS check_rank_values;

ALTER TABLE public.users
  ADD CONSTRAINT users_rank_check
    CHECK (rank IN ('BASIC', 'VERIFIED'));

-- ─── 4. Actualizar DEFAULT de rank ──────────────────────────

ALTER TABLE public.users
  ALTER COLUMN rank SET DEFAULT 'BASIC';

-- ─── 5. Columnas nuevas en entity_reviews ───────────────────

ALTER TABLE public.entity_reviews
  ADD COLUMN IF NOT EXISTS effective_weight FLOAT DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ;

-- ─── 6. Actualizar config_params ────────────────────────────

DELETE FROM public.config_params
  WHERE key IN (
    'VOTE_WEIGHT_BRONZE',
    'VOTE_WEIGHT_SILVER',
    'VOTE_WEIGHT_GOLD',
    'VOTE_WEIGHT_DIAMOND'
  );

INSERT INTO public.config_params (key, value, description)
VALUES
  ('VOTE_WEIGHT_BASIC',    '0.5',  'Peso de voto para usuarios con rango BASIC (sin verificación completa)'),
  ('VOTE_WEIGHT_VERIFIED', '1.0',  'Peso de voto para usuarios con rango VERIFIED (identidad y demografía completa)'),
  ('VOTE_EDIT_LOCK_DAYS',  '30',   'Días de bloqueo antes de poder modificar un voto emitido')
ON CONFLICT (key) DO UPDATE
  SET value       = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at  = NOW();
