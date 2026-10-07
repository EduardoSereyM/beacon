"""
BEACON PROTOCOL — Carga de las marginales objetivo
===================================================
Lee `data/targets_censo2024.json` (generado por scripts/build_weighting_targets.py) y lo
valida como `Targets`. Se carga una vez: el archivo es parte del código desplegado, así que
cambiarlo exige un PR y deja la versión en los metadatos de cada resultado publicado.
"""

import json
from functools import lru_cache
from pathlib import Path

from app.core.weighting.targets import Targets

DATA_FILE = Path(__file__).parent / "data" / "targets_censo2024.json"


@lru_cache(maxsize=1)
def load_targets() -> Targets:
    raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return Targets(version=raw["version"], source=raw["source"], marginals=raw["marginals"])
