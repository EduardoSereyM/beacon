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
import os
import sys
import time
import argparse
import requests
import re
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
BCN_BASE_URL = "https://www.bcn.cl"
BCN_WIKI_URL = "https://www.bcn.cl/historiapolitica/resenas_parlamentarias/wiki/"

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

def construir_slug_bcn(nombre_completo: str) -> str:
    """
    Convierte nombre a slug BCN estilo wiki.
    Ej: 'Juan Luis Castro González' -> 'Juan_Luis_Castro_Gonz%C3%A1lez'
    BCN usa nombre con mayúsculas separado por guiones bajos y URL-encoded.
    """
    import urllib.parse
    slug = nombre_completo.strip().replace(" ", "_")
    return urllib.parse.quote(slug, safe="_")


def buscar_en_bcn(nombre_completo: str) -> str | None:
    """
    Construye la URL directa al wiki de BCN para el parlamentario.
    BCN usa https://www.bcn.cl/historiapolitica/resenas_parlamentarias/wiki/Nombre_Apellido
    No tiene buscador—las fichas van directamente por slug del nombre.
    Verifica que la página exista (status 200) antes de retornar.
    """
    slug = construir_slug_bcn(nombre_completo)
    url = BCN_WIKI_URL + slug
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code == 200:
            return url
        return None
    except Exception as e:
        print(f"  ⚠️  Error verificando URL BCN '{url}': {e}")
        return None



def limpiar_nombre_archivo(nombre: str) -> str:
    """Limpia el nombre para usarlo en el sistema de archivos."""
    nombre = nombre.lower().replace(" ", "_").strip()
    return re.sub(r'[^a-z0-9_]', '', nombre)

def descargar_imagen(url: str, nombre_completo: str, entity_id: str) -> str | None:
    """Descarga la imagen localmente y retorna la ruta."""
    if not url:
        return None
        
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        
        images_dir = os.path.join(SCRIPT_DIR, "images")
        os.makedirs(images_dir, exist_ok=True)
        
        ext = url.split('.')[-1].split('?')[0]
        if len(ext) > 4 or not ext.isalnum():
            ext = "jpg"
            
        nombre_limpio = limpiar_nombre_archivo(nombre_completo)
        nombre_archivo = f"{nombre_limpio}_{entity_id[:8]}.{ext}"
        filepath = os.path.join(images_dir, nombre_archivo)
        
        with open(filepath, "wb") as f:
            f.write(resp.content)
            
        return f"scrapers/images/{nombre_archivo}"
    except Exception as e:
        print(f"  ⚠️  Error descargando foto de BCN: {e}")
        return None

def extraer_datos_bcn(url: str) -> dict | None:
    """
    Extrae datos desde la ficha wiki de parlamentario en BCN.
    Parsea el primer párrafo biográfico para extraer:
      - party (partido político)
      - position (cargo: Senador/Diputado)
      - district (circunscripción o distrito)
      - region (región representada)
      - photo_url (foto oficial BCN)
    """
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        resp.encoding = "utf-8"  # Forzar UTF-8 para caracteres con tilde
        soup = BeautifulSoup(resp.text, "html.parser")
        datos = {"bcn_url": url}

        # ─── Foto ───
        for img in soup.find_all("img"):
            src = img.get("src", "")
            if "/img/" in src or "parlamentario" in src.lower() or "foto" in src.lower():
                datos["photo_url"] = src if src.startswith("http") else BCN_BASE_URL + src
                break

        # ─── Extraer datos desde texto plano ───
        # La ficha BCN tiene una tabla tipo:
        # Senador | 2022 - 2030 | 8ª Circunscripción | Partido Socialista de Chile
        # Extraímos el texto completo y aplicamos regex simples.
        texto = soup.get_text(" ", strip=True)

        # ─── Partido ───
        partido_match = re.search(
            r'Partido\s+[A-ZÀ-Ü][\w\s\-\'\u00e0-üÀ-Ü]+?(?=\s+(?:Diputad|Senad|\d{4}|$))',
            texto
        )
        if partido_match:
            datos["party"] = partido_match.group(0).strip()

        # ─── Cargo ───
        cargo_match = re.search(r'(Senadora?|Diputada?o?)', texto)
        if cargo_match:
            datos["position"] = cargo_match.group(1).strip()

        # ─── Circunscripción/Distrito ───
        dist_match = re.search(
            r'(\d+[\u00aa\u00baªº]?\s*(?:Circunscripci\u00f3n|Distrito)(?:\s+N\u00ba\s*\d+)?)',
            texto
        )
        if dist_match:
            datos["district"] = dist_match.group(1).strip()

        # ─── Región ───
        region_match = re.search(
            r'Regi\u00f3n\s+(?:de|del|de la|de los)\s+([A-Za-z\u00c0-\u00ff][\w\s\']+?)(?=\s*(?:,|\.|\d|Partido|Senado|Diputa|$))',
            texto
        )
        if region_match:
            datos["region"] = "Región " + region_match.group(1).strip()

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

    tiene_foto = bool(entity.get("photo_path"))

    if tiene_foto and not overwrite_photo:
        print(f"  ⏭️  Foto ya existe — saltando verificación de BCN si solo es foto")
        # Todavía queremos traer region, partido, distrito, etc.
        # No retornamos early si no tiene esos datos.

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

    # (Bio omitida por requerimiento de usuario)

    # Descarga foto
    if datos.get("photo_url") and (not tiene_foto or overwrite_photo):
        print(f"  🖼️  Encontrada Foto en BCN → {datos['photo_url'][:60]}...")
        if not dry_run:
            local_path = descargar_imagen(datos["photo_url"], nombre, entity_id)
            if local_path:
                updates["photo_path"] = local_path
                print(f"  ✅ Foto BCN guardada en {local_path}")
        else:
            print(f"  🔵 DRY RUN — se descargaría la foto BCN localmente")
            updates["photo_path"] = f"scrapers/images/simulado_foto_bcn.jpg"
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
                "category, photo_path, official_links, "
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
