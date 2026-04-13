"""
ingest_polls_direct.py — Inserta encuestas directamente en Supabase
====================================================================
Usa SUPABASE_SERVICE_KEY para insertar sin pasar por la API HTTP.
Carga los 3 payloads del pipeline 12/04/2026.

Uso: cd backend && python ../scripts/ingest_polls_direct.py
"""

import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

# ── Helpers ──────────────────────────────────────────────

def make_question(q: dict, idx: int) -> dict:
    qt = q.get("question_type", "multiple_choice")
    result = {
        "id": uuid.uuid4().hex,
        "text": q["text"],
        "type": "scale" if qt == "scale" else "multiple_choice",
        "allow_multiple": qt == "multiple_choice",
        "order_index": idx,
    }
    if qt == "scale":
        result["scale_points"] = q.get("scale_points", 5)
        result["scale_labels"] = q.get("scale_labels", [])
        result["allow_multiple"] = False
    else:
        result["options"] = q.get("options", [])
    return result


def make_slug(title: str) -> str:
    import re
    import unicodedata

    nfkd = unicodedata.normalize("NFKD", title.lower())
    asc = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", asc).strip("-")[:100]


# ── Payloads ─────────────────────────────────────────────

POLLS = [
    {
        "title": "\u00bfC\u00f3mo ves la econom\u00eda chilena en abril?",
        "context": (
            "Mientras el precio de la gasolina alcanza m\u00e1ximos hist\u00f3ricos ($370/litro) "
            "y el Banco Central ajusta inflaci\u00f3n al alza, 7 de cada 10 chilenos dice que la "
            "econom\u00eda est\u00e1 estancada o en deterioro seg\u00fan datos recientes. "
            "\u00bfCu\u00e1l es tu percepci\u00f3n?"
        ),
        "category": "economia",
        "tags": ["inflacion", "costo-de-vida", "expectativas-economicas"],
        "questions": [
            {
                "text": "\u00bfC\u00f3mo describes actualmente la situaci\u00f3n econ\u00f3mica de Chile?",
                "question_type": "single_choice",
                "options": ["Mejora", "Se mantiene igual", "Empeora"],
            },
            {
                "text": "En una escala del 1 al 7, \u00bfcu\u00e1l es tu expectativa econ\u00f3mica para los pr\u00f3ximos 3 meses?",
                "question_type": "scale",
                "scale_points": 7,
                "scale_labels": [
                    "Muy pesimista", "Pesimista", "Algo pesimista",
                    "Neutral",
                    "Algo optimista", "Optimista", "Muy optimista",
                ],
            },
            {
                "text": "\u00bfCu\u00e1l de estos factores afecta m\u00e1s tu percepci\u00f3n sobre la econom\u00eda? (selecciona hasta 3)",
                "question_type": "multiple_choice",
                "options": [
                    "Precio de combustibles", "Inflaci\u00f3n en alimentos",
                    "Salarios/ingresos", "Empleo", "Costo de vivienda",
                    "Ninguna de las anteriores",
                ],
            },
        ],
    },
    {
        "title": "\u00bfC\u00f3mo ves la seguridad en Chile ahora?",
        "context": (
            "Datos de la Fiscal\u00eda muestran cambios en delitos violentos. "
            "Queremos saber c\u00f3mo percibes la situaci\u00f3n de seguridad en tu zona "
            "y en el pa\u00eds, y qu\u00e9 esperas de las pol\u00edticas p\u00fablicas."
        ),
        "category": "seguridad",
        "tags": ["seguridad-ciudadana", "confianza-politicas", "delincuencia"],
        "questions": [
            {
                "text": "\u00bfC\u00f3mo eval\u00faas la situaci\u00f3n de seguridad p\u00fablica en Chile en este momento?",
                "question_type": "single_choice",
                "options": [
                    "Ha mejorado bastante", "Ha mejorado",
                    "Se mantiene igual",
                    "Ha empeorado", "Ha empeorado bastante",
                ],
            },
            {
                "text": "En tu barrio/zona, \u00bfte sientes m\u00e1s seguro, igual o menos seguro que hace 3 meses?",
                "question_type": "scale",
                "scale_points": 5,
                "scale_labels": [
                    "Mucho m\u00e1s seguro", "M\u00e1s seguro", "Igual",
                    "Menos seguro", "Mucho menos seguro",
                ],
            },
            {
                "text": "\u00bfConf\u00edas en que las pol\u00edticas de seguridad actuales mejoren la situaci\u00f3n?",
                "question_type": "scale",
                "scale_points": 7,
                "scale_labels": [
                    "Nada confiado", "Poco", "Algo", "Neutral",
                    "Bastante", "Muy", "Totalmente confiado",
                ],
            },
        ],
    },
    {
        "title": "La corrupci\u00f3n en Chile: \u00bfc\u00f3mo la ves ahora vs. antes?",
        "context": (
            "Estudios globales muestran que la percepci\u00f3n de corrupci\u00f3n en Am\u00e9rica Latina "
            "sigue siendo alta. En Chile, casos peri\u00f3dicos en pol\u00edtica generan debate sobre "
            "si ha empeorado, mejorado o se mantiene igual en los \u00faltimos a\u00f1os."
        ),
        "category": "justicia",
        "tags": ["analisis-sistemico", "perspectiva-historica", "cambio-institucional"],
        "questions": [
            {
                "text": "\u00bfCrees que la corrupci\u00f3n en instituciones p\u00fablicas chilenas es m\u00e1s o menos grave que hace 5 a\u00f1os?",
                "question_type": "scale",
                "scale_points": 5,
                "scale_labels": [
                    "Mucho menos grave", "Menos grave", "Igual",
                    "M\u00e1s grave", "Mucho m\u00e1s grave",
                ],
            },
            {
                "text": "\u00bfVes la corrupci\u00f3n como un problema de individuos o como algo sist\u00e9mico?",
                "question_type": "single_choice",
                "options": [
                    "Problema de individuos espec\u00edficos",
                    "M\u00e1s de individuos que sist\u00e9mico",
                    "Ambos igual",
                    "M\u00e1s sist\u00e9mico que de individuos",
                    "Sist\u00e9mico",
                ],
            },
            {
                "text": "\u00bfCrees que la corrupci\u00f3n en el Congreso disminuir\u00e1 en los pr\u00f3ximos 2-3 a\u00f1os?",
                "question_type": "scale",
                "scale_points": 7,
                "scale_labels": [
                    "Disminuir\u00e1 mucho", "Disminuir\u00e1", "Disminuir\u00e1 poco",
                    "Se mantendr\u00e1 igual",
                    "Aumentar\u00e1 poco", "Aumentar\u00e1", "Aumentar\u00e1 mucho",
                ],
            },
        ],
    },
]


# ── Main ─────────────────────────────────────────────────

async def main():
    from supabase._async.client import create_client as create_async_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    supabase = await create_async_client(url, key)

    now = datetime.now(timezone.utc)
    ends = now + timedelta(days=7)

    ok = 0
    for p in POLLS:
        qs = [make_question(q, i) for i, q in enumerate(p["questions"])]
        s = make_slug(p["title"])

        # Check slug collision
        try:
            existing = await (
                supabase.table("polls")
                .select("id")
                .ilike("slug", s)
                .maybe_single()
                .execute()
            )
            if existing and existing.data:
                s = f"{s}-{uuid.uuid4().hex[:6]}"
        except Exception:
            pass  # no collision

        first_q = qs[0]
        row = {
            "title": p["title"],
            "slug": s,
            "context": p["context"],
            "tags": p["tags"],
            "category": p["category"],
            "starts_at": now.isoformat(),
            "ends_at": ends.isoformat(),
            "status": "active",
            "is_active": True,
            "is_featured": False,
            "created_by": "328225e7-8800-47f1-8c12-8ac5f2aaac92",  # admin
            "questions": qs,
            "requires_auth": True,
            "poll_type": first_q["type"],
            "options": first_q.get("options"),
            "scale_min": 1,
            "scale_max": first_q.get("scale_points", 5) if first_q["type"] == "scale" else 5,
        }

        result = await supabase.table("polls").insert(row).execute()
        if result.data:
            poll = result.data[0]
            ok += 1
            print(f"OK  id={poll['id']}  slug={poll['slug']}")
            print(f"    {p['title']}")
            print(f"    {len(qs)} preguntas | categoria={p['category']} | 7 dias")
            print()
        else:
            print(f"ERR {p['title']}")

    print(f"--- {ok}/{len(POLLS)} encuestas insertadas ---")


if __name__ == "__main__":
    asyncio.run(main())
