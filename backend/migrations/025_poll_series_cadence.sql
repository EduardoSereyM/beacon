-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 025: poll_series.cadence — series semanales además de mensuales
-- ═════════════════════════════════════════════════════════════════════════════
--
-- - cadence:  'monthly' (por defecto, las series existentes no cambian) o 'weekly'.
--             Inmutable desde la API: cambiarla dejaría ediciones de otra cadencia.
-- - edition:  'YYYY-MM' (mensual) o 'YYYY-Www' (semana ISO, semanal). La ventana
--             semanal va de lunes 04:00 a lunes 03:59:59 hora de Chile; ese cálculo
--             vive en app/core/polls_series/series_window.py, no en la base.
-- - Índice único (series_id, edition) y RLS: sin cambios.
--
-- ORDEN DE ROLLOUT: aplicar ANTES del merge que despliega el backend, porque el
-- publicador lee poll_series.cadence.
--
-- ROLLBACK (manual; solo si no existen ediciones semanales):
--   ALTER TABLE public.polls DROP CONSTRAINT IF EXISTS polls_edition_check;
--   ALTER TABLE public.polls ADD CONSTRAINT polls_edition_check
--     CHECK (edition ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
--   ALTER TABLE public.poll_series DROP COLUMN IF EXISTS cadence;

BEGIN;

ALTER TABLE public.poll_series
  ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT 'monthly'
    CHECK (cadence IN ('monthly', 'weekly'));

-- El CHECK inline de la 024 quedó con el nombre automático polls_edition_check.
ALTER TABLE public.polls DROP CONSTRAINT IF EXISTS polls_edition_check;
ALTER TABLE public.polls
  ADD CONSTRAINT polls_edition_check
  CHECK (edition ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      OR edition ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$');

COMMENT ON COLUMN public.poll_series.cadence IS
  'monthly: una edición por mes (YYYY-MM). weekly: una por semana ISO (YYYY-Www), lunes 04:00 a lunes 03:59:59 hora de Chile.';
COMMENT ON COLUMN public.polls.edition IS
  'Edición de la serie: YYYY-MM (mensual) o YYYY-Www (semanal), hora America/Santiago. NULL si la encuesta no es de una serie.';

COMMIT;
