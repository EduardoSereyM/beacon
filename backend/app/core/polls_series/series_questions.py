"""
BEACON PROTOCOL — Preguntas de una serie de encuestas
======================================================
Los ids de pregunta los resuelve el servidor, nunca el cliente: se conservan
por posición entre ediciones de la plantilla para que la tendencia siga
comparando "la misma pregunta". La versión de plantilla solo sube si cambia
el contenido real (todo menos el id).
"""

import uuid
from typing import Any


def _content(question: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in question.items() if key != "id"}


def questions_content_changed(new: list[dict[str, Any]], current: list[dict[str, Any]]) -> bool:
    """True si las preguntas difieren en algo distinto del id."""
    return [_content(q) for q in new] != [_content(q) for q in current]


def resolve_question_ids(new: list[dict[str, Any]], current: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Asigna a cada pregunta el id que tenía esa posición en `current`; las
    posiciones nuevas reciben un id nuevo. Ignora cualquier id enviado por el cliente."""
    return [
        {**question, "id": current[i]["id"] if i < len(current) else uuid.uuid4().hex}
        for i, question in enumerate(new)
    ]
