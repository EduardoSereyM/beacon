"""
BEACON PROTOCOL — Estadísticos de una ponderación (funciones puras)
====================================================================
"""


def kish_n_eff(weights: list[float]) -> float:
    """Tamaño muestral efectivo de Kish: (Σw)² / Σw². Con pesos iguales vale n."""
    if not weights:
        return 0.0
    return sum(weights) ** 2 / sum(w * w for w in weights)


def design_effect(weights: list[float]) -> float:
    """Efecto de diseño por ponderación: n / n_eff (1 = sin pérdida de precisión)."""
    n_eff = kish_n_eff(weights)
    return len(weights) / n_eff if n_eff else 0.0
