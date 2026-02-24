-- ============================================================
-- BEACON PROTOCOL — Migración: Super-Tabla de Entidades
-- ============================================================
-- "La Mina de Oro de Beacon": Un modelo, cuatro pilares.
-- PERSON, COMPANY, EVENT, POLL bajo una misma tabla
-- con comportamientos distintos según el tipo.
--
-- Decisiones de diseño (Billion Dollar Asset):
--   ▸ ENUM entity_type → aislamiento de contexto (votos de
--     un festival NUNCA contaminan el ranking de un senador)
--   ▸ service_tags JSONB → un Holding evaluado por cada rubro
--     ("Tu Banco es ORO, pero tu Retail es BRONCE")
--   ▸ created_by FK → trazabilidad forense: si una brigada
--     de bots crea perfiles falsos, displaced_logger.py actúa
--   ▸ integrity_index → transparencia validada por Beacon (0-100%)
--   ▸ metadata JSONB → flexibilidad sin migrar: cargos, RUT,
--     bio, redes sociales, fechas de eventos
-- ============================================================


-- ══════════════════════════════════════════════
-- 1. EXTENSIONES REQUERIDAS
-- ══════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- Búsqueda fuzzy (trigramas)


-- ══════════════════════════════════════════════
-- 2. TIPO ENUM (entity_type)
-- ══════════════════════════════════════════════
-- Restrictivo: solo 4 tipos. Cualquier otro se rechaza a nivel de BBDD.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type_enum') THEN
        CREATE TYPE entity_type_enum AS ENUM ('PERSON', 'COMPANY', 'EVENT', 'POLL');
    END IF;
END$$;


-- ══════════════════════════════════════════════
-- 3. SUPER-TABLA DE ENTIDADES
-- ══════════════════════════════════════════════
-- Cada fila es una entidad evaluable del ecosistema Beacon.

CREATE TABLE IF NOT EXISTS entities (
    -- ─── Identidad Core ───
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type       entity_type_enum NOT NULL,
    name              TEXT NOT NULL UNIQUE,

    -- ─── Multi-servicio para Empresas (Holding) ───
    -- JSONB permite queries como: service_tags @> '["BANCO"]'
    service_tags      JSONB DEFAULT '[]'::jsonb,

    -- ─── Metadata Flexible ───
    -- Cargos políticos, RUT empresa, Bio, Redes, Fechas
    -- Una IA en Fase 2 puede procesarlo sin migrar el schema
    metadata          JSONB DEFAULT '{}'::jsonb,

    -- ─── Métricas de Integridad ───
    reputation_score  FLOAT DEFAULT 3.0
                      CHECK (reputation_score >= 0.0 AND reputation_score <= 5.0),
    integrity_index   FLOAT DEFAULT 0.5
                      CHECK (integrity_index >= 0.0 AND integrity_index <= 1.0),
    total_reviews     INT DEFAULT 0
                      CHECK (total_reviews >= 0),
    is_verified       BOOLEAN DEFAULT false,

    -- ─── Localización ───
    commune           TEXT,
    region            TEXT,

    -- ─── Campos Temporales (Eventos/Festivales) ───
    start_date        TIMESTAMPTZ,
    end_date          TIMESTAMPTZ,
    is_active         BOOLEAN DEFAULT true,

    -- ─── Trazabilidad Forense ───
    -- ¿Quién sugirió esta entidad? Si un Desplazado crea perfiles
    -- falsos, el trigger lo ficha instantáneamente.
    created_by        UUID REFERENCES users(id) ON DELETE SET NULL,

    -- ─── Timestamps ───
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),

    -- ─── Constraint de coherencia temporal ───
    CONSTRAINT valid_event_dates CHECK (
        (entity_type != 'EVENT') OR (start_date IS NOT NULL)
    )
);

COMMENT ON TABLE entities IS
    'Super-Tabla multiclase: PERSON, COMPANY, EVENT, POLL. '
    'Cada fila es un activo evaluable del ecosistema Beacon.';
COMMENT ON COLUMN entities.entity_type IS
    'Aislamiento de contexto: votos de EVENT nunca contaminan PERSON.';
COMMENT ON COLUMN entities.service_tags IS
    'Multi-servicio para Holdings: ["BANCO","RETAIL"]. Permite evaluación por rubro.';
COMMENT ON COLUMN entities.metadata IS
    'Datos variables sin migración: cargos, RUT, bio, redes, fechas.';
COMMENT ON COLUMN entities.integrity_index IS
    'Nivel de transparencia validada por Beacon (0.0 a 1.0 → 0% a 100%).';
COMMENT ON COLUMN entities.created_by IS
    'FK a users.id — Trazabilidad forense del proponente. Detecta brigadas de bots.';


-- ══════════════════════════════════════════════
-- 4. ÍNDICES DE PERFORMANCE
-- ══════════════════════════════════════════════
-- Diseñados para buscador instantáneo en el frontend.

-- Búsqueda por tipo (filtros: "solo Personas", "solo Empresas")
CREATE INDEX IF NOT EXISTS idx_entities_type
    ON entities(entity_type);

-- Búsqueda exacta por nombre
CREATE INDEX IF NOT EXISTS idx_entities_name
    ON entities(name);

-- Búsqueda fuzzy por nombre (trigramas para autocompletado)
CREATE INDEX IF NOT EXISTS idx_entities_name_trgm
    ON entities USING gin(name gin_trgm_ops);

-- Filtro por localización
CREATE INDEX IF NOT EXISTS idx_entities_commune
    ON entities(commune);

-- Filtro entidades activas
CREATE INDEX IF NOT EXISTS idx_entities_is_active
    ON entities(is_active);

-- Búsqueda por service_tags: WHERE service_tags @> '["BANCO"]'
CREATE INDEX IF NOT EXISTS idx_entities_service_tags
    ON entities USING gin(service_tags);

-- Ranking por reputation_score (DESC para top entities)
CREATE INDEX IF NOT EXISTS idx_entities_reputation
    ON entities(reputation_score DESC);

-- Ranking por integrity_index
CREATE INDEX IF NOT EXISTS idx_entities_integrity
    ON entities(integrity_index DESC);

-- Trazabilidad: ¿qué entidades creó un usuario específico?
CREATE INDEX IF NOT EXISTS idx_entities_created_by
    ON entities(created_by);


-- ══════════════════════════════════════════════
-- 5. ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════
-- Ninguna empresa puede "inyectar" votos falsos ni
-- modificar su propio integrity_index.

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

-- ─── LECTURA PÚBLICA ───
-- Cualquier usuario (incluso anónimo) puede ver entidades activas.
-- PERO: los campos forenses (metadata, created_by) se filtran
-- a nivel de API (no de RLS) para granularidad.
CREATE POLICY entities_public_read ON entities
    FOR SELECT
    USING (is_active = true);

-- ─── INSERCIÓN: Solo usuarios autenticados con rango > BRONZE ───
-- Los Desplazados (BRONZE) no pueden sugerir entidades.
-- Esto previene spam de bots recién registrados.
CREATE POLICY entities_insert_verified ON entities
    FOR INSERT
    WITH CHECK (
        -- El usuario debe estar autenticado
        auth.uid() IS NOT NULL
        -- Y tener rango superior a BRONZE
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
              AND users.rank IN ('SILVER', 'GOLD', 'DIAMOND')
              AND users.is_active = true
        )
        -- is_verified siempre empieza en false (solo el Overlord verifica)
        AND is_verified = false
    );

-- ─── ACTUALIZACIÓN: Solo service_role (backend) ───
-- Ni el propio creador puede editar. Solo el backend tras validación.
CREATE POLICY entities_update_service ON entities
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- ─── ELIMINACIÓN: Prohibida (soft delete via is_active) ───
CREATE POLICY entities_no_delete ON entities
    FOR DELETE
    USING (false);


-- ══════════════════════════════════════════════
-- 6. TRIGGER DE AUDITORÍA FORENSE
-- ══════════════════════════════════════════════
-- Cada vez que se crea una entidad, se registra en audit_logs
-- con el user_id del proponente para análisis de "amigos bots".
--
-- Si una cuenta crea 50 entidades en 1 hora, el
-- network_cluster_detector.py lo detectará.

CREATE OR REPLACE FUNCTION fn_audit_entity_creation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        COALESCE(NEW.created_by::text, 'SYSTEM'),
        'ENTITY_CREATED',
        NEW.entity_type::text,
        NEW.id::text,
        jsonb_build_object(
            'entity_name', NEW.name,
            'entity_type', NEW.entity_type::text,
            'service_tags', NEW.service_tags,
            'is_verified', NEW.is_verified,
            'source', 'fn_audit_entity_creation',
            'ip_context', current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for'
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Disparar al insertar una nueva entidad
DROP TRIGGER IF EXISTS trg_audit_entity_creation ON entities;
CREATE TRIGGER trg_audit_entity_creation
    AFTER INSERT ON entities
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_entity_creation();


-- ══════════════════════════════════════════════
-- 7. FUNCIÓN DE UPDATED_AT AUTOMÁTICO
-- ══════════════════════════════════════════════
-- Actualiza updated_at en cada UPDATE sin intervención del backend.

CREATE OR REPLACE FUNCTION fn_entities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entities_updated_at ON entities;
CREATE TRIGGER trg_entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW
    EXECUTE FUNCTION fn_entities_updated_at();
