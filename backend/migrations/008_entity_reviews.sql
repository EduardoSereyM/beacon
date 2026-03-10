-- ============================================================
-- BEACON PROTOCOL — Migration 008: entity_reviews
-- Anti-brigada: un voto por usuario por entidad
-- ============================================================
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.entity_reviews (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id   UUID        NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    vote_avg    FLOAT       NOT NULL CHECK (vote_avg >= 0 AND vote_avg <= 5),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Un ciudadano, un veredicto por entidad
    CONSTRAINT entity_reviews_unique_vote UNIQUE (entity_id, user_id)
);

-- Índices para queries de anti-brigada (velocidad en check previo al voto)
CREATE INDEX IF NOT EXISTS idx_entity_reviews_entity_user
    ON public.entity_reviews (entity_id, user_id);

CREATE INDEX IF NOT EXISTS idx_entity_reviews_user
    ON public.entity_reviews (user_id);

-- RLS: solo el backend (service_role) puede escribir/leer
ALTER TABLE public.entity_reviews ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados pueden leer solo sus propias reviews
CREATE POLICY "Users can read own reviews"
    ON public.entity_reviews
    FOR SELECT
    USING (auth.uid() = user_id);

-- El backend (service_role) bypasea RLS — no necesita política explícita

COMMENT ON TABLE public.entity_reviews IS
    'Registro de veredictos emitidos por ciudadano. UNIQUE(entity_id, user_id) garantiza un voto por par. Anti-brigada.';
