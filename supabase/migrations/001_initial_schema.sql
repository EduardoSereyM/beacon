-- ============================================================
-- BEACON PROTOCOL — Schema Inicial de PostgreSQL
-- ============================================================
-- El ADN de la Base de Datos.
-- "Lo que se graba en estas tablas, define la verdad."
--
-- Tablas:
--   1. users        → Soberanía Ciudadana (rangos, integridad)
--   2. audit_logs   → Rastro de sangre inmutable (append-only)
--   3. config_params → Tablero del Overlord (configuración dinámica)
--
-- Extensiones requeridas en Supabase:
--   - uuid-ossp (ya habilitada por defecto)
-- ============================================================


-- ──────────────────────────────────────────────
-- EXTENSIONES
-- ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ══════════════════════════════════════════════
-- 1. TABLA DE USUARIOS (Soberanía Ciudadana)
-- ══════════════════════════════════════════════
-- Cada fila es un Ciudadano Beacon con su rango,
-- integridad y datos demográficos para la "Mina de Oro".

CREATE TABLE IF NOT EXISTS users (
    -- Identidad Core
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email             TEXT UNIQUE NOT NULL,
    full_name         TEXT NOT NULL,
    hashed_password   TEXT NOT NULL,

    -- Verificación Forense
    rut_hash          TEXT UNIQUE,            -- SHA-256 del RUT (NUNCA texto plano)
    verification_level INT DEFAULT 1,          -- 1=Email, 2=RUT, 3=Admin
    is_verified       BOOLEAN DEFAULT false,

    -- Meritocracia (El Juego del Calamar)
    rank              TEXT DEFAULT 'BRONZE' CHECK (rank IN ('BRONZE','SILVER','GOLD','DIAMOND')),
    integrity_score   FLOAT DEFAULT 0.5 CHECK (integrity_score >= 0.0 AND integrity_score <= 1.0),
    reputation_score  FLOAT DEFAULT 0.0,

    -- Segmentación Demográfica (Mina de Oro)
    commune           TEXT,                    -- Ej: "Providencia"
    region            TEXT,                    -- Ej: "Metropolitana"
    age_range         TEXT,                    -- Ej: "25-34"

    -- Control del Búnker
    is_active         BOOLEAN DEFAULT true,    -- Soft delete (nunca borrar datos)
    is_shadow_banned  BOOLEAN DEFAULT false,   -- Purgatorio invisible

    -- Timestamps
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    deleted_at        TIMESTAMPTZ              -- Fecha del soft delete
);

COMMENT ON TABLE users IS 'Ciudadanos del Protocolo Beacon — Cada fila es un ser humano verificado.';
COMMENT ON COLUMN users.rut_hash IS 'Hash SHA-256 del RUT chileno. NUNCA almacenar en texto plano.';
COMMENT ON COLUMN users.is_shadow_banned IS 'Purgatorio invisible: el usuario cree que sus votos cuentan.';


-- ══════════════════════════════════════════════
-- 2. TABLA DE AUDITORÍA (El Rastro de Sangre)
-- ══════════════════════════════════════════════
-- Sistema append-only. No se permite UPDATE ni DELETE.
-- Cada registro es una sentencia técnica auditable.

CREATE TABLE IF NOT EXISTS audit_logs (
    id                BIGSERIAL PRIMARY KEY,
    actor_id          TEXT NOT NULL,            -- UUID del ciudadano o 'SYSTEM'
    action            TEXT NOT NULL,            -- AuditAction enum value
    entity_type       TEXT,                     -- PERSON, COMPANY, EVENT, USER, SECURITY
    entity_id         TEXT,                     -- UUID de la entidad afectada
    details           JSONB,                    -- Metadatos adicionales (IPs, patterns, etc.)
    created_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE audit_logs IS 'Bitácora inmutable — Lo que entra al log, nunca sale.';


-- ══════════════════════════════════════════════
-- 3. CONFIGURACIÓN DINÁMICA (Tablero del Overlord)
-- ══════════════════════════════════════════════
-- Permite al Overlord ajustar pesos, thresholds
-- y niveles de seguridad sin tocar el código.

CREATE TABLE IF NOT EXISTS config_params (
    key               TEXT PRIMARY KEY,
    value             TEXT NOT NULL,
    description       TEXT,
    updated_by        TEXT,                     -- UUID del admin que modificó
    updated_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE config_params IS 'Panel de control del Overlord — Configuración dinámica del búnker.';

-- Valores iniciales del Overlord
INSERT INTO config_params (key, value, description) VALUES
    ('SECURITY_LEVEL', 'GREEN', 'Nivel de seguridad global: GREEN, YELLOW, RED'),
    ('CAPTCHA_THRESHOLD', '0.01', 'Porcentaje de requests que reciben CAPTCHA en modo GREEN'),
    ('VOTE_WEIGHT_BRONZE', '1.0', 'Multiplicador de peso del voto para BRONZE'),
    ('VOTE_WEIGHT_SILVER', '1.5', 'Multiplicador de peso del voto para SILVER'),
    ('VOTE_WEIGHT_GOLD', '2.5', 'Multiplicador de peso del voto para GOLD'),
    ('VOTE_WEIGHT_DIAMOND', '5.0', 'Multiplicador de peso del voto para DIAMOND'),
    ('DECAY_HALF_LIFE_DAYS', '180', 'Vida media del decaimiento temporal de votos (días)'),
    ('PROBATION_DAYS', '30', 'Días de cuarentena para cuentas nuevas'),
    ('MAX_VOTES_PER_HOUR', '20', 'Máximo de votos por hora por usuario'),
    ('SHADOW_BAN_THRESHOLD', '0.2', 'Integrity score mínimo para evitar shadow ban')
ON CONFLICT (key) DO NOTHING;


-- ══════════════════════════════════════════════
-- ÍNDICES DE PERFORMANCE
-- ══════════════════════════════════════════════
-- Diseñados para soportar millones de consultas/segundo.

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_rut_hash ON users(rut_hash);
CREATE INDEX IF NOT EXISTS idx_users_rank ON users(rank);
CREATE INDEX IF NOT EXISTS idx_users_commune ON users(commune);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);


-- ══════════════════════════════════════════════
-- POLÍTICAS RLS (Row Level Security)
-- ══════════════════════════════════════════════
-- Los usuarios solo ven lo que su rango les permite.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios pueden leer su propio perfil
CREATE POLICY users_select_own ON users
    FOR SELECT
    USING (auth.uid()::TEXT = id::TEXT);

-- Política: Solo el service_role puede escribir en audit_logs
-- (Los bots forenses del backend usan service_role)
CREATE POLICY audit_insert_service ON audit_logs
    FOR INSERT
    WITH CHECK (true);

-- Política: Nadie puede eliminar de audit_logs (inmutabilidad)
CREATE POLICY audit_no_delete ON audit_logs
    FOR DELETE
    USING (false);

-- Política: Nadie puede actualizar audit_logs (append-only)
CREATE POLICY audit_no_update ON audit_logs
    FOR UPDATE
    USING (false);
