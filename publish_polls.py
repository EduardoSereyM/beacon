#!/usr/bin/env python3
"""
publish_polls.py — BEACON Poll Publisher
=========================================
Transforma payloads del pipeline de agentes (AGENTE_05 / PUBLISHER)
al schema del backend y los publica en POST /api/v1/admin/polls.

Uso:
    python publish_polls.py --file PAYLOADS_PUBLICACIÓN_12ABR2026.md --token <JWT>
    python publish_polls.py --file payloads.md --token <JWT> --dry-run
    python publish_polls.py --file payloads.md --env .env.local

Variables de entorno (alternativa a --token):
    BEACON_ADMIN_TOKEN  → JWT del admin
    BEACON_API_URL      → base URL (default: https://beaconchile.cl)
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Windows: forzar UTF-8 en stdout para evitar UnicodeEncodeError con caracteres especiales
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

try:
    import httpx
except ImportError:
    print("❌  Falta httpx. Instala con: pip install httpx")
    sys.exit(1)

# ── Categorías válidas en el backend ────────────────────────────────────────
VALID_CATEGORIES = {
    "general", "politica", "economia", "salud",
    "educacion", "espectaculos", "deporte", "cultura",
    "seguridad", "justicia",
}

# ── Extractor de bloques JSON desde Markdown ────────────────────────────────

def extract_json_blocks(md_text: str) -> list[dict]:
    """Extrae todos los bloques ```json ... ``` del Markdown."""
    pattern = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL)
    blocks = []
    for match in pattern.finditer(md_text):
        try:
            blocks.append(json.loads(match.group(1)))
        except json.JSONDecodeError as e:
            print(f"⚠️  Bloque JSON inválido ignorado: {e}")
    return blocks


# ── Transformación de payload ────────────────────────────────────────────────

def transform_question(q: dict) -> dict:
    """
    Convierte una pregunta del formato AGENTE_05 al schema QuestionDef del backend.

    Agente usa:          Backend espera:
      question_type       type
      single_choice       multiple_choice + allow_multiple: false
      multiple_choice     multiple_choice + allow_multiple: true
      scale_points        scale_points (nuevo campo)
      scale_labels        scale_labels (nuevo campo)
    """
    q_type_raw = q.get("question_type", "multiple_choice")

    if q_type_raw == "scale":
        result: dict = {
            "text": q["text"],
            "type": "scale",
        }
        if "scale_points" in q:
            result["scale_points"] = q["scale_points"]
        if "scale_labels" in q:
            result["scale_labels"] = q["scale_labels"]
        if "order_index" in q:
            result["order_index"] = q["order_index"]
        return result

    # single_choice o multiple_choice → multiple_choice con flag
    allow_multiple = q_type_raw == "multiple_choice"
    return {
        "text": q["text"],
        "type": "multiple_choice",
        "allow_multiple": allow_multiple,
        "options": q.get("options", []),
        **({"order_index": q["order_index"]} if "order_index" in q else {}),
    }


def transform_payload(raw: dict) -> dict:
    """
    Convierte el payload completo del agente al schema PollCreateIn del backend.
    """
    now = datetime.now(timezone.utc)
    duration_days = raw.get("duration_days", 7)
    starts_at = now.isoformat()
    ends_at = (now + timedelta(days=duration_days)).isoformat()

    # Categoría: fallback a "general" si no es válida
    category = raw.get("category", "general")
    if category not in VALID_CATEGORIES:
        print(f"  ⚠️  Categoría '{category}' no válida → usando 'general'")
        category = "general"

    questions = [transform_question(q) for q in raw.get("questions", [])]

    return {
        "title":        raw["title"],
        "context":      raw.get("context"),
        "description":  raw.get("description"),
        "tags":         raw.get("tags", []),
        "category":     category,
        "starts_at":    starts_at,
        "ends_at":      ends_at,
        "status":       "active" if raw.get("is_active", True) else "draft",
        "requires_auth": raw.get("requires_auth", True),
        "questions":    questions,
        # header_image omitido — el Overlord lo asigna manualmente
    }


# ── Publicación ──────────────────────────────────────────────────────────────

def publish_poll(payload: dict, api_url: str, token: str, dry_run: bool) -> dict | None:
    title = payload.get("title", "Sin título")

    if dry_run:
        print(f"\n[DRY-RUN] POST /api/v1/admin/polls")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return {"dry_run": True, "title": title}

    url = f"{api_url.rstrip('/')}/api/v1/admin/polls"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    try:
        r = httpx.post(url, json=payload, headers=headers, timeout=20)
    except httpx.RequestError as e:
        print(f"  ❌  Error de conexión: {e}")
        return None

    if r.status_code == 201:
        data = r.json()
        poll_id = data.get("poll", {}).get("id", "?")
        print(f"  ✅  Publicada | id={poll_id} | '{title}'")
        return data
    else:
        print(f"  ❌  Error {r.status_code}: {r.text[:300]}")
        return None


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Publica encuestas BEACON desde payloads de agentes")
    parser.add_argument("--file", required=True, help="Archivo .md con los payloads JSON")
    parser.add_argument("--token", default=None, help="JWT del admin (o usa BEACON_ADMIN_TOKEN)")
    parser.add_argument("--api-url", default=None, help="Base URL (o usa BEACON_API_URL)")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra los payloads transformados, no publica")
    parser.add_argument("--env", default=None, help="Archivo .env para cargar variables")
    args = parser.parse_args()

    # Cargar .env si se provee
    if args.env:
        env_path = Path(args.env)
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    token = args.token or os.environ.get("BEACON_ADMIN_TOKEN", "")
    api_url = args.api_url or os.environ.get("BEACON_API_URL", "https://beaconchile.cl")

    if not token and not args.dry_run:
        print("❌  Falta el token admin. Usa --token <JWT> o BEACON_ADMIN_TOKEN=<JWT>")
        sys.exit(1)

    # Leer y parsear el archivo
    md_path = Path(args.file)
    if not md_path.exists():
        print(f"❌  Archivo no encontrado: {args.file}")
        sys.exit(1)

    raw_blocks = extract_json_blocks(md_path.read_text(encoding="utf-8"))
    if not raw_blocks:
        print("❌  No se encontraron bloques JSON en el archivo.")
        sys.exit(1)

    # Filtrar solo payloads de encuestas (tienen "questions" y "title")
    poll_blocks = [b for b in raw_blocks if "questions" in b and "title" in b]
    print(f"\n📋  {len(poll_blocks)} encuesta(s) encontrada(s) en {md_path.name}")

    results = []
    for i, raw in enumerate(poll_blocks, 1):
        print(f"\n── Poll {i}/{len(poll_blocks)}: '{raw.get('title', '?')}'")
        payload = transform_payload(raw)

        # Mostrar resumen de preguntas
        for j, q in enumerate(payload["questions"], 1):
            q_type = q["type"]
            if q_type == "scale":
                pts = q.get("scale_points", "?")
                label_count = len(q.get("scale_labels", []))
                print(f"   P{j}: escala {pts} pts, {label_count} etiqueta(s)")
            else:
                multi = "múltiple" if q.get("allow_multiple") else "única"
                opts = len(q.get("options", []))
                print(f"   P{j}: {multi}, {opts} opciones")

        result = publish_poll(payload, api_url, token, args.dry_run)
        results.append(result)

    # Resumen final
    print("\n" + "─" * 50)
    ok = sum(1 for r in results if r)
    fail = len(results) - ok
    if args.dry_run:
        print(f"🔍  DRY-RUN completo — {ok} payload(s) transformado(s)")
    else:
        print(f"✅  {ok} publicada(s)  |  ❌ {fail} fallida(s)")

    if fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
