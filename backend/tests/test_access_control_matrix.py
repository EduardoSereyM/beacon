"""
BEACON PROTOCOL — Tests ACM (Matriz de Control de Acceso)
===========================================================
Sistema v1: ANONYMOUS → BASIC (0.5x) → VERIFIED (1.0x)

3 suites:
  1. TestInheritanceChain    — Herencia recursiva de permisos
  2. TestPermissionChecks    — check_permission para cada rol
  3. TestVotingConfig        — Pesos de voto por rango
  4. TestEnforcePermission   — Auditoría de acceso denegado

"El test que no falla es el que no existe."
"""

from unittest.mock import patch

from app.core.auth.access_control_matrix import (
    resolve_permissions,
    check_permission,
    get_voting_config,
    get_behavior,
    enforce_permission,
    ACCESS_CONTROL_MATRIX,
)


class TestInheritanceChain:
    """Herencia recursiva: cada rol hereda del anterior."""

    def test_anonymous_has_no_parent(self):
        """ANONYMOUS es la raíz, no hereda de nadie."""
        node = ACCESS_CONTROL_MATRIX["ANONYMOUS"]
        assert node.get("inheritance") is None

    def test_basic_inherits_anonymous(self):
        """BASIC hereda todos los permisos de ANONYMOUS."""
        perms = resolve_permissions("BASIC")
        assert perms["access"]["browse_entities"] is True   # De ANONYMOUS
        assert perms["access"]["view_rankings"] is True     # De ANONYMOUS
        assert perms["access"]["evaluate"] is True          # Propio de BASIC

    def test_verified_inherits_basic_and_anonymous(self):
        """VERIFIED tiene permisos de ANONYMOUS + BASIC + propios."""
        perms = resolve_permissions("VERIFIED")
        assert perms["access"]["browse_entities"] is True       # ANONYMOUS
        assert perms["access"]["evaluate"] is True              # BASIC
        assert perms["access"]["verified_badge"] is True        # VERIFIED propio
        assert perms["access"]["view_advanced_metrics"] is True # VERIFIED propio
        assert perms["access"]["propose_dynamic_sliders"] is True  # VERIFIED propio
        assert perms["access"]["priority_audit"] is True        # VERIFIED propio

    def test_unknown_role_falls_to_anonymous(self):
        """Un rol desconocido cae a ANONYMOUS por seguridad."""
        perms = resolve_permissions("HACKER_LEVEL_9000")
        assert perms["access"]["evaluate"] is False
        assert perms["access"]["browse_entities"] is True


class TestPermissionChecks:
    """check_permission verifica permisos individuales."""

    def test_anonymous_cannot_evaluate(self):
        assert check_permission("ANONYMOUS", "evaluate") is False

    def test_basic_can_evaluate(self):
        assert check_permission("BASIC", "evaluate") is True

    def test_anonymous_can_browse(self):
        assert check_permission("ANONYMOUS", "browse_entities") is True

    def test_basic_cannot_propose_sliders(self):
        assert check_permission("BASIC", "propose_dynamic_sliders") is False

    def test_verified_can_propose_sliders(self):
        assert check_permission("VERIFIED", "propose_dynamic_sliders") is True

    def test_verified_has_verified_badge(self):
        assert check_permission("VERIFIED", "verified_badge") is True

    def test_basic_no_verified_badge(self):
        assert check_permission("BASIC", "verified_badge") is False

    def test_verified_has_priority_audit(self):
        assert check_permission("VERIFIED", "priority_audit") is True

    def test_nonexistent_permission_returns_false(self):
        assert check_permission("VERIFIED", "fly_to_the_moon") is False


class TestVotingConfig:
    """Configuración de voto por rango."""

    def test_anonymous_weight_is_zero(self):
        config = get_voting_config("ANONYMOUS")
        assert config["base_weight"] == 0.0
        assert config["territorial_bonus_eligible"] is False

    def test_basic_weight_is_0_5(self):
        config = get_voting_config("BASIC")
        assert config["base_weight"] == 0.5
        assert config["territorial_bonus_eligible"] is True

    def test_verified_weight_is_1_0(self):
        config = get_voting_config("VERIFIED")
        assert config["base_weight"] == 1.0
        assert config["territorial_bonus_eligible"] is True

    def test_verified_has_rut_verification_method(self):
        config = get_voting_config("VERIFIED")
        assert config.get("verification_method") == "RUT_HASH"


class TestBehavior:
    """Comportamiento del sistema por rol."""

    def test_anonymous_triggers_auth_modal(self):
        behavior = get_behavior("ANONYMOUS")
        assert behavior["on_interaction_attempt"] == "TRIGGER_AUTH_MODAL"

    def test_basic_allows_interaction(self):
        behavior = get_behavior("BASIC")
        assert behavior["on_interaction_attempt"] == "ALLOW"

    def test_verified_has_relaxed_dna(self):
        behavior = get_behavior("VERIFIED")
        assert behavior["dna_scanner_enforcement"] == "RELAXED"


class TestEnforcePermission:
    """enforce_permission registra SECURITY_AUTH_DENIED en audit."""

    @patch("app.core.audit_logger.audit_bus")
    def test_denied_logs_audit_event(self, mock_audit):
        """Cuando se deniega, se registra SECURITY_AUTH_DENIED."""
        result = enforce_permission(
            role="ANONYMOUS",
            permission="evaluate",
            user_id="anon-123",
            ip="192.168.1.1",
        )

        assert result is False
        mock_audit.log_event.assert_called_once()

        call_kwargs = mock_audit.log_event.call_args
        if call_kwargs.kwargs:
            assert call_kwargs.kwargs.get("action") == "SECURITY_AUTH_DENIED"
        else:
            assert call_kwargs[1].get("action") == "SECURITY_AUTH_DENIED"

    @patch("app.core.audit_logger.audit_bus")
    def test_allowed_does_not_log(self, mock_audit):
        """Cuando se permite, NO se registra nada."""
        result = enforce_permission(
            role="VERIFIED",
            permission="evaluate",
            user_id="verified-001",
        )

        assert result is True
        mock_audit.log_event.assert_not_called()

    @patch("app.core.audit_logger.audit_bus")
    def test_anonymous_evaluate_denied(self, mock_audit):
        """ANONYMOUS no puede evaluar y se registra el intento."""
        assert enforce_permission("ANONYMOUS", "evaluate") is False

    def test_basic_evaluate_allowed(self):
        """BASIC puede evaluar."""
        assert enforce_permission("BASIC", "evaluate") is True

    def test_verified_evaluate_allowed(self):
        """VERIFIED puede evaluar."""
        assert enforce_permission("VERIFIED", "evaluate") is True
