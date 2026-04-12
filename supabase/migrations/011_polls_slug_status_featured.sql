-- ================================================================
-- BEACON PROTOCOL — Migración 011: Polls como entidades propias
-- ================================================================
-- Agrega los campos necesarios para que cada encuesta tenga:
--   1. slug        → URL canónica pública (/encuestas/[slug])
--   2. status      → ciclo de vida explícito (draft/active/paused/closed)
--   3. is_featured → control manual para el hero del home
--   4. context     → texto contextual visible en la página de la encuesta
--   5. source_url  → fuente de origen (agentes, medios, etc.)
--   6. tags        → etiquetas para búsqueda y filtrado
--
-- Retrocompatibilidad: is_active se mantiene como columna derivada.
-- Los registros existentes se migran automáticamente por status.
-- ================================================================

-- ─── 1. Nuevos campos ───────────────────────────────────────────

ALTER TABLE polls
    ADD COLUMN IF NOT EXISTS slug        TEXT,
    ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'active'
                                         CHECK (status IN ('draft', 'active', 'paused', 'closed')),
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS context     TEXT,
    ADD COLUMN IF NOT EXISTS source_url  TEXT,
    ADD COLUMN IF NOT EXISTS tags        TEXT[] DEFAULT '{}';

-- ─── 2. Migrar datos existentes ─────────────────────────────────
-- Registros con is_active=true y fechas abiertas → active
-- Registros con is_active=false o fechas vencidas → closed

UPDATE polls
SET status = CASE
    WHEN is_active = true
         AND starts_at <= now()
         AND ends_at   >= now() THEN 'active'
    WHEN is_active = true
         AND starts_at > now() THEN 'draft'
    ELSE 'closed'
END
WHERE status = 'active';  -- solo los que aún están en el default

-- ─── 3. Generar slugs para registros existentes ─────────────────
-- Usa el id como fallback seguro para registros sin slug
UPDATE polls
SET slug = 'encuesta-' || SUBSTRING(id::text, 1, 8)
WHERE slug IS NULL OR slug = '';

-- ─── 4. Constraints e índices ───────────────────────────────────

ALTER TABLE polls
    ALTER COLUMN slug SET NOT NULL;

-- Unicidad en slug (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS polls_slug_unique_idx
    ON polls (LOWER(slug));

-- Índice para búsquedas frecuentes por status
CREATE INDEX IF NOT EXISTS polls_status_idx
    ON polls (status);

-- Índice para el hero (featured activas)
CREATE INDEX IF NOT EXISTS polls_featured_status_idx
    ON polls (is_featured, status)
    WHERE is_featured = true;

-- ─── 5. Comentarios ─────────────────────────────────────────────

COMMENT ON COLUMN polls.slug        IS 'URL slug único: beaconchile.cl/encuestas/{slug}';
COMMENT ON COLUMN polls.status      IS 'Ciclo de vida: draft → active ⇄ paused → closed';
COMMENT ON COLUMN polls.is_featured IS 'Si true, aparece en el hero del home (mixto: featured > más votada)';
COMMENT ON COLUMN polls.context     IS 'Texto contextual visible en la página pública de la encuesta';
COMMENT ON COLUMN polls.source_url  IS 'URL de la fuente de origen (agente, medio, etc.)';
COMMENT ON COLUMN polls.tags        IS 'Etiquetas para búsqueda y filtrado (array de text)';
