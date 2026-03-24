-- ============================================================
-- BEACON PROTOCOL — Migración 018
-- Separación de votos VERIFIED vs BASIC en poll_votes
-- ============================================================
-- Agrega columna voter_rank como snapshot inmutable del rango
-- del votante al momento de emitir el voto.
--
-- Alternativa B (conservadora): todos los votos históricos quedan
-- marcados como 'BASIC'. Solo los nuevos votos capturan el rank real.
-- Esto garantiza que los resultados verificados reflejen únicamente
-- votos cuya verificación fue confirmada en tiempo de votación.
--
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.poll_votes
  ADD COLUMN IF NOT EXISTS voter_rank TEXT NOT NULL DEFAULT 'BASIC'
  CONSTRAINT poll_votes_voter_rank_check
    CHECK (voter_rank IN ('BASIC', 'VERIFIED', 'ANONYMOUS'));

COMMENT ON COLUMN public.poll_votes.voter_rank IS
  'Snapshot inmutable del rango del votante al emitir el voto.
   BASIC    → ciudadano no verificado (peso 0.5x).
   VERIFIED → ciudadano verificado    (peso 1.0x, cuenta en informes formales).
   ANONYMOUS→ voto en encuesta Flash sin autenticación.
   Votos históricos (previos a migración 018) = BASIC por diseño conservador.';
