"""
BEACON PROTOCOL — Ingest Politicians (Carga Masiva de Entidades)
=================================================================
Script de ingesta que lee entities_data.json y carga los registros
en la tabla 'entities' de Supabase vía REST API.

Mapeo JSON → Tabla entities:
  first_name       → first_name
  last_name        → last_name
  second_last_name → second_last_name
  category         → category  (CHECK: 'politico', 'periodista', 'empresario')
  position         → position
  region           → region
  district         → district
  metadata.*       → official_links (JSONB) + bio

"Lo que no está en la BBDD, no existe en el Búnker."
"""

import json
import urllib.request
import urllib.error
import ssl

# ─── Supabase Configuration ───
SUPABASE_URL = "https://ejholgyffguoxlflvoqx.supabase.co/rest/v1/entities"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaG9sZ3lmZmd1b3hsZmx2b3F4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg2NzE5OCwiZXhwIjoyMDg3NDQzMTk4fQ.VpecmJXpIgjl46zxy-eFYLpWwYE2eQQ2LP805WEf5Js"

# ─── Tamaño de lote para evitar payloads gigantes ───
BATCH_SIZE = 50


def build_payload(item: dict) -> dict:
    """
    Transforma un registro del JSON al formato de la tabla 'entities'.
    """
    metadata = item.get("metadata", {})

    # official_links agrupa: email, phone, curriculum, source, id_external
    official_links = {
        "email": metadata.get("email"),
        "phone": metadata.get("phone"),
        "curriculum": metadata.get("curriculum"),
        "source": metadata.get("source"),
        "id_external": item.get("id_external"),
    }

    # Bio generada a partir de partido y posición
    party = metadata.get("party", "Sin partido")
    position = item.get("position", "")
    region = item.get("region", "")
    bio = f"{position} por {region}. Partido: {party}."

    return {
        "first_name": item.get("first_name", ""),
        "last_name": item.get("last_name", ""),
        "second_last_name": item.get("second_last_name"),
        "category": item.get("category", "politico"),
        "position": item.get("position"),
        "region": item.get("region"),
        "district": item.get("district"),
        "bio": bio,
        "official_links": official_links,
        "is_active": True,
    }


def send_batch(payloads: list, batch_num: int):
    """Envía un lote al REST API de Supabase."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        SUPABASE_URL,
        data=json.dumps(payloads).encode("utf-8"),
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            status_code = response.getcode()
            response_data = response.read().decode("utf-8")
            inserted = len(json.loads(response_data))
            print(f"  Lote {batch_num}: {inserted} registros insertados (HTTP {status_code})")
            return inserted
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"  ❌ Lote {batch_num} ERROR HTTP {e.code}: {e.reason}")
        print(f"     Detalle: {body[:500]}")
        return 0
    except Exception as e:
        print(f"  ❌ Lote {batch_num} ERROR: {e}")
        return 0


def main():
    print("=" * 60)
    print("🛡️  BEACON PROTOCOL — Ingesta de Entidades Políticas")
    print("=" * 60)

    # ─── 1. Leer JSON ───
    print("\n📂 Leyendo entities_data.json...")
    with open("entities_data.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    entities_list = data.get("entities", [])
    total = len(entities_list)
    print(f"   {total} entidades encontradas.\n")

    # ─── 2. Transformar payloads ───
    payloads = [build_payload(item) for item in entities_list]

    # ─── 3. Enviar en lotes ───
    print(f"🚀 Enviando en lotes de {BATCH_SIZE}...\n")
    total_inserted = 0
    batch_num = 1

    for i in range(0, len(payloads), BATCH_SIZE):
        batch = payloads[i : i + BATCH_SIZE]
        inserted = send_batch(batch, batch_num)
        total_inserted += inserted
        batch_num += 1

    # ─── 4. Resumen ───
    print(f"\n{'=' * 60}")
    print(f"✅ Ingesta completada: {total_inserted}/{total} entidades cargadas.")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
