"""
BEACON PROTOCOL — Raking (ajuste proporcional iterativo) con recorte de pesos
==============================================================================
Ajusta los pesos hasta que la distribución ponderada de cada variable coincida con la
objetivo. Tras cada pasada los pesos se normalizan a promedio 1 y se recortan a
[trim_low, trim_high]: ningún votante domina la cifra, a costa de un ajuste algo menos
exacto, que se informa en `max_error` en lugar de ocultarse.

Entrada: una fila por respondente con TODAS las variables ya presentes y válidas
(la selección de casos completos la hace `engine`).
"""

from dataclasses import dataclass

from app.core.weighting.config import WeightingConfig
from app.core.weighting.targets import Targets


@dataclass(frozen=True)
class RakingResult:
    weights: list[float]
    iterations: int
    converged: bool
    max_error: float       # mayor |proporción ponderada − objetivo| entre todas las categorías
    trimmed: int           # respondentes cuyo peso quedó en un tope


def weighted_shares(rows: list[dict[str, str]], weights: list[float], variable: str) -> dict[str, float]:
    total = sum(weights)
    shares: dict[str, float] = {}
    for row, weight in zip(rows, weights, strict=True):
        shares[row[variable]] = shares.get(row[variable], 0.0) + weight / total
    return shares


def max_marginal_error(rows: list[dict[str, str]], weights: list[float], targets: Targets) -> float:
    worst = 0.0
    for variable, target in targets.marginals.items():
        shares = weighted_shares(rows, weights, variable)
        for category, goal in target.items():
            worst = max(worst, abs(shares.get(category, 0.0) - goal))
    return worst


def _normalize_and_trim(weights: list[float], config: WeightingConfig) -> tuple[list[float], int]:
    mean = sum(weights) / len(weights)
    scaled = [w / mean for w in weights]
    clipped = [min(max(w, config.trim_low), config.trim_high) for w in scaled]
    trimmed = sum(1 for original, kept in zip(scaled, clipped, strict=True) if original != kept)
    return clipped, trimmed


def rake(rows: list[dict[str, str]], targets: Targets, config: WeightingConfig) -> RakingResult:
    if not rows:
        raise ValueError("rake necesita al menos un respondente")
    weights = [1.0] * len(rows)
    trimmed = 0
    error = max_marginal_error(rows, weights, targets)

    for iteration in range(1, config.max_iter + 1):
        for variable, target in targets.marginals.items():
            shares = weighted_shares(rows, weights, variable)
            factors = {category: target[category] / shares[category] for category in shares if category in target}
            weights = [w * factors.get(row[variable], 1.0) for row, w in zip(rows, weights, strict=True)]
        weights, trimmed = _normalize_and_trim(weights, config)
        new_error = max_marginal_error(rows, weights, targets)
        converged = new_error <= config.tol
        # Con recorte el error puede no bajar de cierto piso: si deja de mejorar, se corta y se informa.
        stalled = abs(error - new_error) < 1e-9
        error = new_error
        if converged or stalled:
            return RakingResult(weights, iteration, converged, error, trimmed)

    return RakingResult(weights, config.max_iter, False, error, trimmed)
