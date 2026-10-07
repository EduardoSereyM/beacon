"""
BEACON PROTOCOL — Parámetros de la ponderación
===============================================
Un solo lugar para los umbrales. Cambiarlos cambia lo que Beacon puede publicar como
"ponderado", así que `version` sube con cualquier cambio y queda en los metadatos de cada
resultado (ver docs/metodologia).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class WeightingConfig:
    version: int = 1
    # Compuertas: sin esto, con pocas decenas de votos un solo votante dominaría la cifra.
    min_complete: int = 200      # votantes con todas las variables de ponderación
    min_cell: int = 5            # respondentes por categoría de cada variable
    min_n_eff: float = 100.0     # tamaño muestral efectivo (Kish) tras ponderar
    # Recorte: ningún votante pesa menos de trim_low ni más de trim_high veces el promedio.
    trim_low: float = 0.3
    trim_high: float = 3.0
    max_iter: int = 200
    tol: float = 1e-4            # error máximo admitido entre la proporción ponderada y la objetivo


DEFAULT_CONFIG = WeightingConfig()
