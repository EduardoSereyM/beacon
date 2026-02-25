-- ════════════════════════════════════════════════════════════
-- BEACON PROTOCOL — Migración 003: Config Territorial + Audit Trigger
-- ════════════════════════════════════════════════════════════
-- Fase 2: Vínculo Territorial
--
-- Cambios:
--   1. INSERT TERRITORIAL_BONUS_WEIGHT en config_params
--   2. Trigger de auditoría automática cuando un admin modifica config_params
--
-- "Lo que el Overlord ajusta, el Escriba lo registra."
-- ════════════════════════════════════════════════════════════

-- ─── 1. Parámetro de bonus territorial ───
INSERT INTO config_params (key, value, description, updated_by) VALUES
    ('TERRITORIAL_BONUS_WEIGHT', '1.5',
     'Multiplicador de peso para votos locales (comuna del usuario == jurisdicción de la entidad). Ajustable por el Overlord.',
     'SYSTEM_MIGRATION')
ON CONFLICT (key) DO NOTHING;


-- ─── 2. Función de auditoría para cambios en config_params ───
-- Cada vez que un admin modifica un parámetro, queda rastro inmutable.
CREATE OR REPLACE FUNCTION fn_audit_config_change()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        details,
        severity,
        created_at
    ) VALUES (
        COALESCE(NEW.updated_by, 'UNKNOWN'),
        'CONFIG_PARAM_CHANGED',
        'CONFIG',
        NEW.key,
        jsonb_build_object(
            'key', NEW.key,
            'old_value', OLD.value,
            'new_value', NEW.value,
            'changed_by', COALESCE(NEW.updated_by, 'UNKNOWN'),
            'description', NEW.description
        ),
        CASE
            WHEN NEW.key IN ('SECURITY_LEVEL', 'SHADOW_BAN_THRESHOLD') THEN 'CRITICAL'
            WHEN NEW.key LIKE 'VOTE_WEIGHT_%' THEN 'HIGH'
            ELSE 'MEDIUM'
        END,
        now()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_audit_config_change() IS
    'Trigger forense: registra cada cambio en config_params en audit_logs inmutables.';


-- ─── 3. Trigger en config_params ───
DROP TRIGGER IF EXISTS trg_config_audit ON config_params;
CREATE TRIGGER trg_config_audit
    AFTER UPDATE ON config_params
    FOR EACH ROW
    WHEN (OLD.value IS DISTINCT FROM NEW.value)
    EXECUTE FUNCTION fn_audit_config_change();

COMMENT ON TRIGGER trg_config_audit ON config_params IS
    'Dispara auditoría forense cuando el Overlord cambia un parámetro del búnker.';
