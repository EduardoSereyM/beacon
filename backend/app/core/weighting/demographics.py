"""
BEACON PROTOCOL — Variables de ponderación de un votante
=========================================================
Traduce el perfil de `users` (región, género, año de nacimiento) a las categorías de las
marginales: zona, sexo y grupo de edad. Un dato ausente o fuera de las categorías devuelve
None: ese votante no entra a la cifra ponderada y se informa como excluido.
Función pura: nunca expone ni guarda el dato individual.
"""

import unicodedata
from typing import Any

ADULT_AGE = 18

_ZONE_BY_REGION = {
    **dict.fromkeys(["arica y parinacota", "tarapaca", "antofagasta", "atacama", "coquimbo"], "Norte"),
    **dict.fromkeys(["valparaiso", "o'higgins", "maule"], "Centro"),
    "metropolitana": "Metropolitana",
    **dict.fromkeys(["nuble", "biobio", "la araucania", "los rios", "los lagos", "aysen", "magallanes"], "Sur"),
}
_SEX_BY_GENDER = {"masculino": "Masculino", "femenino": "Femenino"}


def _fold(text: Any) -> str:
    """Minúsculas y sin tildes: «Ñuble» == «nuble», «Biobío» == «biobio»."""
    decomposed = unicodedata.normalize("NFKD", str(text or "").strip().lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def zone_from_region(region: Any) -> str | None:
    key = _fold(region).removeprefix("region de ").removeprefix("region ")
    return _ZONE_BY_REGION.get(key.removesuffix(" de santiago"))


def sex_from_gender(gender: Any) -> str | None:
    return _SEX_BY_GENDER.get(_fold(gender))


def age_band(birth_year: Any, reference_year: int) -> str | None:
    if not isinstance(birth_year, int) or isinstance(birth_year, bool):
        return None
    age = reference_year - birth_year
    if age < ADULT_AGE or age > 120:
        return None
    if age <= 34:
        return "18-34"
    return "35-54" if age <= 54 else "55+"


def respondent_from_user(user: dict[str, Any], reference_year: int) -> dict[str, str | None]:
    """Variables de ponderación de un usuario; None en las que no se puedan clasificar."""
    return {
        "zone": zone_from_region(user.get("region")),
        "sex": sex_from_gender(user.get("gender")),
        "age": age_band(user.get("birth_year"), reference_year),
    }
