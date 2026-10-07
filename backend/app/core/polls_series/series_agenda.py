"""
BEACON PROTOCOL — Series de tipo «agenda»
==========================================
Una serie agenda repite la pregunta pero sus opciones las define una persona cada edición
(p. ej. las noticias de la semana). Este módulo arma las preguntas de una edición a partir de la
plantilla y de esas opciones, y las lee de la base.

Las opciones de la plantilla quedan al final de cada edición («Otra noticia», «No sabe / No responde»):
son fijas y no se editan por semana.
"""

import copy
from typing import Any

MIN_OPTIONS = 2
MAX_OPTIONS = 8          # opciones curadas por edición (la base admite 12 contando las fijas)
OPTION_MIN_LEN = 3
OPTION_MAX_LEN = 140


class AwaitingOptions(Exception):
    """La serie agenda no tiene opciones definidas para esta edición: no se publica todavía."""

    def __init__(self, slug: str, edition: str):
        super().__init__(f"serie {slug} sin opciones para {edition}")
        self.slug, self.edition = slug, edition


def edition_questions(template: list[dict[str, Any]], options: list[str]) -> list[dict[str, Any]]:
    """Preguntas de la edición: la plantilla con las opciones de la semana antes de las fijas."""
    questions = copy.deepcopy(template)
    for question in questions:
        if question.get("type") == "multiple_choice":
            fixed = [o for o in question.get("options") or [] if o not in options]
            question["options"] = [*options, *fixed]
            return questions
    raise ValueError("La plantilla de una serie agenda necesita una pregunta de opción múltiple.")


async def load_edition_options(supabase, series_id: str, edition: str) -> list[str] | None:
    found = await (
        supabase.table("series_edition_options")
        .select("options")
        .eq("series_id", series_id)
        .eq("edition", edition)
        .limit(1)
        .execute()
    )
    return found.data[0]["options"] if found.data else None
