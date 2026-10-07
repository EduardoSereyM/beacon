-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 030: series de tipo «agenda» (opciones curadas por edición)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Una serie «tracker» repite las mismas preguntas y opciones (se compara en el tiempo). Una serie
-- «agenda» (p. ej. «noticia más importante de la semana») repite la PREGUNTA pero las opciones las
-- define una persona cada edición: no se compara opción por opción sino que cada edición muestra su
-- propio ranking.
--
-- - poll_series.kind:            'tracker' (por defecto; las series existentes no cambian) | 'agenda'.
-- - series_edition_options:     opciones de una edición de una serie agenda. Sin fila → la edición no
--                               se publica y el cron la informa como `awaiting_options` (no es un fallo).
--                               Se pueden definir hasta que la edición se publica; después, 409 en la API.
-- - RLS activada y sin políticas: solo backend (service_role).
--
-- ROLLBACK (manual):
--   DROP TABLE IF EXISTS public.series_edition_options;
--   ALTER TABLE public.poll_series DROP COLUMN IF EXISTS kind;

BEGIN;

ALTER TABLE public.poll_series
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'tracker'
    CHECK (kind IN ('tracker', 'agenda'));

CREATE TABLE IF NOT EXISTS public.series_edition_options (
  series_id   uuid        NOT NULL REFERENCES public.poll_series(id) ON DELETE RESTRICT,
  edition     text        NOT NULL CHECK (edition ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
                                      OR edition ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'),
  options     jsonb       NOT NULL CHECK (jsonb_typeof(options) = 'array'
                                      AND jsonb_array_length(options) BETWEEN 2 AND 12),
  created_by  uuid        REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, edition)
);

ALTER TABLE public.series_edition_options ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.poll_series.kind IS
  'tracker: mismas preguntas y opciones cada edición. agenda: misma pregunta, opciones curadas por edición.';
COMMENT ON TABLE public.series_edition_options IS
  'Opciones de una edición de una serie agenda, definidas por el equipo editorial antes de que abra.';

COMMIT;
