-- ============================================================
-- BEACON PROTOCOL — Migración 004
-- Agregar 'country' a la tabla users
-- ============================================================
-- Como la BBDD ya está en producción/pruebas y se añadió el 
-- selector de país en el AuthModal, necesitamos añadir el
-- campo 'country' a la tabla 'users'.

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS country TEXT;

-- Comentario para la Mina de Oro
COMMENT ON COLUMN users.country IS 'País del usuario (Ej: Chile) - añadido en v1.5';
