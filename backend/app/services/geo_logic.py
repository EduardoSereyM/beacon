"""
BEACON PROTOCOL — Geo Logic (Vínculo Territorial)
===================================================
Motor de verificación geográfica que determina si un voto
es "local" respecto a la jurisdicción de la entidad evaluada.

Regla de Oro:
  - Si user.comuna_id == entity.jurisdiction_id → is_local = True
  - Voto local recibe bonus de 1.5x en el ranking.

Restricciones de Privacidad (Directives 2026 §7):
  - PROHIBIDO almacenar coordenadas (Lat/Lon).
  - Solo se permite el comuna_id (código numérico, no geolocalizable).
  - GeoIP Fallback: si no hay GPS, se acepta zona inferida por IP.

¿Por qué bonus territorial?
  Un ciudadano que vota sobre su propia comuna conoce la realidad
  local mejor que alguien que vota desde otra región. Su voto
  tiene mayor densidad informativa → mayor peso.

"La verdad de un territorio la definen quienes lo habitan."
"""

import logging
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger("beacon.geo")


# ─── Constantes ───
LOCAL_VOTE_BONUS = 1.5
"""
Multiplicador de voto local.
Un ciudadano GOLD votando en su comuna:
  peso_base = 2.5x (GOLD) × 1.5x (local) = 3.75x total
"""


@dataclass
class TerritorialResult:
    """Resultado de la verificación territorial."""
    is_local: bool
    user_comuna_id: Optional[int]
    entity_jurisdiction_id: Optional[int]
    source: str  # "GPS", "GEOIP", "PROFILE", "UNKNOWN"
    bonus_applied: float  # 1.5 si local, 1.0 si no


def verify_territoriality(
    user_comuna_id: Optional[int],
    entity_jurisdiction_id: Optional[int],
    geoip_comuna_id: Optional[int] = None,
) -> TerritorialResult:
    """
    Determina si un voto es local comparando comuna del usuario
    con la jurisdicción de la entidad.

    Cascada de resolución:
      1. user_comuna_id (dato de perfil) — fuente más confiable
      2. geoip_comuna_id (inferido por IP) — fallback si no hay perfil

    Args:
        user_comuna_id: Comuna del perfil del usuario (puede ser None
            si no ha completado su perfil demográfico).
        entity_jurisdiction_id: Comuna de la jurisdicción de la entidad
            evaluada (None para entidades sin jurisdicción, como POLLs).
        geoip_comuna_id: Comuna inferida por GeoIP (fallback).

    Returns:
        TerritorialResult con is_local, source y bonus_applied.

    Nota de Privacidad:
        Esta función NUNCA recibe coordenadas. Solo IDs de comuna.
        El GeoIP se resuelve externamente antes de llegar aquí.
    """
    # Si la entidad no tiene jurisdicción → no aplica bonus
    if entity_jurisdiction_id is None:
        logger.debug("[GeoLogic] Entidad sin jurisdicción → bonus no aplica")
        return TerritorialResult(
            is_local=False,
            user_comuna_id=user_comuna_id,
            entity_jurisdiction_id=None,
            source="UNKNOWN",
            bonus_applied=1.0,
        )

    # ─── Cascada de resolución ───
    effective_comuna: Optional[int] = None
    source = "UNKNOWN"

    # Prioridad 1: Dato del perfil del usuario
    if user_comuna_id is not None:
        effective_comuna = user_comuna_id
        source = "PROFILE"

    # Prioridad 2: GeoIP fallback
    elif geoip_comuna_id is not None:
        effective_comuna = geoip_comuna_id
        source = "GEOIP"

    # Sin datos → no se puede determinar localidad
    if effective_comuna is None:
        logger.debug("[GeoLogic] Sin datos de comuna → bonus no aplica")
        return TerritorialResult(
            is_local=False,
            user_comuna_id=None,
            entity_jurisdiction_id=entity_jurisdiction_id,
            source="UNKNOWN",
            bonus_applied=1.0,
        )

    # ─── Comparación territorial ───
    is_local = effective_comuna == entity_jurisdiction_id
    bonus = LOCAL_VOTE_BONUS if is_local else 1.0

    logger.info(
        f"[GeoLogic] user_comuna={effective_comuna} "
        f"entity_jurisdiction={entity_jurisdiction_id} "
        f"is_local={is_local} bonus={bonus}x source={source}"
    )

    return TerritorialResult(
        is_local=is_local,
        user_comuna_id=effective_comuna,
        entity_jurisdiction_id=entity_jurisdiction_id,
        source=source,
        bonus_applied=bonus,
    )


def apply_territorial_bonus(
    reputation_weight: float,
    is_local: bool,
) -> float:
    """
    Aplica el bonus territorial al peso de reputación.

    Args:
        reputation_weight: Peso base por rango (ej: GOLD = 2.5)
        is_local: True si el voto es local.

    Returns:
        Peso ajustado: reputation_weight × 1.5 si local, × 1.0 si no.

    Ejemplo:
        GOLD (2.5) + local → 2.5 × 1.5 = 3.75
        GOLD (2.5) + no local → 2.5 × 1.0 = 2.5
    """
    bonus = LOCAL_VOTE_BONUS if is_local else 1.0
    adjusted = reputation_weight * bonus

    logger.debug(
        f"[GeoLogic] weight={reputation_weight} × bonus={bonus} = {adjusted}"
    )

    return adjusted
