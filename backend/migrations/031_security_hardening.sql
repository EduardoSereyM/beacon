-- 031_security_hardening.sql — Endurecimiento de RLS y permisos (aplicada en producción el 2026-10-07).
-- Idempotente, en una transacción, con comprobación final que revierte todo si algo queda mal.
BEGIN;

-- 1. audit_logs inmutable (sin claves foráneas hacia ella: no bloquea la supresión de usuarios)
DROP POLICY IF EXISTS audit_select_service ON public.audit_logs;
DROP POLICY IF EXISTS audit_insert_service ON public.audit_logs;

CREATE OR REPLACE FUNCTION public.audit_logs_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs es inmutable (append-only): % no permitido', TG_OP USING ERRCODE = 'insufficient_privilege';
END; $$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();
DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_immutable();

-- 2. RLS en las 9 tablas que no la tenían (sin políticas = solo service_role)
ALTER TABLE IF EXISTS public.config_params      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_votes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.geography_cl       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sliders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.versus             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.versus_votes       ENABLE ROW LEVEL SECURITY;

-- 3. entities: fuera las políticas (public, true)
DROP POLICY IF EXISTS entities_insert_service ON public.entities;
DROP POLICY IF EXISTS entities_update_service ON public.entities;
DROP POLICY IF EXISTS entities_delete_service ON public.entities;

-- 4. users: se elimina la política ALL sin with_check (todo pasa por el backend con service_role)
DROP POLICY IF EXISTS "Usersownprofile" ON public.users;

-- 5. Privilegios: anon/authenticated pierden todo en public, salvo SELECT en entities y polls (contenido público, con RLS)
DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.tablename);
    END LOOP;
END $$;
GRANT SELECT ON TABLE public.entities TO anon, authenticated;
GRANT SELECT ON TABLE public.polls    TO anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- 6. Comprobación final: si algo quedó mal, aborta y revierte la transacción completa
DO $$
DECLARE bad text;
BEGIN
    SELECT string_agg(c.relname, ', ') INTO bad FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'Tablas sin RLS tras la migración: %', bad; END IF;

    SELECT string_agg(c.relname, ', ') INTO bad FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND (
        has_table_privilege('anon', c.oid, 'INSERT') OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE')
        OR has_table_privilege('authenticated', c.oid, 'INSERT') OR has_table_privilege('authenticated', c.oid, 'UPDATE') OR has_table_privilege('authenticated', c.oid, 'DELETE'));
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'anon/authenticated aún pueden escribir en: %', bad; END IF;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('audit_logs','entities','users')
               AND (coalesce(qual,'') IN ('true','(true)') OR coalesce(with_check,'') IN ('true','(true)'))) THEN
        RAISE EXCEPTION 'Quedan políticas permisivas en audit_logs/entities/users';
    END IF;

    IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass AND NOT tgisinternal) <> 3 THEN
        RAISE EXCEPTION 'audit_logs no tiene los 3 triggers de inmutabilidad';
    END IF;
END $$;

COMMIT;

-- ROLLBACK manual (solo si algo se rompe):
-- BEGIN;
-- DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs; DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
-- DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs; DROP FUNCTION IF EXISTS public.audit_logs_immutable();
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
-- (las políticas public/true y el RLS desactivado NO se restauran: eran el defecto)
-- COMMIT;
