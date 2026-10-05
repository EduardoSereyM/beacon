-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 024: poll_series — encuestas mensuales recurrentes
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Una serie es la PLANTILLA; cada edición mensual es una fila normal de polls
-- enlazada por series_id. El voto, el ranking y el peso por rango no cambian.
--
-- - edition:          'YYYY-MM' (mes de la edición, hora Chile)
-- - template_version: versión de la plantilla vigente al publicar; si cambian
--                     las preguntas sube, y la tendencia corta la línea.
-- - Integridad:       ON DELETE RESTRICT: una serie con ediciones no se puede borrar
--                     (se pausa con is_active=false) para no huerfanar el histórico.
-- - Idempotencia:     índice único (series_id, edition) → publicar dos veces
--                     el mismo mes nunca duplica la edición.
--
-- - Límites:          title ≤ 280 y slug ≤ 100 para que la edición ("<título> — Septiembre 2026",
--                     "<slug>-YYYY-MM") quepa en los límites de polls (300 / 120).
-- - updated_at:       sin trigger a propósito: la serie solo se edita desde la API,
--                     que lo actualiza.
--
-- ROLLBACK (manual):
--   ALTER TABLE public.polls DROP COLUMN IF EXISTS series_id,
--     DROP COLUMN IF EXISTS edition, DROP COLUMN IF EXISTS template_version;
--   DROP TABLE IF EXISTS public.poll_series;

BEGIN;

CREATE TABLE IF NOT EXISTS public.poll_series (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text        NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 2 AND 100),
  title             text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 280),
  context           text,
  category          text        NOT NULL DEFAULT 'general',
  tags              text[]      NOT NULL DEFAULT '{}',
  questions         jsonb       NOT NULL CHECK (jsonb_typeof(questions) = 'array'
                                            AND jsonb_array_length(questions) > 0),
  requires_auth     boolean     NOT NULL DEFAULT true,
  template_version  integer     NOT NULL DEFAULT 1 CHECK (template_version >= 1),
  is_active         boolean     NOT NULL DEFAULT true,
  last_published_at timestamptz,
  created_by        uuid        REFERENCES public.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.poll_series(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS edition text CHECK (edition ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD COLUMN IF NOT EXISTS template_version integer;

CREATE UNIQUE INDEX IF NOT EXISTS polls_series_edition_unique
  ON public.polls (series_id, edition)
  WHERE series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS polls_series_id_idx
  ON public.polls (series_id)
  WHERE series_id IS NOT NULL;

-- RLS: solo backend (service_role). Sin políticas → anon/authenticated denegados.
ALTER TABLE public.poll_series ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.poll_series IS
  'Plantilla de encuestas recurrentes. Cada edición mensual es una fila de polls con series_id.';
COMMENT ON COLUMN public.polls.edition IS
  'Mes de la edición en formato YYYY-MM (hora America/Santiago). NULL si la encuesta no es de una serie.';
COMMENT ON COLUMN public.polls.template_version IS
  'Versión de la plantilla de la serie al publicar. Cambia si cambian las preguntas.';

COMMIT;
