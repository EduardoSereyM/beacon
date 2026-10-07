-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 027: resultados ponderados en el snapshot de ediciones cerradas
-- ═════════════════════════════════════════════════════════════════════════════
--
-- - results_weighted: aggregate_by_question() ponderado (solo votos verificados con datos
--                     demográficos completos). NULL si la ponderación no estuvo disponible.
-- - weighting_meta:   estado, motivos, n efectivo, efecto de diseño, versión de marginales y de
--                     configuración. Nunca contiene pesos ni datos individuales.
-- Ambas son NULL en snapshots anteriores a esta migración (la tendencia las trata como
-- «ponderado no disponible»).
--
-- ROLLBACK (manual):
--   ALTER TABLE public.poll_results_snapshot
--     DROP COLUMN IF EXISTS results_weighted, DROP COLUMN IF EXISTS weighting_meta;

BEGIN;

ALTER TABLE public.poll_results_snapshot
  ADD COLUMN IF NOT EXISTS results_weighted jsonb,
  ADD COLUMN IF NOT EXISTS weighting_meta   jsonb;

COMMENT ON COLUMN public.poll_results_snapshot.results_weighted IS
  'aggregate_by_question() ponderado por raking (votos verificados con zona, sexo y edad). NULL si no disponible.';
COMMENT ON COLUMN public.poll_results_snapshot.weighting_meta IS
  'Metadatos publicables de la ponderación (estado, motivos, n_eff, versiones). Sin pesos ni datos individuales.';

COMMIT;
