-- ============================================================
-- BEACON PROTOCOL — Migration 016: Añadir columnas demográficas
-- ============================================================
-- Agrega columnas de datos geográficos y demográficos del ciudadano.
-- Sin FK por ahora — texto libre permite registro inmediato.
-- La resolución a comuna_id (FK int4) queda para P4 (lookup table).
-- ============================================================
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS region     text    DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS commune    text    DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS country    text    DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS birth_year integer DEFAULT NULL;

-- ─── Verificación ─────────────────────────────────────────────────────────
-- SELECT id, email, region, commune, country, birth_year FROM public.users LIMIT 5;
