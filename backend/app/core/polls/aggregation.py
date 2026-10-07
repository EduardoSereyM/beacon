"""
BEACON PROTOCOL — Agregación de votos de una encuesta
======================================================
Convierte filas de `poll_votes` en resultados por pregunta (multiple_choice y scale).
Función pura, sin I/O: la usan los endpoints de encuestas y el snapshot de series.
"""

import json as _json

from app.core.polls.scale import scale_bounds


def aggregate_votes(poll: dict, votes: list) -> list:
    """
    Agrega votos en resultados para un subconjunto (todos o solo verificados).
    Soporta multiple_choice y scale.
    Nota: polls creadas vía admin/pipeline no tienen poll_type ni options en el
    top-level; solo dentro de questions[0]. Se hace fallback a questions[0].

    Para scale: retorna distribución completa [{"option": "1", "count": ..., "pct": ...}, ...] + "average"
    """
    total = len(votes)
    first_q = (poll.get("questions") or [{}])[0]
    poll_type = poll.get("poll_type") or first_q.get("type", "multiple_choice")
    top_options = poll.get("options") or first_q.get("options") or []

    if poll_type == "multiple_choice":
        options = top_options
        counts = {opt: 0 for opt in options}
        for v in votes:
            raw = v.get("option_value", "")
            for sel in (s.strip() for s in raw.split("||") if s.strip()):
                if sel in counts:
                    counts[sel] += 1
        return [
            {"option": opt, "count": cnt, "pct": round(cnt / total * 100, 1) if total else 0}
            for opt, cnt in counts.items()
        ]

    # scale: distribución completa + promedio
    q_min, q_max = scale_bounds(first_q)
    scale_min = poll.get("scale_min") or q_min
    scale_max = int(poll.get("scale_max") or q_max)

    point_counts: dict = {}
    values = []
    for v in votes:
        try:
            pt = float(v["option_value"])
            values.append(pt)
            key = str(int(pt))
            point_counts[key] = point_counts.get(key, 0) + 1
        except (ValueError, TypeError):
            pass

    avg = round(sum(values) / len(values), 2) if values else 0

    # Retornar distribución completa de cada punto + promedio
    result = [
        {
            "option": str(pt),
            "count": point_counts.get(str(pt), 0),
            "pct": round(point_counts.get(str(pt), 0) / total * 100, 1) if total else 0,
        }
        for pt in range(int(scale_min), int(scale_max) + 1)
    ]
    # Agregar promedio al primer elemento (compatibilidad con UI)
    if result:
        result[0]["average"] = avg

    return result


def aggregate_by_question(poll: dict, votes: list, weights: list[float] | None = None) -> list:
    """
    Agrega resultados separados por pregunta.
    - Polls multi-pregunta: option_value es JSON string {"qid": "respuesta", ...}
    - Polls de 1 pregunta (compat): option_value es string plano
    - `weights` (opcional, alineado con `votes`): `pct` y `average` salen ponderados;
      `count` y `total_votes` siguen siendo el número de respuestas sin ponderar.
    Retorna lista de {question_id, question_text, question_type, total_votes, results}.
    """
    if weights is not None and len(weights) != len(votes):
        raise ValueError("weights debe tener un peso por voto")
    questions = sorted(poll.get("questions") or [], key=lambda x: x.get("order_index", 0))
    if not questions:
        return []

    is_multi = len(questions) > 1
    out = []

    for q in questions:
        qid     = q.get("id", "")
        q_type  = q.get("type", "multiple_choice")
        q_opts  = q.get("options") or []

        # Extraer la respuesta de cada voto para esta pregunta
        q_answers: list[str] = []
        q_weights: list[float] = []
        for index, v in enumerate(votes):
            raw = v.get("option_value", "")
            weight = 1.0 if weights is None else weights[index]
            if is_multi and raw.startswith("{"):
                try:
                    parsed = _json.loads(raw)
                    if qid in parsed:
                        q_answers.append(parsed[qid])
                        q_weights.append(weight)
                except Exception:
                    pass
            elif not is_multi:
                q_answers.append(raw)
                q_weights.append(weight)

        q_total = len(q_answers)
        w_total = sum(q_weights)

        if q_type == "multiple_choice":
            counts = {opt: 0 for opt in q_opts}
            w_counts = {opt: 0.0 for opt in q_opts}
            for a, w in zip(q_answers, q_weights, strict=True):
                for sel in (s.strip() for s in a.split("||") if s.strip()):
                    if sel in counts:
                        counts[sel] += 1
                        w_counts[sel] += w
            q_results = [
                {"option": opt, "count": cnt, "pct": round(w_counts[opt] / w_total * 100, 1) if q_total else 0}
                for opt, cnt in counts.items()
            ]
        elif q_type == "scale":
            scale_min, scale_max = scale_bounds(q)
            point_counts: dict = {}
            point_weights: dict = {}
            values: list[float] = []
            value_weights: list[float] = []
            for a, w in zip(q_answers, q_weights, strict=True):
                try:
                    pt = float(a)
                    values.append(pt)
                    value_weights.append(w)
                    key = str(int(pt))
                    point_counts[key] = point_counts.get(key, 0) + 1
                    point_weights[key] = point_weights.get(key, 0.0) + w
                except (ValueError, TypeError):
                    pass
            avg = round(sum(v * w for v, w in zip(values, value_weights, strict=True)) / sum(value_weights), 2) if values else 0
            q_results = [
                {
                    "option": str(pt),
                    "count": point_counts.get(str(pt), 0),
                    "pct": round(point_weights.get(str(pt), 0.0) / w_total * 100, 1) if q_total else 0,
                }
                for pt in range(scale_min, scale_max + 1)
            ]
            # Agregar promedio al primer elemento
            if q_results:
                q_results[0]["average"] = avg
        else:
            q_results = []

        # Incluir scale_labels para preguntas de escala (usado en frontend para etiquetas)
        extra = {}
        if q_type == "scale":
            extra["scale_min"], extra["scale_max"] = scale_bounds(q)
            if q.get("scale_labels"):
                extra["scale_labels"] = q.get("scale_labels")

        out.append({
            "question_id":   qid,
            "question_text": q.get("text", ""),
            "question_type": q_type,
            "total_votes":   q_total,
            "results":       q_results,
            **extra,
        })

    return out
