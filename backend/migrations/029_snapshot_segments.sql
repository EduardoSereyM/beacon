-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 029: resultados por segmento en el snapshot de ediciones cerradas
-- ═════════════════════════════════════════════════════════════════════════════
--
-- - results_segments: resultados por pregunta para cada segmento (sexo, edad, zona y, solo si está
--   habilitada, posición política), con n y supresión para grupos con menos de 30 respuestas.
--   Solo agregados: nunca datos individuales. NULL en snapshots anteriores (se recalcula en vivo).
--
-- ROLLBACK (manual):
--   ALTER TABLE public.poll_results_snapshot DROP COLUMN IF EXISTS results_segments;

BEGIN;

ALTER TABLE public.poll_results_snapshot
  ADD COLUMN IF NOT EXISTS results_segments jsonb;

COMMENT ON COLUMN public.poll_results_snapshot.results_segments IS
  'Resultados agregados por segmento (sexo, edad, zona; posición política solo si está habilitada). Grupos con n < 30 sin resultados.';

COMMIT;
