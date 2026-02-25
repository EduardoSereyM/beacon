"""
BEACON PROTOCOL — Pivot Axis Engine (Modo Maestro)
====================================================
Motor de adaptación contextual que cambia la MATEMÁTICA
según la categoría seleccionada por el usuario.

Arquitectura:
  - Cada entity_type tiene su propia fórmula de ranking.
  - "Festivales" → Prioriza volumen de votos rápidos.
  - "Políticos" → Prioriza antigüedad e integrity_score.
  - "Empresas" → Prioriza diversidad de service_tags evaluados.
  - "Encuestas" → Prioriza participación total sin sesgos.

Valor estratégico:
  Permite agregar nuevas categorías (Ej: "Proveedores de Software",
  "Clínicas Médicas") solo añadiendo un ENUM y un service_tag.
  La fórmula se adapta automáticamente.

Monetización:
  En la pestaña "Bancos", el sponsor es del rubro financiero.
  El "Top Slot" de una categoría específica cuesta más que el Home.

"El eje que gira, redefine qué es lo que vale."
"""

import logging
from enum import Enum
from typing import Optional

logger = logging.getLogger("beacon.pivot_axis")


class PivotStrategy(str, Enum):
    """Estrategia de ranking según contexto."""
    VOLUME_SPEED = "volume_speed"        # Festivales, eventos: votos rápidos
    INTEGRITY_SENIORITY = "integrity"    # Políticos: antigüedad + integridad
    SERVICE_DIVERSITY = "diversity"      # Empresas: diversidad de evaluaciones
    TOTAL_PARTICIPATION = "participation"  # Encuestas: máxima participación


# ─── Mapeo entity_type → estrategia de ranking ───
ENTITY_PIVOT_MAP: dict[str, PivotStrategy] = {
    "PERSON": PivotStrategy.INTEGRITY_SENIORITY,
    "COMPANY": PivotStrategy.SERVICE_DIVERSITY,
    "EVENT": PivotStrategy.VOLUME_SPEED,
    "POLL": PivotStrategy.TOTAL_PARTICIPATION,
}

# ─── Pesos por estrategia ───
# Cada estrategia define cómo se pondera el score final.
STRATEGY_WEIGHTS: dict[PivotStrategy, dict[str, float]] = {
    PivotStrategy.VOLUME_SPEED: {
        "reputation_score": 0.3,
        "total_votes_24h": 0.4,       # Votos en últimas 24h (velocidad)
        "integrity_index": 0.15,
        "account_age_factor": 0.05,
        "vote_diversity": 0.1,
    },
    PivotStrategy.INTEGRITY_SENIORITY: {
        "reputation_score": 0.25,
        "integrity_index": 0.30,      # Integridad del votante importa más
        "account_age_factor": 0.25,   # Cuentas antiguas pesan más
        "total_votes": 0.10,
        "gold_ratio": 0.10,           # Ratio de votos de ciudadanos oro
    },
    PivotStrategy.SERVICE_DIVERSITY: {
        "reputation_score": 0.25,
        "service_coverage": 0.25,     # Cuántos service_tags evaluados
        "integrity_index": 0.20,
        "total_votes": 0.15,
        "recency_factor": 0.15,       # Prioriza evaluaciones recientes
    },
    PivotStrategy.TOTAL_PARTICIPATION: {
        "reputation_score": 0.20,
        "total_votes": 0.35,          # Máxima participación importa
        "vote_diversity": 0.20,       # Diversidad demográfica de votantes
        "integrity_index": 0.15,
        "is_active": 0.10,            # ¿La encuesta sigue abierta?
    },
}


def get_pivot_strategy(entity_type: str) -> PivotStrategy:
    """
    Retorna la estrategia de ranking para un tipo de entidad.

    Args:
        entity_type: PERSON, COMPANY, EVENT, POLL

    Returns:
        PivotStrategy que define la fórmula de ranking.
    """
    strategy = ENTITY_PIVOT_MAP.get(entity_type, PivotStrategy.INTEGRITY_SENIORITY)
    logger.info(f"[PivotAxis] entity_type={entity_type} → strategy={strategy.value}")
    return strategy


def get_weights(entity_type: str) -> dict[str, float]:
    """
    Retorna los pesos de ranking para un tipo de entidad.

    Args:
        entity_type: PERSON, COMPANY, EVENT, POLL

    Returns:
        Diccionario de pesos (factor_name → weight).
    """
    strategy = get_pivot_strategy(entity_type)
    return STRATEGY_WEIGHTS[strategy]


def calculate_pivot_score(
    entity_type: str,
    factors: dict[str, float],
) -> float:
    """
    Calcula el score final usando la fórmula pivotante.

    Args:
        entity_type: Tipo de entidad.
        factors: Diccionario con los valores de cada factor.
                 Ej: {"reputation_score": 3.5, "total_votes": 200, ...}

    Returns:
        Score ponderado normalizado (0.0 - 5.0).
    """
    weights = get_weights(entity_type)
    weighted_sum = 0.0
    total_weight = 0.0

    for factor_name, weight in weights.items():
        value = factors.get(factor_name, 0.0)
        weighted_sum += value * weight
        total_weight += weight

    if total_weight == 0:
        return 0.0

    raw_score = weighted_sum / total_weight

    # Normalizar a rango 0.0 - 5.0
    normalized = max(0.0, min(5.0, raw_score))

    logger.info(
        f"[PivotAxis] entity_type={entity_type} "
        f"raw_score={raw_score:.3f} normalized={normalized:.3f}"
    )

    return round(normalized, 3)


def get_sponsor_category(entity_type: str, service_tag: Optional[str] = None) -> str:
    """
    Retorna la categoría de sponsor para publicidad nativa.

    Si el usuario está en "Bancos" → sponsor financiero.
    El "Top Slot" de categoría cuesta más que el Home.

    Args:
        entity_type: Tipo de entidad seleccionada.
        service_tag: Sub-filtro activo (opcional).

    Returns:
        Categoría de sponsor para la API de publicidad.
    """
    SPONSOR_MAP = {
        "BANCO": "financial_premium",
        "RETAIL": "commerce_premium",
        "ENERGIA": "energy_premium",
        "SALUD": "health_premium",
        "TELECOM": "telecom_premium",
        "FESTIVAL": "entertainment_premium",
        "ELECCION": "political_premium",
        "TV": "media_premium",
    }

    if service_tag and service_tag in SPONSOR_MAP:
        category = SPONSOR_MAP[service_tag]
        logger.info(f"[PivotAxis] Sponsor: tag={service_tag} → {category} (PREMIUM)")
        return category

    # Fallback por entity_type
    TYPE_SPONSOR = {
        "PERSON": "general_political",
        "COMPANY": "general_business",
        "EVENT": "general_entertainment",
        "POLL": "general_civic",
    }

    category = TYPE_SPONSOR.get(entity_type, "general")
    logger.info(f"[PivotAxis] Sponsor: type={entity_type} → {category} (STANDARD)")
    return category
