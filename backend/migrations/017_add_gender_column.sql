-- backend/migrations/017_add_gender_column.sql
-- Agregar columna gender a la tabla public.users

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS gender VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN public.users.gender IS 'Género opcional del ciudadano';
