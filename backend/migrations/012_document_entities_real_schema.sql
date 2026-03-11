-- ============================================================
-- BEACON PROTOCOL — Migration 012: Documentar schema real de entities
-- ============================================================
-- CONTEXTO:
--   Migration 002 definió entities con entity_type ENUM + name TEXT UNIQUE +
--   metadata JSONB. El backend evolucionó (migraciones 003-007 no están en repo)
--   hacia columnas explícitas. Este script sincroniza la BBDD con el contrato
--   real del backend.
--
-- IMPACTO: Solo ADD COLUMN IF NOT EXISTS → idempotente y seguro.
--          No elimina columnas legacy (pueden existir en producción).
--
-- EJECUTAR EN: Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================


-- ══════════════════════════════════════════════
-- 1. COLUMNAS DE IDENTIDAD PERSONAL/INSTITUCIONAL
-- ══════════════════════════════════════════════
-- El backend usa first_name + last_name en lugar del campo `name` original.

ALTER TABLE public.entities
    ADD COLUMN IF NOT EXISTS first_name        TEXT,
    ADD COLUMN IF NOT EXISTS last_name         TEXT,
    ADD COLUMN IF NOT EXISTS second_last_name  TEXT;

-- Índice para búsqueda por nombre (ilike en list_entities)
CREATE INDEX IF NOT EXISTS idx_entities_first_name
    ON public.entities (first_name);
CREATE INDEX IF NOT EXISTS idx_entities_last_name
    ON public.entities (last_name);


-- ══════════════════════════════════════════════
-- 2. CATEGORIZACIÓN (reemplaza entity_type ENUM)
-- ══════════════════════════════════════════════
-- El backend usa category TEXT con CHECK constraint en lugar del ENUM.
-- Valores: politico | periodista | empresario | empresa | evento

ALTER TABLE public.entities
    ADD COLUMN IF NOT EXISTS category TEXT
        CHECK (category IN ('politico', 'periodista', 'empresario', 'empresa', 'evento'));

CREATE INDEX IF NOT EXISTS idx_entities_category
    ON public.entities (category);

COMMENT ON COLUMN public.entities.category IS
    'Tipo de entidad: politico|periodista|empresario|empresa|evento. '
    'Reemplaza entity_type ENUM de la migration 002.';


-- ══════════════════════════════════════════════
-- 3. CAMPOS DE PERFIL POLÍTICO/PROFESIONAL
-- ══════════════════════════════════════════════

ALTER TABLE public.entities
    ADD COLUMN IF NOT EXISTS position  TEXT,
    ADD COLUMN IF NOT EXISTS district  TEXT,
    ADD COLUMN IF NOT EXISTS bio       TEXT DEFAULT '';

COMMENT ON COLUMN public.entities.position IS
    'Cargo o posición: "Senador", "CEO", "Director Regional", etc.';
COMMENT ON COLUMN public.entities.district IS
    'Distrito electoral o zona geográfica de representación.';


-- ══════════════════════════════════════════════
-- 4. AFILIACIÓN Y MULTIMEDIA
-- ══════════════════════════════════════════════
-- party fue agregado en migration 005 (supabase/migrations/005_add_party_to_entities.sql)
-- photo_path y official_links son columnas del backend no documentadas.

ALTER TABLE public.entities
    ADD COLUMN IF NOT EXISTS party          TEXT,
    ADD COLUMN IF NOT EXISTS photo_path     TEXT,
    ADD COLUMN IF NOT EXISTS official_links JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_entities_party
    ON public.entities (party);

COMMENT ON COLUMN public.entities.party IS
    'Partido político o afiliación institucional. NULL para independientes.';
COMMENT ON COLUMN public.entities.photo_path IS
    'Ruta en Supabase Storage (bucket: imagenes). Ej: entities/<uuid>.jpg';
COMMENT ON COLUMN public.entities.official_links IS
    'Links oficiales: {"web": "...", "twitter": "...", "email": "..."}';


-- ══════════════════════════════════════════════
-- 5. TRAZABILIDAD FORENSE (soft delete + audit)
-- ══════════════════════════════════════════════

ALTER TABLE public.entities
    ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_by  TEXT,
    ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN public.entities.deleted_at IS
    'Timestamp de soft-delete. NULL = entidad activa. No se borran filas.';
COMMENT ON COLUMN public.entities.updated_by IS
    'UUID del admin que realizó el último cambio (admin["user_id"]).';

-- Índice para filtro de soft-delete (consultas frecuentes: is_("deleted_at", "null"))
CREATE INDEX IF NOT EXISTS idx_entities_deleted_at
    ON public.entities (deleted_at)
    WHERE deleted_at IS NULL;


-- ══════════════════════════════════════════════
-- 6. TRIGGER updated_at (si no existe aún)
-- ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_entities_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_entities_set_updated_at'
          AND tgrelid = 'public.entities'::regclass
    ) THEN
        CREATE TRIGGER trg_entities_set_updated_at
            BEFORE UPDATE ON public.entities
            FOR EACH ROW
            EXECUTE FUNCTION fn_entities_set_updated_at();
    END IF;
END$$;


-- ══════════════════════════════════════════════
-- 7. DIAGNÓSTICO: columnas actuales post-migración
-- ══════════════════════════════════════════════
-- Ejecutar para verificar que todas las columnas existen:
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'entities'
-- ORDER BY ordinal_position;
--
-- Columnas esperadas post-012:
--   id, entity_type(*), name(*), service_tags(*), metadata(*),
--   reputation_score, integrity_index(*), total_reviews, is_verified(*),
--   commune(*), region, is_active, created_by(*), created_at,
--   first_name, last_name, second_last_name, category, position,
--   district, bio, party, photo_path, official_links,
--   deleted_at, updated_by, updated_at
--
-- (*) columnas legacy de migration 002, aún presentes en producción.
