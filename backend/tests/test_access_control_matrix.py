"""
BEACON PROTOCOL — Tests ACM (Matriz de Control de Acceso)
===========================================================
3 suites:
  1. TestInheritanceChain    — Herencia recursiva de permisos
  2. TestPermissionChecks    — check_permission para cada rol
  3. TestVotingConfig        — Pesos de voto por rango
  4. TestEnforcePermission   — Auditoría de acceso denegado

"El test que no falla es el que no existe."
"""

import pytest
from unittest.mock import patch, MagicMock

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

    def test_bronze_inherits_anonymous(self):
        """BRONZE hereda todos los permisos de ANONYMOUS."""
        perms = resolve_permissions("BRONZE")
        assert perms["access"]["browse_entities"] is True  # De ANONYMOUS
        assert perms["access"]["view_rankings"] is True     # De ANONYMOUS
        assert perms["access"]["evaluate"] is True           # Propio de BRONZE

    def test_silver_inherits_bronze_and_anonymous(self):
        """SILVER tiene permisos de ANONYMOUS + BRONZE + propios."""
        perms = resolve_permissions("SILVER")
        assert perms["access"]["browse_entities"] is True    # ANONYMOUS
        assert perms["access"]["evaluate"] is True            # BRONZE
        assert perms["access"]["verified_badge"] is True      # SILVER propio
        assert perms["access"]["view_advanced_metrics"] is True  # SILVER propio

    def test_gold_inherits_full_chain(self):
        """GOLD acumula permisos de toda la cadena."""
        perms = resolve_permissions("GOLD")
        assert perms["access"]["browse_entities"] is True       # ANONYMOUS
        assert perms["access"]["evaluate"] is True               # BRONZE
        assert perms["access"]["verified_badge"] is True         # SILVER
        assert perms["access"]["propose_dynamic_sliders"] is True  # GOLD propio
        assert perms["access"]["priority_audit"] is True          # GOLD propio

    def test_diamond_inherits_gold(self):
        """DIAMOND hereda de GOLD y toda la cadena."""
        perms = resolve_permissions("DIAMOND")
        assert perms["access"]["propose_dynamic_sliders"] is True  # GOLD
        assert perms["access"]["evaluate"] is True                  # BRONZE

    def test_unknown_role_falls_to_anonymous(self):
        """Un rol desconocido cae a ANONYMOUS por seguridad."""
        perms = resolve_permissions("HACKER_LEVEL_9000")
        assert perms["access"]["evaluate"] is False
        assert perms["access"]["browse_entities"] is True


class TestPermissionChecks:
    """check_permission verifica permisos individuales."""

    def test_anonymous_cannot_evaluate(self):
        assert check_permission("ANONYMOUS", "evaluate") is False

    def test_bronze_can_evaluate(self):
        assert check_permission("BRONZE", "evaluate") is True

    def test_anonymous_can_browse(self):
        assert check_permission("ANONYMOUS", "browse_entities") is True

    def test_bronze_cannot_propose_sliders(self):
        assert check_permission("BRONZE", "propose_dynamic_sliders") is False

    def test_gold_can_propose_sliders(self):
        assert check_permission("GOLD", "propose_dynamic_sliders") is True

    def test_silver_has_verified_badge(self):
        assert check_permission("SILVER", "verified_badge") is True

    def test_bronze_no_verified_badge(self):
        assert check_permission("BRONZE", "verified_badge") is False

    def test_nonexistent_permission_returns_false(self):
        assert check_permission("GOLD", "fly_to_the_moon") is False


class TestVotingConfig:
    """Configuración de voto por rango."""

    def test_anonymous_weight_is_zero(self):
        config = get_voting_config("ANONYMOUS")
        assert config["base_weight"] == 0.0
        assert config["territorial_bonus_eligible"] is False

    def test_bronze_weight_is_one(self):
        config = get_voting_config("BRONZE")
        assert config["base_weight"] == 1.0
        assert config["territorial_bonus_eligible"] is True

    def test_silver_weight_is_1_5(self):
        config = get_voting_config("SILVER")
        assert config["base_weight"] == 1.5

    def test_gold_weight_is_2_5(self):
        config = get_voting_config("GOLD")
        assert config["base_weight"] == 2.5

    def test_diamond_weight_is_5(self):
        config = get_voting_config("DIAMOND")
        assert config["base_weight"] == 5.0

    def test_gold_has_high_volume_impact(self):
        config = get_voting_config("GOLD")
        assert config["volume_impact"] == "HIGH"


class TestBehavior:
    """Comportamiento del sistema por rol."""

    def test_anonymous_triggers_auth_modal(self):
        behavior = get_behavior("ANONYMOUS")
        assert behavior["on_interaction_attempt"] == "TRIGGER_AUTH_MODAL"

    def test_bronze_allows_interaction(self):
        behavior = get_behavior("BRONZE")
        assert behavior["on_interaction_attempt"] == "ALLOW"

    def test_silver_has_relaxed_dna(self):
        behavior = get_behavior("SILVER")
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
        # Verificar que el action sea SECURITY_AUTH_DENIED
        if call_kwargs.kwargs:
            assert call_kwargs.kwargs.get("action") == "SECURITY_AUTH_DENIED"
        else:
            assert call_kwargs[1].get("action") == "SECURITY_AUTH_DENIED"

    @patch("app.core.audit_logger.audit_bus")
    def test_allowed_does_not_log(self, mock_audit):
        """Cuando se permite, NO se registra nada."""
        result = enforce_permission(
            role="GOLD",
            permission="evaluate",
            user_id="gold-001",
        )

        assert result is True
        mock_audit.log_event.assert_not_called()

    @patch("app.core.audit_logger.audit_bus")
    def test_anonymous_evaluate_denied(self, mock_audit):
        """ANONYMOUS no puede evaluar y se registra el intento."""
        assert enforce_permission("ANONYMOUS", "evaluate") is False

    def test_gold_evaluate_allowed(self):
        """GOLD puede evaluar sin problemas."""
        assert enforce_permission("GOLD", "evaluate") is True
