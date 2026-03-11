-- ============================================================
-- BEACON PROTOCOL — Migration 015: Fix rank constraint
-- ============================================================
-- Hotfix para Migration 014.
-- El constraint real se llama 'check_rank_values', no 'users_rank_check'.
-- La migración 014 dejó ambos constraints activos en conflicto.
-- ============================================================
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ─── 1. Eliminar AMBOS constraints (el original y el parcial de 014) ─────
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS check_rank_values;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_rank_check;

-- ─── 2. Migrar datos (idempotente — seguro de re-ejecutar) ────────────────
UPDATE public.users SET rank = 'BASIC'    WHERE rank = 'BRONZE';
UPDATE public.users SET rank = 'VERIFIED' WHERE rank IN ('SILVER', 'GOLD', 'DIAMOND');

-- ─── 3. Default actualizado ───────────────────────────────────────────────
ALTER TABLE public.users ALTER COLUMN rank SET DEFAULT 'BASIC';

-- ─── 4. Constraint correcto y único ──────────────────────────────────────
ALTER TABLE public.users
    ADD CONSTRAINT users_rank_check CHECK (rank IN ('BASIC', 'VERIFIED'));

-- ─── Verificación ─────────────────────────────────────────────────────────
-- SELECT rank, COUNT(*) FROM public.users GROUP BY rank;
-- Resultado esperado: solo BASIC y VERIFIED, sin BRONZE/SILVER/GOLD/DIAMOND
