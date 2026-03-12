"""
BEACON PROTOCOL — Access Control Matrix (Matriz de Poder)
===========================================================
Única fuente de verdad para permisos por rol.

Arquitectura v1 (sistema binario):
  - ANONYMOUS hereda de → nada (base mínima, sin cuenta)
  - BASIC hereda de → ANONYMOUS (email verificado, 0.5x)
  - VERIFIED hereda de → BASIC  (identidad completa, 1.0x)

Requisitos VERIFIED: rut_hash + birth_year + país + región + comuna.

"El poder no se repite. Se hereda, se acumula, se audita."
"""

import logging
from typing import Dict, Any, Optional
from copy import deepcopy

logger = logging.getLogger("beacon.acm")


# ═══════════════════════════════════════════
#  LA MATRIZ — Definición JSONB
# ═══════════════════════════════════════════

ACCESS_CONTROL_MATRIX: Dict[str, Dict[str, Any]] = {
    "ANONYMOUS": {
        "label": "Visitante",
        "inheritance": None,
        "access": {
            "browse_entities": True,
            "view_rankings": True,
            "view_objective_data": True,
            "evaluate": False,
            "view_integrity_stats": False,
            "view_own_impact": False,
            "edit_own_verdict": False,
            "verified_badge": False,
            "view_advanced_metrics": False,
            "propose_dynamic_sliders": False,
            "priority_audit": False,
            "admin_panel": False,
        },
        "behavior": {
            "on_interaction_attempt": "TRIGGER_AUTH_MODAL",
            "dna_scanner_enforcement": "STANDARD",
        },
        "voting": {
            "base_weight": 0.0,
            "territorial_bonus_eligible": False,
        },
    },

    "BASIC": {
        "label": "Ciudadano Base",
        "inheritance": "ANONYMOUS",
        "access": {
            "evaluate": True,
            "view_own_impact": True,
            "edit_own_verdict": True,
        },
        "behavior": {
            "on_interaction_attempt": "ALLOW",
            "dna_scanner_enforcement": "STANDARD",
        },
        "voting": {
            "base_weight": 0.5,
            "territorial_bonus_eligible": True,
        },
    },

    "VERIFIED": {
        "label": "Ciudadano Verificado",
        "inheritance": "BASIC",
        "access": {
            "verified_badge": True,
            "view_advanced_metrics": True,
            "view_integrity_stats": True,
            "propose_dynamic_sliders": True,
            "priority_audit": True,
        },
        "behavior": {
            "dna_scanner_enforcement": "RELAXED",
        },
        "voting": {
            "base_weight": 1.0,
            "territorial_bonus_eligible": True,
            "verification_method": "RUT_HASH",
        },
    },
}


# ═══════════════════════════════════════════
#  RESOLVER DE PERMISOS (con herencia)
# ═══════════════════════════════════════════

def _deep_merge(base: dict, override: dict) -> dict:
    """Merge profundo: override sobreescribe valores en base."""
    result = deepcopy(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def resolve_permissions(role: str) -> Dict[str, Any]:
    """
    Resuelve los permisos efectivos de un rol, aplicando herencia.

    Ejemplo:
      resolve_permissions("SILVER") →
        ANONYMOUS permisos + BRONZE permisos + SILVER permisos

    Args:
        role: Nombre del rol (ANONYMOUS, BRONZE, SILVER, GOLD, DIAMOND)

    Returns:
        Diccionario con todos los permisos resueltos (merged)
    """
    role = role.upper()

    if role not in ACCESS_CONTROL_MATRIX:
        logger.warning(f"[ACM] Rol desconocido: {role}. Usando ANONYMOUS.")
        role = "ANONYMOUS"

    node = ACCESS_CONTROL_MATRIX[role]
    parent_role = node.get("inheritance")

    if parent_role is None:
        # Base case: ANONYMOUS no hereda de nadie
        return deepcopy(node)

    # Recursión: resolver permisos del padre primero
    parent_permissions = resolve_permissions(parent_role)

    # Merge: los permisos del hijo sobreescriben los del padre
    return _deep_merge(parent_permissions, node)


def check_permission(role: str, permission: str) -> bool:
    """
    Verifica si un rol tiene un permiso específico.

    Args:
        role: Nombre del rol
        permission: Clave del permiso (ej: "evaluate", "view_rankings")

    Returns:
        True si el permiso está concedido, False si no.
    """
    resolved = resolve_permissions(role)
    return resolved.get("access", {}).get(permission, False)


def get_voting_config(role: str) -> Dict[str, Any]:
    """
    Obtiene la configuración de voto para un rol.

    Returns:
        {"base_weight": float, "territorial_bonus_eligible": bool, ...}
    """
    resolved = resolve_permissions(role)
    return resolved.get("voting", {"base_weight": 0.0, "territorial_bonus_eligible": False})


def get_behavior(role: str) -> Dict[str, str]:
    """
    Obtiene el comportamiento del sistema para un rol.

    Returns:
        {"on_interaction_attempt": str, "dna_scanner_enforcement": str}
    """
    resolved = resolve_permissions(role)
    return resolved.get("behavior", {
        "on_interaction_attempt": "TRIGGER_AUTH_MODAL",
        "dna_scanner_enforcement": "STANDARD",
    })


def log_auth_denied(
    role: str,
    permission: str,
    user_id: Optional[str] = None,
    ip: Optional[str] = None,
) -> None:
    """
    Registra un SECURITY_AUTH_DENIED en audit_logs cuando
    la matriz bloquea una acción.
    """
    try:
        from app.core.audit_logger import audit_bus
        audit_bus.log_event(
            actor_id=user_id or "ANONYMOUS",
            action="SECURITY_AUTH_DENIED",
            entity_type="ACM",
            entity_id=permission,
            details={
                "role": role,
                "permission_requested": permission,
                "ip": ip or "unknown",
                "matrix_response": "DENIED",
            },
        )
    except Exception as e:
        logger.error(f"[ACM] Error registrando auth denied: {e}")


def enforce_permission(
    role: str,
    permission: str,
    user_id: Optional[str] = None,
    ip: Optional[str] = None,
) -> bool:
    """
    Verifica un permiso Y registra el intento si es denegado.

    Returns:
        True si permitido, False si denegado (+ audit log).
    """
    allowed = check_permission(role, permission)

    if not allowed:
        log_auth_denied(role, permission, user_id, ip)
        logger.info(
            f"[ACM] DENIED: {role} → {permission} "
            f"(user={user_id or 'ANON'}, ip={ip or '?'})"
        )

    return allowed


# ─── Instancia exportable de la Matriz ───
acm = ACCESS_CONTROL_MATRIX
"""
Uso directo:
  from app.core.auth.access_control_matrix import resolve_permissions, enforce_permission
  perms = resolve_permissions("GOLD")
  allowed = enforce_permission("BRONZE", "propose_dynamic_sliders", user_id="u-123")
"""
