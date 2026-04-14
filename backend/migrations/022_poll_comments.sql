-- Migration 022: poll_comments — Reacciones Ciudadanas
-- Tabla dedicada para comentarios con reacción (👍 👎 🤔) por encuesta.
-- Un usuario puede publicar exactamente UN comentario por encuesta.
-- Soft-delete para moderación; audit_log via trigger append-only.

-- ─── Tabla principal ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.poll_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid        NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  reaction    text        CHECK (reaction IN ('👍', '👎', '🤔')),
  text        text        NOT NULL CHECK (char_length(text) BETWEEN 10 AND 500),
  rank        text        NOT NULL,          -- snapshot del rank al momento de publicar
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz            -- soft-delete; NULL = activo
);

-- Un usuario, un comentario por encuesta (solo activos)
CREATE UNIQUE INDEX IF NOT EXISTS poll_comments_one_per_user
  ON public.poll_comments (poll_id, user_id)
  WHERE deleted_at IS NULL;

-- Índices de acceso habitual
CREATE INDEX IF NOT EXISTS poll_comments_poll_id_idx
  ON public.poll_comments (poll_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS poll_comments_created_at_idx
  ON public.poll_comments (poll_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.poll_comments ENABLE ROW LEVEL SECURITY;

-- Lectura pública: cualquiera puede leer comentarios activos
CREATE POLICY "comments_select_public"
  ON public.poll_comments FOR SELECT
  USING (deleted_at IS NULL);

-- Insertar: solo el propio usuario (token JWT coincide con user_id)
CREATE POLICY "comments_insert_own"
  ON public.poll_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Soft-delete: solo el propio usuario puede borrar su comentario
CREATE POLICY "comments_delete_own"
  ON public.poll_comments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Comentarios ─────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.poll_comments IS
  'Reacciones ciudadanas por encuesta. Un comentario activo por usuario/encuesta.';
COMMENT ON COLUMN public.poll_comments.reaction IS
  'Reacción rápida opcional: 👍 de acuerdo | 👎 en desacuerdo | 🤔 con dudas';
COMMENT ON COLUMN public.poll_comments.rank IS
  'Snapshot del rank del ciudadano al momento de publicar (BASIC, VERIFIED, etc.)';
COMMENT ON COLUMN public.poll_comments.deleted_at IS
  'Soft-delete: NULL = activo. Nunca borrar filas — para moderación y audit.';
