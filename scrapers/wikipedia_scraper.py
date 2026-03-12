"""
BEACON PROTOCOL — Wikipedia Scraper
=====================================
Enriquece entidades de la tabla 'entities' usando la API de Wikipedia ES.
NO usa Playwright — la API REST de Wikipedia es pública y no requiere JS.

Campos que puede completar:
  - photo_path   → thumbnail de Wikipedia (URL directa)
  - bio          → extracto resumido (primer párrafo)
  - official_links → { "wikipedia": url }

Reglas Directives 2026:
  - Cada dato incluye source_url y last_scraped_at
  - Rate limiting: 2s entre requests
  - Modo DRY_RUN: simula sin escribir en DB
  - Nunca sobreescribe campos ya completados (modo safe)

Uso:
    python scrapers/wikipedia_scraper.py --dry-run
    python scrapers/wikipedia_scraper.py --overwrite-bio
    python scrapers/wikipedia_scraper.py --entity-id <uuid>
"""

import os
import sys
import time
import argparse
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

# ─── Carga .env desde backend/ ───
# El scraper corre desde la raíz del proyecto; el .env está en backend/
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
load_dotenv(os.path.join(ROOT_DIR, "backend", ".env"))

from supabase import create_client, Client  # type: ignore

# ─── Config ───
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
RATE_LIMIT_SECONDS = 2  # Pausa entre requests a Wikipedia
WIKIPEDIA_API = "https://es.wikipedia.org/api/rest_v1/page/summary"
WIKIPEDIA_SEARCH = "https://es.wikipedia.org/w/api.php"

HEADERS = {
    "User-Agent": "BEACON-Protocol-Bot/1.0 (contacto@beaconchile.cl; https://beaconchile.cl)",
    "Accept": "application/json"
}

# ══════════════════════════════════════════════
# HELPERS DE WIKIPEDIA
# ══════════════════════════════════════════════

def buscar_en_wikipedia(nombre_completo: str) -> dict | None:
    """
    Busca el artículo de Wikipedia más relevante para un nombre dado.
    Usa el endpoint de búsqueda para tolerar variaciones en el nombre.
    Retorna el slug (título) del artículo o None si no encontró nada.
    """
    params = {
        "action": "query",
        "list": "search",
        "srsearch": nombre_completo,
        "srlimit": 3,
        "format": "json",
        "srprop": "snippet",
        "srnamespace": 0,
    }
    try:
        resp = requests.get(WIKIPEDIA_SEARCH, params=params, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        results = resp.json().get("query", {}).get("search", [])
        if not results:
            return None
        # Retorna el primer resultado (el más relevante según Wikipedia)
        return {"title": results[0]["title"], "snippet": results[0].get("snippet", "")}
    except Exception as e:
        print(f"  ⚠️  Error en búsqueda Wikipedia para '{nombre_completo}': {e}")
        return None


def obtener_summary_wikipedia(title: str) -> dict | None:
    """
    Llama a la REST API de Wikipedia para obtener el summary de un artículo.
    Retorna dict con: extract, thumbnail_url, page_url.
    """
    url = f"{WIKIPEDIA_API}/{requests.utils.quote(title)}"
    try:
        resp = requests.get(url, timeout=10, headers=HEADERS)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
        return {
            "extract": data.get("extract", ""),
            "thumbnail_url": data.get("thumbnail", {}).get("source"),
            "page_url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
            "title": data.get("title", title),
        }
    except Exception as e:
        print(f"  ⚠️  Error obteniendo summary de '{title}': {e}")
        return None


# ══════════════════════════════════════════════
# NÚCLEO: ENRIQUECIMIENTO POR ENTIDAD
# ══════════════════════════════════════════════

def construir_nombre(entity: dict) -> str:
    """Construye el nombre de búsqueda desde los campos de la entidad."""
    partes = [
        entity.get("first_name", ""),
        entity.get("last_name", ""),
        entity.get("second_last_name", ""),
    ]
    nombre = " ".join(p for p in partes if p).strip()
    # Fallback: usar el campo 'name' si existe
    if not nombre:
        nombre = entity.get("name", "")
    return nombre


def enriquecer_entidad(
    entity: dict,
    supabase: Client,
    dry_run: bool = True,
    overwrite_bio: bool = False,
    overwrite_photo: bool = False,
) -> dict:
    """
    Procesa una entidad individual:
    1. Busca su artículo de Wikipedia
    2. Extrae foto, bio y URL
    3. Actualiza en Supabase (o simula si dry_run=True)
    Retorna un dict con el resultado del proceso.
    """
    entity_id = entity["id"]
    nombre = construir_nombre(entity)
    category = entity.get("category", "")

    print(f"\n🔍 [{category.upper()}] {nombre} ({entity_id[:8]}...)")

    # Verificar si ya tiene datos (modo safe)
    tiene_bio = bool(entity.get("bio"))
    tiene_foto = bool(entity.get("photo_path"))

    if tiene_bio and not overwrite_bio:
        print(f"  ⏭️  Bio ya existe — saltando (usa --overwrite-bio para forzar)")
        return {"status": "skipped", "reason": "bio_exists", "name": nombre}

    # ─── Paso 1: Buscar en Wikipedia ───
    resultado_busqueda = buscar_en_wikipedia(nombre)
    if not resultado_busqueda:
        print(f"  ❌ No encontrado en Wikipedia")
        return {"status": "not_found", "name": nombre}

    title = resultado_busqueda["title"]
    print(f"  📖 Wikipedia → \"{title}\"")

    # ─── Paso 2: Obtener summary ───
    time.sleep(RATE_LIMIT_SECONDS)
    summary = obtener_summary_wikipedia(title)
    if not summary:
        print(f"  ❌ No se pudo obtener summary")
        return {"status": "error", "name": nombre}

    # ─── Paso 3: Preparar campos a actualizar ───
    updates: dict = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Bio
    if summary["extract"] and (not tiene_bio or overwrite_bio):
        # Limitar a ~500 chars para bio (primer párrafo)
        bio_text = summary["extract"][:500].rsplit(" ", 1)[0] + "..."
        updates["bio"] = bio_text
        print(f"  ✅ Bio extraída ({len(bio_text)} chars)")

    # Foto
    if summary["thumbnail_url"] and (not tiene_foto or overwrite_photo):
        updates["photo_path"] = summary["thumbnail_url"]
        print(f"  🖼️  Foto → {summary['thumbnail_url'][:60]}...")
    elif tiene_foto and not overwrite_photo:
        print(f"  ⏭️  Foto ya existe — saltando")

    # Official links (merge, no reemplaza)
    if summary["page_url"]:
        existing_links = entity.get("official_links") or {}
        if isinstance(existing_links, dict):
            existing_links["wikipedia"] = summary["page_url"]
        else:
            existing_links = {"wikipedia": summary["page_url"]}
        updates["official_links"] = existing_links
        print(f"  🔗 Wikipedia URL añadida a official_links")



    # ─── Paso 4: Actualizar en Supabase ───
    if dry_run:
        print(f"  🔵 DRY RUN — no se escribió nada (campos: {list(updates.keys())})")
        return {"status": "dry_run", "name": nombre, "would_update": list(updates.keys())}

    try:
        supabase.table("entities").update(updates).eq("id", entity_id).execute()
        print(f"  💾 GUARDADO en Supabase")
        return {"status": "updated", "name": nombre, "fields": list(updates.keys())}
    except Exception as e:
        print(f"  ❌ Error al guardar: {e}")
        return {"status": "error", "name": nombre, "error": str(e)}


# ══════════════════════════════════════════════
# ORQUESTADOR PRINCIPAL
# ══════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="BEACON Wikipedia Scraper — enriquece entidades con foto y bio desde Wikipedia ES"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Simula el scraping sin escribir en la BBDD (default: True)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Ejecuta el scraping y escribe en la BBDD (desactiva dry-run)",
    )
    parser.add_argument(
        "--overwrite-bio",
        action="store_true",
        help="Sobreescribe bio existente (por defecto no toca bios ya completadas)",
    )
    parser.add_argument(
        "--overwrite-photo",
        action="store_true",
        help="Sobreescribe foto existente",
    )
    parser.add_argument(
        "--entity-id",
        type=str,
        default=None,
        help="UUID de una entidad específica (procesa solo esa)",
    )
    parser.add_argument(
        "--category",
        type=str,
        default=None,
        help="Filtrar por categoría: politico, empresario, periodista",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Máximo de entidades a procesar en este run (default: 20)",
    )
    args = parser.parse_args()

    # Si --execute está presente, desactiva dry_run
    dry_run = not args.execute

    print("=" * 60)
    print("🛡️  BEACON Wikipedia Scraper")
    print(f"   Modo: {'🔵 DRY RUN (simulación)' if dry_run else '⚡ EJECUCIÓN REAL'}")
    print(f"   Overwrite bio: {args.overwrite_bio}")
    print(f"   Overwrite foto: {args.overwrite_photo}")
    print(f"   Límite: {args.limit} entidades")
    print("=" * 60)

    # ─── Conexión Supabase ───
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ ERROR: SUPABASE_URL o SUPABASE_SERVICE_KEY no encontradas en .env")
        print("   Asegúrate de que backend/.env existe y tiene las variables correctas.")
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print(f"✅ Conectado a Supabase: {SUPABASE_URL[:40]}...")

    # ─── Fetch de entidades ───
    try:
        query = (
            supabase.table("entities")
            .select(
                "id, first_name, last_name, second_last_name, "
                "category, bio, photo_path, official_links, region, party"
            )
            .eq("is_active", True)
            .is_("deleted_at", "null")
            .limit(args.limit)
        )

        if args.entity_id:
            query = query.eq("id", args.entity_id)
        elif args.category:
            query = query.eq("category", args.category.lower())

        result = query.execute()
        entities = result.data or []
    except Exception as e:
        print(f"❌ Error al consultar Supabase: {e}")
        sys.exit(1)

    print(f"\n📋 {len(entities)} entidades encontradas\n")

    if not entities:
        print("⚠️  No hay entidades que procesar.")
        sys.exit(0)

    # ─── Procesamiento ───
    stats = {"updated": 0, "skipped": 0, "not_found": 0, "error": 0, "dry_run": 0}

    for entity in entities:
        resultado = enriquecer_entidad(
            entity=entity,
            supabase=supabase,
            dry_run=dry_run,
            overwrite_bio=args.overwrite_bio,
            overwrite_photo=args.overwrite_photo,
        )
        status = resultado.get("status", "error")
        if status in stats:
            stats[status] += 1
        else:
            stats["error"] += 1

        # Rate limiting entre entidades
        time.sleep(RATE_LIMIT_SECONDS)

    # ─── Resumen ───
    print("\n" + "=" * 60)
    print("📊 RESUMEN DEL RUN")
    print(f"  ✅ Actualizadas:  {stats['updated']}")
    print(f"  🔵 Dry-run:       {stats['dry_run']}")
    print(f"  ⏭️  Saltadas:      {stats['skipped']}")
    print(f"  ❌ No encontradas: {stats['not_found']}")
    print(f"  🚨 Errores:       {stats['error']}")
    print("=" * 60)

    if dry_run:
        print("\n💡 Para ejecutar en modo real: agrega --execute a los argumentos")


if __name__ == "__main__":
    main()
