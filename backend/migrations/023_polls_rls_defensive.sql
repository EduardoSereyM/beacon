-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 023: RLS defensiva para polls y poll_votes
-- ═════════════════════════════════════════════════════════════════════════════
--
-- RAZON:
-- Ninguna migración versionada declara RLS para polls ni poll_votes (la tabla
-- se creó fuera del repo). Esta migración es IDEMPOTENTE: no falla si RLS ya
-- está activo y solo crea las políticas que no existan por nombre.
--
-- MODELO DE ACCESO:
-- - Todo el acceso de la app pasa por el backend con service_role (bypassa RLS).
-- - polls: lectura pública solo de encuestas publicadas (status active/paused/
--   closed) cuya fecha de inicio ya pasó. Sin políticas de escritura:
--   anon/authenticated no pueden insertar, editar ni borrar.
-- - poll_votes: cada usuario solo puede leer sus propios votos. Sin escritura.
--
-- NOTA: si ya existían políticas con otros nombres (p.ej. "allow all"), esta
-- migración NO las elimina. Revisar con:
--   SELECT tablename, policyname, cmd, roles FROM pg_policies
--   WHERE tablename IN ('polls','poll_votes');
--
-- ROLLBACK (manual):
--   DROP POLICY IF EXISTS polls_select_published ON public.polls;
--   DROP POLICY IF EXISTS poll_votes_select_own ON public.poll_votes;
--   ALTER TABLE public.polls DISABLE ROW LEVEL SECURITY;      -- solo si antes estaba off
--   ALTER TABLE public.poll_votes DISABLE ROW LEVEL SECURITY; -- solo si antes estaba off

-- Transaccional: si algo falla no queda RLS activo sin su política.
-- Requisito previo: poll_votes.user_id debe ser uuid (auth.uid() es uuid):
--   SELECT data_type FROM information_schema.columns
--   WHERE table_name='poll_votes' AND column_name='user_id';

BEGIN;

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'polls'
      AND policyname = 'polls_select_published'
  ) THEN
    CREATE POLICY polls_select_published
      ON public.polls FOR SELECT
      USING (status IN ('active', 'paused', 'closed') AND starts_at <= now());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'poll_votes'
      AND policyname = 'poll_votes_select_own'
  ) THEN
    CREATE POLICY poll_votes_select_own
      ON public.poll_votes FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

COMMIT;
