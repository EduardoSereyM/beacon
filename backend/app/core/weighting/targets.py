"""
BEACON PROTOCOL — Marginales objetivo de la población
======================================================
Proporciones de la población objetivo (18 años o más) por variable. Cada conjunto lleva su
fuente y fecha: es parte de la ficha metodológica y debe poder auditarse.
"""

from dataclasses import dataclass

SUM_TOLERANCE = 1e-6


@dataclass(frozen=True)
class Targets:
    version: str                              # p. ej. "ine-proyecciones-2026"
    source: str                               # referencia citable
    marginals: dict[str, dict[str, float]]    # variable -> categoría -> proporción (suma 1)

    def __post_init__(self) -> None:
        if not self.marginals:
            raise ValueError("Targets sin variables")
        for variable, shares in self.marginals.items():
            if not shares:
                raise ValueError(f"Variable '{variable}' sin categorías")
            if any(share <= 0 for share in shares.values()):
                raise ValueError(f"Variable '{variable}': toda proporción debe ser > 0")
            total = sum(shares.values())
            if abs(total - 1.0) > SUM_TOLERANCE:
                raise ValueError(f"Variable '{variable}': las proporciones suman {total}, no 1")

    @property
    def variables(self) -> tuple[str, ...]:
        return tuple(self.marginals)
