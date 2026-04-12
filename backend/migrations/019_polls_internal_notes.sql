-- ============================================================
-- BEACON PROTOCOL — Migración 019
-- Campo internal_notes en tabla polls
-- ============================================================
-- Agrega columna internal_notes para notas del equipo BEACON
-- visibles solo en el dashboard de administración.
-- No se expone en ningún endpoint público.
--
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.polls
    ADD COLUMN IF NOT EXISTS internal_notes TEXT;

COMMENT ON COLUMN public.polls.internal_notes IS
    'Notas internas del equipo BEACON. Solo visible en dashboard de administración.
     No se expone en endpoints públicos. Ej: fuente del tema, decisiones de moderación.';
