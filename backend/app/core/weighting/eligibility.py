"""
BEACON PROTOCOL — Compuertas de la ponderación
===============================================
Decide si hay datos suficientes para publicar una cifra ponderada. Si no, devuelve los
motivos en lenguaje claro: la interfaz los muestra en lugar de una cifra engañosa.
"""

from app.core.weighting.config import WeightingConfig
from app.core.weighting.targets import Targets


def select_complete(
    respondents: list[dict[str, str | None]], targets: Targets
) -> tuple[list[int], list[dict[str, str]]]:
    """Índices y filas de los respondentes con todas las variables en una categoría objetivo.
    Quien tenga un dato faltante o fuera de las categorías no entra a la cifra ponderada."""
    indices: list[int] = []
    rows: list[dict[str, str]] = []
    for index, respondent in enumerate(respondents):
        row: dict[str, str] = {}
        for variable, shares in targets.marginals.items():
            value = respondent.get(variable)
            if value not in shares:
                break
            row[variable] = value
        else:
            indices.append(index)
            rows.append(row)
    return indices, rows


def eligibility_problems(rows: list[dict[str, str]], targets: Targets, config: WeightingConfig) -> list[str]:
    """Motivos por los que NO se puede ponderar (lista vacía = se puede intentar)."""
    if len(rows) < config.min_complete:
        # Con tan pocos casos, listar categorías vacías solo repite lo mismo.
        return [f"Hay {len(rows)} votantes con todos los datos demográficos; se requieren al menos {config.min_complete}."]
    problems: list[str] = []
    for variable, shares in targets.marginals.items():
        counts = {category: 0 for category in shares}
        for row in rows:
            counts[row[variable]] += 1
        thin = sorted(category for category, count in counts.items() if count < config.min_cell)
        if thin:
            problems.append(
                f"En «{variable}» faltan al menos {config.min_cell} votantes en: {', '.join(thin)}."
            )
    return problems
