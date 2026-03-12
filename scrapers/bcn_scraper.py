"""
BEACON PROTOCOL — BCN Scraper (Biblioteca del Congreso Nacional)
=================================================================
Enriquece entidades de categoría 'politico' usando el sitio
oficial de la Biblioteca del Congreso Nacional de Chile (bcn.cl).

BCN tiene fichas estructuradas para cada parlamentario con:
  - Foto oficial en alta resolución
  - Bio institucional
  - Cargo, región, partido, comisiones

Campos que puede completar:
  - photo_path   → URL de foto oficial BCN
  - bio          → Bio institucional
  - position     → Cargo actual (Diputado, Senador)
  - party        → Partido político
  - district     → Distrito o circunscripción
  - region       → Región representada
  - official_links → { "bcn": url }

Reglas Directives 2026:
  - Rate limiting: 3s entre requests (BCN es sensible)
  - Modo DRY_RUN por defecto
  - Nunca sobreescribe campos ya completados (modo safe)

Uso:
    python scrapers/bcn_scraper.py --dry-run
    python scrapers/bcn_scraper.py --execute --category politico
    python scrapers/bcn_scraper.py --execute --entity-id <uuid>
"""

import os
import sys
import time
import argparse
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from dotenv import load_dotenv

# ─── Carga .env desde backend/ ───
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
load_dotenv(os.path.join(ROOT_DIR, "backend", ".env"))

from supabase import create_client, Client  # type: ignore

# ─── Config ───
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
RATE_LIMIT_SECONDS = 3  # BCN es más sensible que Wikipedia
BCN_SEARCH_URL = "https://www.bcn.cl/historiapolitica/resenas_parlamentarias/busqueda.html"
BCN_BASE_URL = "https://www.bcn.cl"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-CL,es;q=0.9",
}


# ══════════════════════════════════════════════
# HELPERS BCN
# ══════════════════════════════════════════════

def buscar_en_bcn(nombre_completo: str) -> str | None:
    """
    Busca al parlamentario en BCN por nombre.
    Retorna la URL de su ficha individual o None si no encontró.
    """
    params = {"q": nombre_completo}
    try:
        resp = requests.get(BCN_SEARCH_URL, params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Los resultados de BCN están en links dentro de .resultado o similar
        # Busca links que contengan el nombre
        links = soup.find_all("a", href=True)
        nombre_lower = nombre_completo.lower()

        for link in links:
            href = link.get("href", "")
            texto = link.get_text(strip=True).lower()
            # Verifica que el link apunta a una ficha de parlamentario
            if "resena_parlamentaria" in href and any(
                parte in texto for parte in nombre_lower.split()[:2]
            ):
                url = href if href.startswith("http") else BCN_BASE_URL + href
                return url

        return None
    except Exception as e:
        print(f"  ⚠️  Error buscando en BCN '{nombre_completo}': {e}")
        return None


def extraer_datos_bcn(url: str) -> dict | None:
    """
    Extrae datos desde la ficha de parlamentario en BCN.
    Retorna dict con los campos encontrados o None si falla.
    """
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        datos = {"bcn_url": url}

        # ─── Foto ───
        # BCN tiene foto en un <img> con clase o ID específico
        foto_img = (
            soup.find("img", class_="foto-parlamentario")
            or soup.find("img", {"id": "foto_parlamentario"})
            or soup.find("div", class_="foto").find("img") if soup.find("div", class_="foto") else None
        )
        if foto_img and foto_img.get("src"):
            src = foto_img["src"]
            datos["photo_url"] = src if src.startswith("http") else BCN_BASE_URL + src

        # ─── Bio ───
        bio_div = (
            soup.find("div", class_="resena")
            or soup.find("div", {"id": "resena"})
            or soup.find("div", class_="biografia")
        )
        if bio_div:
            # Extraer solo el texto, limpiar whitespace
            bio_text = " ".join(bio_div.get_text().split())
            datos["bio"] = bio_text[:600].rsplit(" ", 1)[0] + "..." if len(bio_text) > 600 else bio_text

        # ─── Cargo, Partido, Región ───
        # BCN muestra esto en una tabla de datos o lista de definición
        tabla = soup.find("table", class_="datos-parlamentario") or soup.find("dl")
        if tabla:
            filas = tabla.find_all("tr") or []
            for fila in filas:
                celdas = fila.find_all(["th", "td"])
                if len(celdas) >= 2:
                    campo = celdas[0].get_text(strip=True).lower()
                    valor = celdas[1].get_text(strip=True)
                    if "partido" in campo:
                        datos["party"] = valor
                    elif "cargo" in campo or "calidad" in campo:
                        datos["position"] = valor
                    elif "región" in campo or "region" in campo:
                        datos["region"] = valor
                    elif "distrito" in campo or "circunscripción" in campo:
                        datos["district"] = valor

        return datos if len(datos) > 1 else None

    except Exception as e:
        print(f"  ⚠️  Error extrayendo datos de BCN '{url}': {e}")
        return None


# ══════════════════════════════════════════════
# NÚCLEO: ENRIQUECIMIENTO POR ENTIDAD
# ══════════════════════════════════════════════

def construir_nombre(entity: dict) -> str:
    """Construye nombre de búsqueda desde campos de la entidad."""
    partes = [
        entity.get("first_name", ""),
        entity.get("last_name", ""),
        entity.get("second_last_name", ""),
    ]
    nombre = " ".join(p for p in partes if p).strip()
    return nombre or entity.get("name", "")


def enriquecer_entidad(
    entity: dict,
    supabase: Client,
    dry_run: bool = True,
    overwrite_bio: bool = False,
    overwrite_photo: bool = False,
) -> dict:
    """
    Procesa una entidad individual contra BCN:
    1. Busca su ficha en BCN
    2. Extrae foto, bio, cargo, partido, región
    3. Actualiza en Supabase (o simula si dry_run=True)
    """
    entity_id = entity["id"]
    nombre = construir_nombre(entity)
    category = entity.get("category", "")

    print(f"\n🔍 [{category.upper()}] {nombre} ({entity_id[:8]}...)")

    tiene_bio = bool(entity.get("bio"))
    tiene_foto = bool(entity.get("photo_path"))

    if tiene_bio and tiene_foto and not overwrite_bio and not overwrite_photo:
        print(f"  ⏭️  Bio y foto ya existen — saltando")
        return {"status": "skipped", "reason": "already_complete", "name": nombre}

    # ─── Buscar en BCN ───
    bcn_url = buscar_en_bcn(nombre)
    if not bcn_url:
        print(f"  ❌ No encontrado en BCN")
        return {"status": "not_found", "name": nombre}

    print(f"  📄 BCN → {bcn_url}")

    # ─── Extraer datos ───
    time.sleep(RATE_LIMIT_SECONDS)
    datos = extraer_datos_bcn(bcn_url)
    if not datos:
        print(f"  ❌ No se pudo extraer datos")
        return {"status": "error", "name": nombre}

    # ─── Preparar updates ───
    updates: dict = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if datos.get("bio") and (not tiene_bio or overwrite_bio):
        updates["bio"] = datos["bio"]
        print(f"  ✅ Bio extraída ({len(datos['bio'])} chars)")

    if datos.get("photo_url") and (not tiene_foto or overwrite_photo):
        updates["photo_path"] = datos["photo_url"]
        print(f"  🖼️  Foto → {datos['photo_url'][:60]}...")
    elif tiene_foto and not overwrite_photo:
        print(f"  ⏭️  Foto ya existe")

    if datos.get("party") and not entity.get("party"):
        updates["party"] = datos["party"]
        print(f"  🏛️  Partido → {datos['party']}")

    if datos.get("position") and not entity.get("position"):
        updates["position"] = datos["position"]
        print(f"  💼 Cargo → {datos['position']}")

    if datos.get("region") and not entity.get("region"):
        updates["region"] = datos["region"]
        print(f"  📍 Región → {datos['region']}")

    if datos.get("district") and not entity.get("district"):
        updates["district"] = datos["district"]
        print(f"  🗺️  Distrito → {datos['district']}")

    # Official links
    if datos.get("bcn_url"):
        existing_links = entity.get("official_links") or {}
        if isinstance(existing_links, dict):
            existing_links["bcn"] = datos["bcn_url"]
        else:
            existing_links = {"bcn": datos["bcn_url"]}
        updates["official_links"] = existing_links
        print(f"  🔗 BCN URL añadida a official_links")



    if len(updates) <= 1:  # Solo updated_at, nada nuevo
        print(f"  ⏭️  Sin datos nuevos para actualizar")
        return {"status": "skipped", "reason": "no_new_data", "name": nombre}

    # ─── Guardar ───
    if dry_run:
        print(f"  🔵 DRY RUN — campos que se actualizarían: {list(updates.keys())}")
        return {"status": "dry_run", "name": nombre, "would_update": list(updates.keys())}

    try:
        supabase.table("entities").update(updates).eq("id", entity_id).execute()
        print(f"  💾 GUARDADO en Supabase")
        return {"status": "updated", "name": nombre, "fields": list(updates.keys())}
    except Exception as e:
        print(f"  ❌ Error guardando: {e}")
        return {"status": "error", "name": nombre, "error": str(e)}


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="BEACON BCN Scraper — enriquece políticos desde la Biblioteca del Congreso Nacional"
    )
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--execute", action="store_true", help="Escribe en la BBDD")
    parser.add_argument("--overwrite-bio", action="store_true")
    parser.add_argument("--overwrite-photo", action="store_true")
    parser.add_argument("--entity-id", type=str, default=None)
    parser.add_argument("--category", type=str, default="politico")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()

    dry_run = not args.execute

    print("=" * 60)
    print("🏛️  BEACON BCN Scraper")
    print(f"   Modo: {'🔵 DRY RUN' if dry_run else '⚡ EJECUCIÓN REAL'}")
    print(f"   Categoría: {args.category}")
    print(f"   Límite: {args.limit} entidades")
    print("=" * 60)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ SUPABASE_URL o SUPABASE_SERVICE_KEY no encontradas en backend/.env")
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print(f"✅ Conectado a Supabase")

    # ─── Fetch entidades ───
    try:
        query = (
            supabase.table("entities")
            .select(
                "id, first_name, last_name, second_last_name, "
                "category, bio, photo_path, official_links, "
                "region, party, position, district"
            )
            .eq("is_active", True)
            .is_("deleted_at", "null")
            .limit(args.limit)
        )

        if args.entity_id:
            query = query.eq("id", args.entity_id)
        else:
            query = query.eq("category", args.category.lower())

        result = query.execute()
        entities = result.data or []
    except Exception as e:
        print(f"❌ Error consultando Supabase: {e}")
        sys.exit(1)

    print(f"\n📋 {len(entities)} entidades encontradas\n")

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

        time.sleep(RATE_LIMIT_SECONDS)

    print("\n" + "=" * 60)
    print("📊 RESUMEN DEL RUN")
    print(f"  ✅ Actualizadas:  {stats['updated']}")
    print(f"  🔵 Dry-run:       {stats['dry_run']}")
    print(f"  ⏭️  Saltadas:      {stats['skipped']}")
    print(f"  ❌ No encontradas: {stats['not_found']}")
    print(f"  🚨 Errores:       {stats['error']}")
    print("=" * 60)

    if dry_run:
        print("\n💡 Para ejecutar en modo real: agrega --execute")


if __name__ == "__main__":
    main()
