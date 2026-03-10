-- ============================================================
-- MIGRATION 010 — evaluation_dimensions
-- Dimensiones de evaluación configurables por categoría.
-- Reemplaza el hardcode del frontend con datos en DB.
--
-- "El Overlord define los criterios. El ciudadano los aplica."
-- ============================================================

CREATE TABLE IF NOT EXISTS public.evaluation_dimensions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    category      TEXT        NOT NULL,       -- politico | periodista | empresario | empresa | evento
    key           TEXT        NOT NULL,       -- slug único: transparencia, gestion, etc.
    label         TEXT        NOT NULL,       -- texto visible al ciudadano
    icon          TEXT        NOT NULL DEFAULT '📊',
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dimension_category_key UNIQUE (category, key)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_dimensions_category    ON public.evaluation_dimensions (category);
CREATE INDEX IF NOT EXISTS idx_dimensions_active      ON public.evaluation_dimensions (category, is_active, display_order);

-- RLS
ALTER TABLE public.evaluation_dimensions ENABLE ROW LEVEL SECURITY;

-- Lectura pública (ciudadanos ven las dimensiones activas)
CREATE POLICY "dimensions_read_public"
    ON public.evaluation_dimensions FOR SELECT
    USING (true);

-- Escritura solo service_role (backend con clave admin)
-- INSERT / UPDATE / DELETE solo desde el backend autenticado como service_role

-- ── Seed inicial (espejo del hardcode actual del frontend) ──────────────────
INSERT INTO public.evaluation_dimensions (category, key, label, icon, display_order) VALUES
    -- Político
    ('politico',   'transparencia',    'Transparencia',        '⚖️',  1),
    ('politico',   'gestion',          'Gestión',              '📊',  2),
    ('politico',   'coherencia',       'Coherencia',           '✅',  3),
    -- Periodista / Persona pública
    ('periodista', 'probidad',         'Probidad',             '💎',  1),
    ('periodista', 'confianza',        'Confianza',            '🤝',  2),
    ('periodista', 'influencia',       'Influencia',           '⭐',  3),
    -- Empresario
    ('empresario', 'probidad',         'Probidad',             '💎',  1),
    ('empresario', 'confianza',        'Confianza',            '🤝',  2),
    ('empresario', 'influencia',       'Influencia',           '⭐',  3),
    -- Empresa / Organización
    ('empresa',    'servicio_cliente', 'Servicio al Cliente',  '🎧',  1),
    ('empresa',    'etica_corporativa','Ética Corporativa',    '🏛️', 2),
    ('empresa',    'calidad_producto', 'Calidad de Producto',  '⭐',  3),
    ('empresa',    'transparencia',    'Transparencia',        '🔍',  4),
    -- Evento
    ('evento',     'organizacion',     'Organización',         '📋',  1),
    ('evento',     'experiencia',      'Experiencia',          '🎪',  2),
    ('evento',     'seguridad',        'Seguridad',            '🛡️', 3)
ON CONFLICT (category, key) DO NOTHING;
