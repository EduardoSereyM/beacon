"""
BEACON PROTOCOL — Resultados por segmento de una edición
=========================================================
Desglosa los votos verificados de una edición por sexo, edad, zona y —solo si está habilitado—
posición política. Función pura: recibe la demografía ya cargada, devuelve solo agregados.

Reglas:
  - Un segmento con menos de MIN_N respuestas en una pregunta no publica resultados.
  - Quien no se pueda clasificar en una variable queda fuera de ESA variable (no de las demás).
  - Sin ponderar: cada segmento muestra lo que respondieron las personas que lo componen.
  - La posición política (dato sensible) se calcula y se muestra únicamente con el interruptor
    SERIES_POLITICAL_SEGMENT_ENABLED; nunca se publica un dato individual.
"""

from typing import Any

from app.core.polls.aggregation import aggregate_by_question
from app.core.polls_series.privacy import MIN_N
from app.core.weighting.demographics import respondent_from_user

# variable -> (etiqueta, [(valor interno, etiqueta visible)])
SEGMENT_DEFS: tuple[tuple[str, str, tuple[tuple[str, str], ...]], ...] = (
    ("sex", "Sexo", (("Masculino", "Hombres"), ("Femenino", "Mujeres"))),
    ("age", "Edad", (("18-34", "18-34"), ("35-54", "35-54"), ("55+", "55 o más"))),
    ("zone", "Zona", (("Norte", "Norte"), ("Centro", "Centro"), ("Metropolitana", "R. M."), ("Sur", "Sur"))),
)
POLITICAL_DEF = (
    "political", "Posición política",
    (("Derecha", "Derecha"), ("Centro", "Centro"), ("Izquierda", "Izquierda"), ("Independiente", "Independiente")),
)
_DEMOGRAPHIC_KEY = {"sex": "sex", "age": "age", "zone": "zone"}


def _value(user: dict[str, Any], variable: str, reference_year: int) -> str | None:
    if variable == "political":
        return user.get("political_position")
    return respondent_from_user(user, reference_year)[_DEMOGRAPHIC_KEY[variable]]


def _question_row(question: dict[str, Any]) -> dict[str, Any]:
    n = question["total_votes"]
    suppressed = n < MIN_N
    row = {
        "question_id": question["question_id"],
        "type": question["question_type"],
        "n": n,
        "suppressed": suppressed,
        "results": None if suppressed else question["results"],
    }
    if question["question_type"] == "scale":
        row["scale_min"], row["scale_max"] = question["scale_min"], question["scale_max"]
    return row


def compute_segments(
    users: dict[str, dict[str, Any]],
    poll: dict[str, Any],
    verified_votes: list[dict[str, Any]],
    reference_year: int,
    include_political: bool = False,
) -> list[dict[str, Any]]:
    """Segmentos de la edición: [{variable, label, groups: [{key, label, n, questions: [...]}]}]."""
    definitions = SEGMENT_DEFS + ((POLITICAL_DEF,) if include_political else ())
    segments: list[dict[str, Any]] = []
    for variable, label, categories in definitions:
        groups = []
        for key, group_label in categories:
            members = [
                vote for vote in verified_votes
                if _value(users.get(vote.get("user_id"), {}), variable, reference_year) == key
            ]
            groups.append({
                "key": key,
                "label": group_label,
                "n": len(members),
                "questions": [_question_row(q) for q in aggregate_by_question(poll, members)],
            })
        segments.append({"variable": variable, "label": label, "groups": groups})
    return segments
