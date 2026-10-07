"""
BEACON PROTOCOL — Límites de una pregunta de escala
====================================================
Una pregunta `scale` puede venir por extremos (`scale_min`/`scale_max`) o por
puntos (`scale_points`, con `scale_min`/`scale_max` en None). Un `dict.get(clave, 1)`
no sirve para esto: si la clave existe con valor None devuelve None y el voto o
la agregación revientan. Este es el único lugar que decide los límites.
"""

from typing import Any

DEFAULT_SCALE_MIN = 1
DEFAULT_SCALE_MAX = 5


def scale_bounds(question: dict[str, Any]) -> tuple[int, int]:
    """(mínimo, máximo) de la escala: extremos si existen, si no `scale_points`, si no 1..5."""
    low = question.get("scale_min") or DEFAULT_SCALE_MIN
    high = question.get("scale_max") or question.get("scale_points") or DEFAULT_SCALE_MAX
    return int(low), int(high)
