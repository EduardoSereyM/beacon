-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 021: Remove redundant columns from polls table
-- ═════════════════════════════════════════════════════════════════════════════
--
-- RAZON:
-- - scale_min, scale_max, poll_type, options son detalles de PREGUNTAS, no de encuestas
-- - Una encuesta puede tener MÚLTIPLES preguntas con diferentes configs
-- - Esos campos eran solo cache/retrocompat de la PRIMERA pregunta
-- - Ahora TODO se lee de la columna 'questions' (JSONB)
--
-- CAMBIOS:
-- 1. DROP COLUMN: scale_min, scale_max, poll_type, options
-- 2. Frontend lee SIEMPRE de questions[0] para la encuesta single-question
-- 3. Backend no inserta más esos campos

BEGIN;

-- Eliminar columnas redundantes
ALTER TABLE polls DROP COLUMN IF EXISTS scale_min;
ALTER TABLE polls DROP COLUMN IF EXISTS scale_max;
ALTER TABLE polls DROP COLUMN IF EXISTS poll_type;
ALTER TABLE polls DROP COLUMN IF EXISTS options;

COMMIT;
