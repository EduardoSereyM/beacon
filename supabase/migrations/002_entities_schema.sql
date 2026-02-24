-- ============================================================
-- BEACON PROTOCOL — Migración: Tabla de Entidades
-- ============================================================
-- SuperEntities: Un modelo, cuatro pilares.
-- PERSON, COMPANY, EVENT, POLL bajo una misma tabla
-- con comportamientos distintos según el tipo.
-- ============================================================


-- ══════════════════════════════════════════════
-- TABLA DE ENTIDADES (El Ecosistema Multiclase)
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entities (
    -- Identidad Core
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            TEXT NOT NULL CHECK (type IN ('PERSON','COMPANY','EVENT','POLL')),
    name            TEXT NOT NULL,

    -- Multi-servicio para Empresas (Holding)
    service_tags    TEXT[] DEFAULT '{}',         -- ARRAY: ['BANCO', 'RETAIL']

    -- Metadata Flexible (JSONB)
    metadata        JSONB DEFAULT '{}',          -- Cargos, rubros, info extra

    -- Métricas de Integridad
    reputation_score FLOAT DEFAULT 3.0,          -- Nota base (Shrinkage bayesiano)
    total_reviews   INT DEFAULT 0,               -- Cantidad de reseñas/votos
    is_verified     BOOLEAN DEFAULT false,        -- Verificado por el Overlord

    -- Localización
    commune         TEXT,
    region          TEXT,

    -- Para Eventos/Festivales (campos temporales)
    start_date      TIMESTAMPTZ,                 -- Inicio del evento
    end_date        TIMESTAMPTZ,                 -- Fin del evento
    is_active       BOOLEAN DEFAULT true,         -- Evento abierto/cerrado

    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE entities IS 'Ecosistema multiclase: PERSON, COMPANY, EVENT, POLL bajo una misma lógica.';
COMMENT ON COLUMN entities.service_tags IS 'Multi-servicio para empresas tipo holding (ej: BANCO, RETAIL).';
COMMENT ON COLUMN entities.metadata IS 'Metadata flexible: cargos políticos, rubros corporativos, etc.';


-- ══════════════════════════════════════════════
-- ÍNDICES DE PERFORMANCE
-- ══════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
CREATE INDEX IF NOT EXISTS idx_entities_name_trgm ON entities USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_commune ON entities(commune);
CREATE INDEX IF NOT EXISTS idx_entities_is_active ON entities(is_active);
CREATE INDEX IF NOT EXISTS idx_entities_service_tags ON entities USING gin(service_tags);
CREATE INDEX IF NOT EXISTS idx_entities_reputation ON entities(reputation_score DESC);


-- ══════════════════════════════════════════════
-- EXTENSIÓN PARA BÚSQUEDA FUZZY
-- ══════════════════════════════════════════════
-- Necesaria para el índice gin_trgm_ops (búsqueda por nombre)
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ══════════════════════════════════════════════
-- RLS (Row Level Security)
-- ══════════════════════════════════════════════

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

-- Política: Todos pueden leer entidades activas (búsqueda pública)
CREATE POLICY entities_public_read ON entities
    FOR SELECT
    USING (is_active = true);

-- Política: Solo el service_role puede crear/editar entidades
CREATE POLICY entities_service_write ON entities
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY entities_service_update ON entities
    FOR UPDATE
    USING (true);
