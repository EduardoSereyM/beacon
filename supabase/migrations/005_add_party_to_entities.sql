-- ============================================================
-- BEACON PROTOCOL — Migración 005: Columna party en entities
-- ============================================================
-- Problema resuelto: el campo "partido político" se guardaba
-- embebido en el texto de bio ("Partido: UDI"), requiriendo
-- parseo O(N) en Python con lógica frágil a cambios de formato.
--
-- Solución: columna party TEXT indexable, consultable y limpia.
-- Backfill automático desde bio para datos existentes.
-- ============================================================


-- ─── 1. Añadir columna party ───
ALTER TABLE entities
    ADD COLUMN IF NOT EXISTS party TEXT;

COMMENT ON COLUMN entities.party IS
    'Partido político de la entidad (solo para categoría politico). '
    'Backfilled desde bio field en migración 005.';


-- ─── 2. Backfill desde bio (patrón: "Partido: Nombre del partido") ───
-- Extrae texto después de "Partido:" y elimina espacios/puntos finales.
UPDATE entities
SET party = trim(trailing '.' FROM trim(split_part(bio, 'Partido:', 2)))
WHERE bio LIKE '%Partido:%'
  AND (party IS NULL OR party = '');


-- ─── 3. Índice para filtrado eficiente ───
-- Permite WHERE party = 'UDI' en lugar de LIKE '%Partido: UDI%' en bio.
CREATE INDEX IF NOT EXISTS idx_entities_party
    ON entities(party)
    WHERE party IS NOT NULL;
