"""
ingest_polls_13abr2026.py — Inserta 4 encuestas directamente en Supabase
=========================================================================
Pipeline BEACON — Ciclo 13/04/2026
  POLL-20260413-001 — Plan Escuelas Protegidas       (85% | Variante A | 7 días)
  POLL-20260413-002 — Aprobación Presidencial        (82% | Variante C | 7 días)
  POLL-20260413-003 — La Moneda / Patrimonio Público (72% | Variante C | 7 días)
  POLL-20260413-004 — Comunicación del Gobierno      (89% | Variante C | 14 días)

Aprobados por Overlord en CP2 — 13/04/2026.

Uso: cd backend && python ../scripts/ingest_polls_13abr2026.py
"""

import asyncio
import os
import re
import sys
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

ADMIN_USER_ID = "328225e7-8800-47f1-8c12-8ac5f2aaac92"


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
    nfkd = unicodedata.normalize("NFKD", title.lower())
    asc = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", asc).strip("-")[:100]


# ── Payloads 13/04/2026 ──────────────────────────────────

POLLS = [
    # ── POLL-20260413-001 ────────────────────────────────
    {
        "title": "Plan Escuelas Protegidas: ¿apoyas el plan y sus sanciones?",
        "context": (
            "El Gobierno presentó el plan 'Escuelas Protegidas' que incluye instalación de cámaras "
            "de vigilancia, detectores de metales y sanciones para estudiantes que cometan actos "
            "violentos. Según encuesta CADEM de abril 2026, el 70% de los chilenos apoya las medidas "
            "y el 75% respalda que estudiantes condenados por violencia pierdan la gratuidad "
            "universitaria. Esta semana, la UDI ingresó un proyecto de ley para formalizar esa sanción."
        ),
        "category": "educacion",
        "tags": ["escuelas-protegidas", "violencia-escolar", "seguridad", "gratuidad", "educacion"],
        "duration_days": 7,
        "questions": [
            {
                "text": "¿En qué medida apoyas el plan 'Escuelas Protegidas' del gobierno para combatir la violencia escolar?",
                "question_type": "scale",
                "scale_points": 7,
                "scale_labels": [
                    "Rechazo total",
                    "Muy en contra",
                    "Algo en contra",
                    "Neutral",
                    "Algo a favor",
                    "Bastante a favor",
                    "Apoyo total",
                ],
            },
            {
                "text": "¿Cuál crees que es la principal causa del aumento de violencia en los colegios chilenos?",
                "question_type": "multiple_choice",
                "options": [
                    "Falta de sanciones efectivas para estudiantes violentos",
                    "Influencia de redes sociales y contenido violento",
                    "Presencia de drogas y barras en entornos escolares",
                    "Familias desestructuradas y falta de contención en el hogar",
                    "Escasez de psicólogos y orientadores en colegios",
                    "Ninguna de las anteriores",
                ],
            },
            {
                "text": "¿El plan 'Escuelas Protegidas' aborda las causas de fondo de la violencia escolar en Chile?",
                "question_type": "single_choice",
                "options": [
                    "Sí, aborda tanto las causas como los síntomas",
                    "Solo parcialmente — faltan medidas de fondo",
                    "No, solo trata síntomas sin atacar las causas reales",
                    "No sabe / No tiene opinión",
                ],
            },
            {
                "text": "¿Qué actores tienen más responsabilidad en la violencia escolar?",
                "question_type": "single_choice",
                "options": [
                    "El Estado, por no invertir en educación y salud mental",
                    "Las familias, por falta de crianza y contención",
                    "Los propios establecimientos educacionales",
                    "La sociedad en general — es un problema sistémico",
                    "No sabe / No tiene opinión",
                ],
            },
        ],
        "_meta": {"idea_id": "IDEA-001", "confidence_score": 85, "variante": "A"},
    },

    # ── POLL-20260413-002 ────────────────────────────────
    {
        "title": "Aprobación presidencial en Chile: ¿esta caída es normal o inusual?",
        "context": (
            "Las encuestadoras CADEM y Criteria registran caídas en la aprobación del gobierno en "
            "sus primeras semanas, con Criteria marcando 36% al primer mes (abril 2026). Caídas de "
            "aprobación presidencial en los primeros meses son frecuentes en la historia reciente de "
            "Chile. La pregunta es si esta caída está dentro de los parámetros esperados o si es más "
            "profunda que en gobiernos anteriores."
        ),
        "category": "politica",
        "tags": ["aprobacion-presidencial", "gobierno", "gestion-publica", "chile-2026", "tendencia"],
        "duration_days": 7,
        "questions": [
            {
                "text": "Comparado con los primeros meses de gobiernos anteriores en Chile, ¿cómo evalúas el inicio del gobierno actual?",
                "question_type": "scale",
                "scale_points": 7,
                "scale_labels": [
                    "Mucho peor",
                    "Bastante peor",
                    "Algo peor",
                    "Similar",
                    "Algo mejor",
                    "Bastante mejor",
                    "Mucho mejor",
                ],
            },
            {
                "text": "¿En qué áreas crees que el gobierno tiene el peor desempeño hasta ahora?",
                "question_type": "multiple_choice",
                "options": [
                    "Economía y costo de vida",
                    "Seguridad pública",
                    "Salud pública",
                    "Educación",
                    "Comunicaciones y vocería del gobierno",
                    "Transparencia y probidad",
                    "Ninguna — creo que gestiona bien en general",
                ],
            },
            {
                "text": "¿La baja en la aprobación presidencial te parece normal para un gobierno en esta etapa?",
                "question_type": "single_choice",
                "options": [
                    "Sí, es esperable — todo gobierno pierde apoyo al inicio",
                    "No debería bajar tan rápido — hay problemas reales de gestión",
                    "La caída es más rápida de lo normal en la historia reciente",
                    "No sabe / No tiene opinión",
                ],
            },
            {
                "text": "¿El gobierno actual ha producido un cambio concreto en tu vida cotidiana desde que asumió?",
                "question_type": "single_choice",
                "options": [
                    "Sí, para mejor",
                    "Sí, para peor",
                    "No he notado cambios todavía",
                    "Es muy pronto para saberlo",
                ],
            },
        ],
        "_meta": {"idea_id": "IDEA-002", "confidence_score": 82, "variante": "C"},
    },

    # ── POLL-20260413-003 ────────────────────────────────
    {
        "title": "Presidente y La Moneda: ¿dónde termina lo privado y empieza lo público?",
        "context": (
            "Un debate esta semana ha instalado una pregunta de fondo sobre la presidencia: ¿qué "
            "límites deben existir entre la vida personal del Presidente y el uso del principal "
            "símbolo del Estado? Aunque el Presidente puede pagar los gastos directos de un evento, "
            "el uso del Palacio de La Moneda implica también personal de seguridad y protocolo "
            "financiado por todos los chilenos. La Contraloría está siendo consultada."
        ),
        "category": "politica",
        "tags": ["la-moneda", "presidencia", "patrimonio-publico", "institucionalidad", "transparencia"],
        "duration_days": 7,
        "questions": [
            {
                "text": "¿Qué tan de acuerdo estás con que el Presidente use el Palacio de La Moneda para actividades de carácter privado o social, aunque él pague los alimentos?",
                "question_type": "scale",
                "scale_points": 7,
                "scale_labels": [
                    "Muy en desacuerdo",
                    "Bastante en desacuerdo",
                    "Algo en desacuerdo",
                    "Neutral",
                    "Algo de acuerdo",
                    "Bastante de acuerdo",
                    "Muy de acuerdo",
                ],
            },
            {
                "text": "¿Qué aspectos del uso de La Moneda para eventos privados te parecen más cuestionables?",
                "question_type": "multiple_choice",
                "options": [
                    "El costo del personal de seguridad y protocolo del Estado asignado al evento",
                    "Usar un bien patrimonial de todos los chilenos para fines no institucionales",
                    "La falta de transparencia del gobierno al responder sobre los costos totales",
                    "La posibilidad de que el evento sirva para hacer lobby o contactos políticos informales",
                    "No veo nada cuestionable — el Presidente puede usar su lugar de trabajo",
                ],
            },
            {
                "text": "¿La Contraloría debería fijar una norma pública sobre el uso de las dependencias de La Moneda para actividades privadas del Presidente?",
                "question_type": "single_choice",
                "options": [
                    "Sí, para establecer reglas claras para todos los gobiernos",
                    "Solo si hay costos del Estado involucrados",
                    "No, el Presidente puede usar su lugar de trabajo según estime conveniente",
                    "No sabe / No tiene opinión",
                ],
            },
            {
                "text": "¿Este tipo de situaciones afecta tu confianza en el gobierno?",
                "question_type": "single_choice",
                "options": [
                    "Sí, bastante — muestra falta de cuidado con el patrimonio público",
                    "Algo — depende de si el Estado incurrió en costos adicionales",
                    "Poco o nada — me parece un tema menor",
                    "No tengo opinión formada",
                ],
            },
        ],
        "_meta": {"idea_id": "IDEA-003", "confidence_score": 72, "variante": "C"},
    },

    # ── POLL-20260413-004 ────────────────────────────────
    {
        "title": "¿Qué tan transparente es el gobierno en cómo comunica sus decisiones?",
        "context": (
            "La transparencia en la comunicación gubernamental es un pilar de la democracia. "
            "Los primeros meses de un gobierno son determinantes para construir o erosionar esa "
            "confianza. La forma en que los ministros y voceros explican las decisiones del ejecutivo "
            "define si los ciudadanos se sienten informados o excluidos."
        ),
        "category": "politica",
        "tags": ["transparencia", "comunicacion-gobierno", "voceria", "confianza-ciudadana", "democracia"],
        "duration_days": 14,  # tracking estructural
        "questions": [
            {
                "text": "¿Qué tan satisfecho/a estás con la forma en que el gobierno comunica sus decisiones a los ciudadanos?",
                "question_type": "scale",
                "scale_points": 7,
                "scale_labels": [
                    "Muy insatisfecho/a",
                    "Bastante insatisfecho/a",
                    "Algo insatisfecho/a",
                    "Neutral",
                    "Algo satisfecho/a",
                    "Bastante satisfecho/a",
                    "Muy satisfecho/a",
                ],
            },
            {
                "text": "¿A través de qué canales el gobierno se comunica de forma más efectiva con la ciudadanía?",
                "question_type": "multiple_choice",
                "options": [
                    "Conferencias de prensa y vocería oficial",
                    "Redes sociales",
                    "Entrevistas en medios de comunicación",
                    "Comunicados escritos y decretos oficiales",
                    "Ninguno — la comunicación es deficiente en todos los canales",
                ],
            },
            {
                "text": "¿Las declaraciones de los voceros y ministros del gobierno te resultan claras y comprensibles?",
                "question_type": "single_choice",
                "options": [
                    "Sí, siempre o casi siempre",
                    "A veces sí, a veces no",
                    "Pocas veces son claras",
                    "No, generalmente son confusas o contradictorias",
                    "No las sigo regularmente / No sabe",
                ],
            },
            {
                "text": "¿Sientes que el gobierno entrega suficiente información para que los ciudadanos puedan opinar sobre sus decisiones?",
                "question_type": "single_choice",
                "options": [
                    "Sí, entrega más que suficiente información",
                    "Entrega algo, pero podría ser más transparente",
                    "Entrega poca información — hay mucha opacidad",
                    "No entrega información suficiente",
                    "No sabe / No tiene opinión",
                ],
            },
        ],
        "_meta": {"idea_id": "IDEA-004", "confidence_score": 89, "variante": "C", "modo": "PERCEPCION"},
    },
]


# ── Main ─────────────────────────────────────────────────

async def main():
    from supabase._async.client import create_client as create_async_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    supabase = await create_async_client(url, key)

    now = datetime.now(timezone.utc)
    ok = 0

    print(f"Pipeline BEACON - Ingesta 13/04/2026 - {now.strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print("-" * 60)

    for p in POLLS:
        meta = p.pop("_meta", {})
        duration = p.pop("duration_days", 7)
        ends = now + timedelta(days=duration)

        qs = [make_question(q, i) for i, q in enumerate(p["questions"])]
        slug = make_slug(p["title"])

        # Verificar colisión de slug
        try:
            existing = await (
                supabase.table("polls")
                .select("id")
                .ilike("slug", slug)
                .maybe_single()
                .execute()
            )
            if existing and existing.data:
                slug = f"{slug}-{uuid.uuid4().hex[:6]}"
        except Exception:
            pass

        row = {
            "title":        p["title"],
            "slug":         slug,
            "context":      p["context"],
            "tags":         p["tags"],
            "category":     p["category"],
            "starts_at":    now.isoformat(),
            "ends_at":      ends.isoformat(),
            "status":       "active",
            "is_active":    True,
            "is_featured":  False,
            "created_by":   ADMIN_USER_ID,
            "questions":    qs,
            "requires_auth": True,
        }

        result = await supabase.table("polls").insert(row).execute()
        if result.data:
            poll = result.data[0]
            ok += 1
            print(f"OK  id={poll['id']}")
            print(f"    {p['title']}")
            print(f"    {len(qs)} preguntas | cat={p['category']} | {duration} días | score={meta.get('confidence_score')}% | {meta.get('idea_id')}")
            print()
        else:
            print(f"ERR {p['title']}")
            print()

    print("-" * 60)
    print(f"Resultado: {ok}/{len(POLLS)} encuestas insertadas")


if __name__ == "__main__":
    asyncio.run(main())
