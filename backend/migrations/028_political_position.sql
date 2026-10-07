-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 028: posición política autodeclarada (dato SENSIBLE, opcional)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- - political_position:            'Derecha' | 'Centro' | 'Izquierda' | 'Independiente'. NULL = no informa.
-- - political_position_consent_at: instante del consentimiento expreso.
-- - Integridad: no puede existir el dato sin consentimiento (CHECK). Borrar el dato borra también
--   la marca de consentimiento: el usuario puede retirarlo cuando quiera.
-- - Uso: SOLO agregado (segmentos con n >= 30), nunca individual, nunca ponderación. Los segmentos
--   públicos por esta variable quedan apagados (SERIES_POLITICAL_SEGMENT_ENABLED=false) hasta
--   la validación legal.
-- - users ya tiene RLS: el dato solo lo lee el backend (service_role) y el propio usuario vía API.
--
-- ROLLBACK (manual):
--   ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_political_position_consent,
--     DROP CONSTRAINT IF EXISTS users_political_position_check,
--     DROP COLUMN IF EXISTS political_position, DROP COLUMN IF EXISTS political_position_consent_at;

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS political_position text,
  ADD COLUMN IF NOT EXISTS political_position_consent_at timestamptz;

ALTER TABLE public.users
  ADD CONSTRAINT users_political_position_check
    CHECK (political_position IS NULL
           OR political_position IN ('Derecha', 'Centro', 'Izquierda', 'Independiente')),
  ADD CONSTRAINT users_political_position_consent
    CHECK ((political_position IS NULL) = (political_position_consent_at IS NULL));

COMMENT ON COLUMN public.users.political_position IS
  'Autodeclaración opcional (dato sensible). Solo uso agregado; nunca individual ni para ponderar.';
COMMENT ON COLUMN public.users.political_position_consent_at IS
  'Consentimiento expreso para tratar political_position. NULL si y solo si no hay dato.';

COMMIT;
