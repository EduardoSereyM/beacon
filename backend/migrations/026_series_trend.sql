-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 026: tendencia de series — eventos anotados y snapshot de ediciones cerradas
-- ═════════════════════════════════════════════════════════════════════════════
--
-- - series_events:         hitos que se anotan sobre el gráfico de tendencia
--                          ("Cambio de gabinete"). series_id NULL = aplica a todas las series.
-- - poll_results_snapshot: resultado inmutable de una edición ya cerrada (por pregunta, para
--                          votos verificados y totales). Evita releer todos los votos de cada
--                          edición en cada visita a la tendencia. Solo la edición abierta (o la
--                          recién cerrada, antes del primer cron) se calcula en vivo.
--
-- Ambas tablas: RLS activada y sin políticas → solo backend (service_role).
--
-- ROLLBACK (manual):
--   DROP TABLE IF EXISTS public.poll_results_snapshot;
--   DROP TABLE IF EXISTS public.series_events;

BEGIN;

CREATE TABLE IF NOT EXISTS public.series_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id   uuid        REFERENCES public.poll_series(id) ON DELETE RESTRICT,
  event_date  date        NOT NULL,
  label       text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  created_by  uuid        REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS series_events_series_date_idx
  ON public.series_events (series_id, event_date);

CREATE TABLE IF NOT EXISTS public.poll_results_snapshot (
  poll_id           uuid        PRIMARY KEY REFERENCES public.polls(id) ON DELETE CASCADE,
  series_id         uuid        NOT NULL REFERENCES public.poll_series(id) ON DELETE RESTRICT,
  edition           text        NOT NULL,
  template_version  integer     NOT NULL,
  total_votes       integer     NOT NULL CHECK (total_votes >= 0),
  verified_votes    integer     NOT NULL CHECK (verified_votes >= 0),
  results_total     jsonb       NOT NULL,
  results_verified  jsonb       NOT NULL,
  closed_at         timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poll_results_snapshot_series_idx
  ON public.poll_results_snapshot (series_id, edition);

ALTER TABLE public.series_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_results_snapshot ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.series_events IS
  'Hitos anotados sobre la tendencia de una serie. series_id NULL = evento general (todas las series).';
COMMENT ON TABLE public.poll_results_snapshot IS
  'Resultado inmutable de una edición cerrada. results_total/results_verified = aggregate_by_question().';

COMMIT;
