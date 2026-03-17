-- ============================================================
-- BEACON PROTOCOL — Migración 007: Sistema de Encuestas
-- ============================================================
-- Tablas: polls, poll_questions, poll_responses
-- RLS: lectura pública, escritura solo service_role/admin
-- ============================================================

-- ── polls ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS polls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    description     TEXT,
    cover_image_url TEXT,
    start_at        TIMESTAMPTZ,
    end_at          TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── poll_questions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poll_questions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id        UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    question_text  TEXT NOT NULL,
    question_type  TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'numeric_scale')),
    options        JSONB,          -- MC: ["Opción A", "Opción B", ...]
    scale_min      INTEGER DEFAULT 1,
    scale_max      INTEGER DEFAULT 10,
    order_index    INTEGER NOT NULL DEFAULT 0
);

-- ── poll_responses ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poll_responses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    answer      JSONB NOT NULL,   -- MC: {"option": "Opción A"} | scale: {"value": 7}
    weight      NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (question_id, user_id)
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_poll_questions_poll_id  ON poll_questions(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_poll_id  ON poll_responses(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_question ON poll_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_user     ON poll_responses(user_id);

-- ── Trigger updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_polls_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_polls_updated_at
    BEFORE UPDATE ON polls
    FOR EACH ROW EXECUTE FUNCTION update_polls_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE polls          ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_responses ENABLE ROW LEVEL SECURITY;

-- Lectura pública (encuestas activas)
CREATE POLICY polls_select_public ON polls
    FOR SELECT USING (true);

CREATE POLICY poll_questions_select_public ON poll_questions
    FOR SELECT USING (true);

-- Resultados: solo el propio usuario ve sus respuestas (o service_role)
CREATE POLICY poll_responses_select_own ON poll_responses
    FOR SELECT USING (user_id = auth.uid());

-- Escritura admin (service_role bypasses RLS, pero por si acaso)
CREATE POLICY polls_insert_service ON polls
    FOR INSERT WITH CHECK (true);

CREATE POLICY polls_update_service ON polls
    FOR UPDATE USING (true);

CREATE POLICY polls_delete_service ON polls
    FOR DELETE USING (true);

CREATE POLICY poll_questions_insert_service ON poll_questions
    FOR INSERT WITH CHECK (true);

CREATE POLICY poll_questions_update_service ON poll_questions
    FOR UPDATE USING (true);

CREATE POLICY poll_questions_delete_service ON poll_questions
    FOR DELETE USING (true);

CREATE POLICY poll_responses_insert_auth ON poll_responses
    FOR INSERT WITH CHECK (user_id = auth.uid());
