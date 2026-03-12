-- ============================================================
-- Migración 015: Hotfix — constraint de rank
-- BEACON Protocol — 2026-03-12
-- ============================================================
-- Contexto:
--   La migración 014 asumió que el constraint se llamaba
--   'users_rank_check', pero en producción se llamaba
--   'check_rank_values' (creado por una migración anterior).
--   Este script es idempotente y cubre ambos nombres.
--
-- Error original:
--   ERROR: 23514 new row for relation "users" violates
--   check constraint "check_rank_values"
--
-- Ejecutado manualmente en Supabase SQL Editor.
-- Estado: ✅ Aplicado en producción (confirmado: BASIC:2, VERIFIED:1)
-- ============================================================

-- ─── 1. Eliminar ambas constraints (cualquiera que exista) ──

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS check_rank_values;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_rank_check;

-- ─── 2. Asegurar que los valores actuales sean válidos ───────

UPDATE public.users
  SET rank = 'BASIC'
  WHERE rank NOT IN ('BASIC', 'VERIFIED')
     OR rank IS NULL;

-- ─── 3. Agregar constraint correcta ─────────────────────────

ALTER TABLE public.users
  ADD CONSTRAINT users_rank_check
    CHECK (rank IN ('BASIC', 'VERIFIED'));

-- ─── 4. Verificación (ejecutar para confirmar) ───────────────
-- SELECT rank, COUNT(*) FROM public.users GROUP BY rank;
-- Resultado esperado: BASIC y/o VERIFIED únicamente.
