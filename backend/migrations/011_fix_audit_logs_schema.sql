-- ============================================================
-- MIGRATION 011 — Fix audit_logs schema
-- El audit_logger inserta: actor_id, action, entity_type,
-- entity_id, details, created_at.
-- Si la tabla existe con otras columnas, agrega las faltantes.
-- Si no existe, la crea completa.
-- ============================================================

-- Crear la tabla si no existe (idempotente)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    TEXT        NOT NULL DEFAULT 'SYSTEM',
    action      TEXT        NOT NULL,
    entity_type TEXT        NOT NULL DEFAULT '',
    entity_id   TEXT        NOT NULL DEFAULT '',
    details     JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agregar columnas faltantes si la tabla ya existía con otro schema
ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS actor_id    TEXT        NOT NULL DEFAULT 'SYSTEM',
    ADD COLUMN IF NOT EXISTS action      TEXT        NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS entity_type TEXT        NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS entity_id   TEXT        NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS details     JSONB       NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Índices para el visor de logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id    ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs (entity_type);

-- RLS: solo lectura para service_role (backend); ningún acceso público
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- El backend usa service_role → bypasa RLS, no necesita política explícita.
-- No hay política de lectura pública → los ciudadanos no pueden leer el log.
