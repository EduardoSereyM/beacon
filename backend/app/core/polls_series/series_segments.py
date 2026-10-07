"""
BEACON PROTOCOL — Resultados por segmento de una edición
=========================================================
Desglosa los votos verificados de una edición por sexo, edad, zona, por la respuesta a OTRA pregunta
de la misma edición (el cruce «supo / no supo» de Cadem) y —solo si está habilitado— por posición
política. Función pura: recibe la demografía ya cargada, devuelve solo agregados.

Reglas:
  - Un segmento con menos de MIN_N respuestas en una pregunta no publica resultados.
  - Quien no se pueda clasificar en una variable queda fuera de ESA variable (no de las demás).
  - Sin ponderar: cada segmento muestra lo que respondieron las personas que lo componen.
  - La posición política (dato sensible) se calcula y se muestra únicamente con el interruptor
    SERIES_POLITICAL_SEGMENT_ENABLED; nunca se publica un dato individual.
"""

import json
from typing import Any

from app.core.polls.aggregation import aggregate_by_question
from app.core.polls.scale import scale_bounds
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


QUESTION_LABEL_MAX = 70
SCALE_SPLIT = (("low", "Notas 1 a 4"), ("high", "Notas 5 a 7"))


def _answer(vote: dict[str, Any], question_id: str) -> str | None:
    """Respuesta de un voto a una pregunta de una encuesta multi-pregunta (None si no la contestó)."""
    raw = vote.get("option_value", "")
    if not raw.startswith("{"):
        return None
    try:
        value = json.loads(raw).get(question_id)
    except ValueError:
        return None
    return value if isinstance(value, str) else None


def _is_seven_point_scale(question: dict[str, Any]) -> bool:
    return question.get("type") == "scale" and scale_bounds(question) == (1, 7)


def _cross_groups(question: dict[str, Any]) -> tuple[tuple[str, str], ...] | None:
    """Grupos de un cruce por la respuesta a `question`; None si no se puede cruzar.
    Solo opción única (con selección múltiple una persona caería en varios grupos) y escalas de 1 a 7
    (notas 1-4 contra notas 5-7)."""
    if question.get("type") == "multiple_choice" and not question.get("allow_multiple"):
        return tuple((opt, opt) for opt in question.get("options") or [])
    if _is_seven_point_scale(question):
        return SCALE_SPLIT
    return None


def _cross_value(vote: dict[str, Any], question: dict[str, Any]) -> str | None:
    answer = _answer(vote, question.get("id", ""))
    if answer is None:
        return None
    if _is_seven_point_scale(question):
        try:
            return "high" if float(answer) >= 5 else "low"
        except ValueError:
            return None
    return answer


def _cross_segments(poll: dict[str, Any], verified_votes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Un segmento por cada otra pregunta cruzable. Solo en encuestas con más de una pregunta."""
    questions = sorted(poll.get("questions") or [], key=lambda q: q.get("order_index", 0))
    if len(questions) < 2:
        return []
    segments = []
    for question in questions:
        groups = _cross_groups(question)
        if not groups:
            continue
        text = str(question.get("text", ""))
        label = text if len(text) <= QUESTION_LABEL_MAX else text[: QUESTION_LABEL_MAX - 1] + "…"
        built = []
        for key, group_label in groups:
            members = [v for v in verified_votes if _cross_value(v, question) == key]
            built.append({
                "key": key, "label": group_label, "n": len(members),
                "questions": [_question_row(q) for q in aggregate_by_question(poll, members)],
            })
        segments.append({"variable": f"q:{question['id']}", "label": f"Según su respuesta a «{label}»", "groups": built})
    return segments


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
    # Los cruces por otra pregunta van antes de la posición política (si está habilitada) para mantener ese orden.
    cross = _cross_segments(poll, verified_votes)
    political = [s for s in segments if s["variable"] == "political"]
    return [s for s in segments if s["variable"] != "political"] + cross + political
