"""
BEACON PROTOCOL — Ponderación de una edición
=============================================
Punto de entrada: dado el demográfico de cada votante verificado y las marginales objetivo,
devuelve los pesos o, si los datos no alcanzan, `unavailable` con los motivos.

Garantías:
  - Nunca se publica una ponderación bajo las compuertas (casos completos, celdas, n efectivo).
  - Los pesos quedan alineados con la entrada: `weights[i]` es None si el votante `i` no entró.
  - Corrige la composición en las variables usadas; NO corrige la autoselección en lo que no se
    observa. Eso se declara en la ficha metodológica.
"""

from dataclasses import dataclass, field

from app.core.weighting.config import DEFAULT_CONFIG, WeightingConfig
from app.core.weighting.eligibility import eligibility_problems, select_complete
from app.core.weighting.raking import rake
from app.core.weighting.stats import design_effect, kish_n_eff
from app.core.weighting.targets import Targets


@dataclass(frozen=True)
class WeightingResult:
    status: str                                   # "ok" | "unavailable"
    reasons: list[str] = field(default_factory=list)
    weights: list[float | None] = field(default_factory=list)
    n_input: int = 0
    n_complete: int = 0
    n_excluded: int = 0
    n_eff: float | None = None
    design_effect: float | None = None
    trimmed: int = 0
    iterations: int = 0
    max_error: float | None = None
    targets_version: str = ""
    config_version: int = 0

    def meta(self) -> dict:
        """Metadatos publicables: nunca incluyen pesos ni datos individuales."""
        return {
            "status": self.status,
            "reasons": self.reasons,
            "n_input": self.n_input,
            "n_complete": self.n_complete,
            "n_excluded": self.n_excluded,
            "n_eff": None if self.n_eff is None else round(self.n_eff, 1),
            "design_effect": None if self.design_effect is None else round(self.design_effect, 2),
            "trimmed": self.trimmed,
            "max_error": None if self.max_error is None else round(self.max_error, 4),
            "targets_version": self.targets_version,
            "config_version": self.config_version,
        }


def compute_weights(
    respondents: list[dict[str, str | None]],
    targets: Targets,
    config: WeightingConfig = DEFAULT_CONFIG,
) -> WeightingResult:
    indices, rows = select_complete(respondents, targets)
    base = {
        "n_input": len(respondents),
        "n_complete": len(rows),
        "n_excluded": len(respondents) - len(rows),
        "targets_version": targets.version,
        "config_version": config.version,
    }

    problems = eligibility_problems(rows, targets, config)
    if problems:
        return WeightingResult(status="unavailable", reasons=problems, weights=[None] * len(respondents), **base)

    raked = rake(rows, targets, config)
    n_eff = kish_n_eff(raked.weights)
    reasons: list[str] = []
    if not raked.converged:
        reasons.append(
            f"El ajuste no alcanzó las proporciones objetivo (error máximo {raked.max_error:.1%}); "
            "la muestra está demasiado desbalanceada para corregirla sin pesos extremos."
        )
    if n_eff < config.min_n_eff:
        reasons.append(f"Tras ponderar, el tamaño muestral efectivo es {n_eff:.0f}; se requieren al menos {config.min_n_eff:.0f}.")
    if reasons:
        return WeightingResult(
            status="unavailable", reasons=reasons, weights=[None] * len(respondents),
            n_eff=n_eff, design_effect=design_effect(raked.weights), trimmed=raked.trimmed,
            iterations=raked.iterations, max_error=raked.max_error, **base,
        )

    aligned: list[float | None] = [None] * len(respondents)
    for index, weight in zip(indices, raked.weights, strict=True):
        aligned[index] = weight
    return WeightingResult(
        status="ok", weights=aligned, n_eff=n_eff, design_effect=design_effect(raked.weights),
        trimmed=raked.trimmed, iterations=raked.iterations, max_error=raked.max_error, **base,
    )
