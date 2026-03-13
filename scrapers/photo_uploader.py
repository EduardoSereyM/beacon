"""
BEACON PROTOCOL — Photo Uploader
==================================
Sube las fotos descargadas por wikipedia_scraper.py / bcn_scraper.py
al bucket de Supabase Storage (imagenes > entities) y actualiza
el campo photo_path de la tabla entities con la URL pública.

Flujo:
  1. Lee todos los archivos en scrapers/images/
  2. Para cada foto, extrae el entity_id parcial del nombre del archivo
     (ej: juan_luis_castro_gonzlez_f6c6bad3.jpg → f6c6bad3)
  3. Consulta Supabase para encontrar el UUID completo por prefijo
  4. Sube el archivo al bucket: imagenes/entities/{entity_id}.{ext}
  5. Obtiene la URL pública del bucket
  6. Actualiza entities.photo_path con esa URL

Uso:
    python scrapers/photo_uploader.py --dry-run
    python scrapers/photo_uploader.py --execute
    python scrapers/photo_uploader.py --execute --overwrite
    python scrapers/photo_uploader.py --execute --file juan_luis_castro_gonzlez_f6c6bad3.jpg

Convención del bucket:
    Bucket:   imagenes
    Carpeta:  entities/
    Ruta:     entities/{entity_id}.{ext}
    URL:      https://<proj>.supabase.co/storage/v1/object/public/imagenes/entities/{entity_id}.{ext}
"""

import os
import sys
import re
import argparse
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv

# ─── Carga .env desde backend/ ───
SCRIPT_DIR = Path(__file__).parent.resolve()
ROOT_DIR   = SCRIPT_DIR.parent
load_dotenv(ROOT_DIR / "backend" / ".env")

from supabase import create_client, Client  # type: ignore

# ─── Config ───
SUPABASE_URL        = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
IMAGES_DIR          = SCRIPT_DIR / "images"
BUCKET_NAME         = "imagenes"
BUCKET_FOLDER       = "entities"


# ══════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════

def extraer_entity_prefix(filename: str) -> str | None:
    """
    Extrae el prefijo de 8 chars del entity_id desde el nombre del archivo.
    Formato esperado: {nombre_limpio}_{entity_id_8chars}.{ext}
    Ej: 'juan_luis_castro_gonzlez_f6c6bad3.jpg' → 'f6c6bad3'
    """
    stem = Path(filename).stem          # sin extensión
    partes = stem.rsplit("_", 1)        # cortar por el último guion bajo
    if len(partes) == 2 and len(partes[1]) == 8 and partes[1].isalnum():
        return partes[1]
    return None


def buscar_entity_por_prefijo(supabase: Client, prefix: str) -> dict | None:
    """
    Encuentra la entidad cuyo UUID comienza con 'prefix' (8 chars hex).
    Supabase no soporta LIKE sobre columnas UUID — se filtran en Python.
    """
    try:
        result = (
            supabase.table("entities")
            .select("id, first_name, last_name, photo_path, is_active")
            .eq("is_active", True)
            .execute()
        )
        for row in (result.data or []):
            if row["id"].replace("-", "").startswith(prefix):
                return row
        return None
    except Exception as e:
        print(f"  ⚠️  Error consultando Supabase por prefix '{prefix}': {e}")
        return None



def construir_url_publica(supabase_url: str, bucket: str, path: str) -> str:
    """Construye la URL pública del objeto en Supabase Storage."""
    base = supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/public/{bucket}/{path}"


def subir_foto(
    supabase: Client,
    filepath: Path,
    entity_id: str,
    overwrite: bool = False,
) -> str | None:
    """
    Sube el archivo al bucket de Supabase Storage.
    Retorna la URL pública o None si falló.
    """
    ext         = filepath.suffix.lstrip(".")
    bucket_path = f"{BUCKET_FOLDER}/{entity_id}.{ext}"

    try:
        with open(filepath, "rb") as f:
            content = f.read()

        mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg",
                    "png": "image/png",  "webp": "image/webp"}
        content_type = mime_map.get(ext.lower(), "image/jpeg")

        if overwrite:
            # Borrar si ya existe (ignora error si no existía)
            try:
                supabase.storage.from_(BUCKET_NAME).remove([bucket_path])
            except Exception:
                pass

        supabase.storage.from_(BUCKET_NAME).upload(
            path=bucket_path,
            file=content,
            file_options={"content-type": content_type},
        )
        return construir_url_publica(SUPABASE_URL, BUCKET_NAME, bucket_path)

    except Exception as e:
        err_str = str(e)
        # Si ya existe y no se pidió overwrite, devolver la URL igualmente
        if "already exists" in err_str.lower() or "23505" in err_str:
            print(f"  ⚠️  Archivo ya existe en el bucket (usa --overwrite para reemplazar)")
            return construir_url_publica(SUPABASE_URL, BUCKET_NAME, bucket_path)
        print(f"  ❌ Error subiendo al bucket: {e}")
        return None


def actualizar_photo_path(supabase: Client, entity_id: str, url: str) -> bool:
    """Actualiza el campo photo_path de la entidad con la URL del bucket."""
    try:
        supabase.table("entities").update({
            "photo_path": url,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", entity_id).execute()
        return True
    except Exception as e:
        print(f"  ❌ Error actualizando photo_path: {e}")
        return False


# ══════════════════════════════════════════════
# PROCESADOR PRINCIPAL
# ══════════════════════════════════════════════

def procesar_foto(
    filepath: Path,
    supabase: Client,
    dry_run: bool,
    overwrite: bool,
) -> dict:
    filename = filepath.name
    print(f"\n📷 {filename}")

    # 1. Extraer prefijo del entity_id
    prefix = extraer_entity_prefix(filename)
    if not prefix:
        print(f"  ⚠️  No se pudo extraer entity_id del nombre — "
              f"formato esperado: nombre_{{8chars}}.ext")
        return {"status": "skipped", "reason": "bad_filename", "file": filename}

    # 2. Buscar entity en Supabase
    entity = buscar_entity_por_prefijo(supabase, prefix)
    if not entity:
        print(f"  ❌ No se encontró entity con id que empieza en '{prefix}'")
        return {"status": "not_found", "file": filename}

    entity_id   = entity["id"]
    nombre      = f"{entity.get('first_name', '')} {entity.get('last_name', '')}".strip()
    tiene_foto  = bool(entity.get("photo_path"))

    print(f"  👤 {nombre} ({entity_id[:8]}...)")

    # Si ya tiene URL de bucket y no se pidió overwrite, saltar
    if tiene_foto and not overwrite:
        current = entity.get("photo_path", "")
        if "supabase.co/storage" in current:
            print(f"  ⏭️  Ya tiene URL del bucket — saltando (usa --overwrite para forzar)")
            return {"status": "skipped", "reason": "already_uploaded", "file": filename}

    # 3. Construir ruta destino
    ext         = filepath.suffix.lstrip(".")
    bucket_path = f"{BUCKET_FOLDER}/{entity_id}.{ext}"
    url_publica = construir_url_publica(SUPABASE_URL, BUCKET_NAME, bucket_path)

    if dry_run:
        print(f"  🔵 DRY RUN — se subiría a: {bucket_path}")
        print(f"  🔵 DRY RUN — photo_path → {url_publica}")
        return {"status": "dry_run", "file": filename, "entity_id": entity_id}

    # 4. Subir al bucket
    print(f"  ⬆️  Subiendo a bucket: {bucket_path}")
    url = subir_foto(supabase, filepath, entity_id, overwrite=overwrite)
    if not url:
        return {"status": "error", "file": filename, "entity_id": entity_id}

    print(f"  ✅ Subida exitosa: {url[:80]}...")

    # 5. Actualizar photo_path en entities
    ok = actualizar_photo_path(supabase, entity_id, url)
    if ok:
        print(f"  💾 photo_path actualizado en Supabase")
        return {"status": "uploaded", "file": filename, "entity_id": entity_id, "url": url}
    else:
        return {"status": "error_db", "file": filename, "entity_id": entity_id}


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description=(
            "BEACON Photo Uploader — sube fotos de scrapers/images/ "
            "al bucket Supabase y actualiza entities.photo_path"
        )
    )
    parser.add_argument(
        "--dry-run", action="store_true", default=True,
        help="Simula sin subir ni modificar nada (default: True)",
    )
    parser.add_argument(
        "--execute", action="store_true",
        help="Ejecuta la subida real al bucket y actualiza Supabase",
    )
    parser.add_argument(
        "--overwrite", action="store_true",
        help="Reemplaza archivos ya existentes en el bucket y sobreescribe photo_path",
    )
    parser.add_argument(
        "--file", type=str, default=None,
        help="Procesar solo un archivo específico en scrapers/images/",
    )
    args = parser.parse_args()

    dry_run = not args.execute

    print("=" * 60)
    print("📤 BEACON Photo Uploader")
    print(f"   Modo:      {'🔵 DRY RUN (simulación)' if dry_run else '⚡ EJECUCIÓN REAL'}")
    print(f"   Overwrite: {args.overwrite}")
    print(f"   Directorio: {IMAGES_DIR}")
    print(f"   Bucket:    {BUCKET_NAME}/{BUCKET_FOLDER}/")
    print("=" * 60)

    # ─── Validaciones ───
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ SUPABASE_URL o SUPABASE_SERVICE_KEY no encontradas en backend/.env")
        sys.exit(1)

    if not IMAGES_DIR.exists():
        print(f"❌ Carpeta de imágenes no encontrada: {IMAGES_DIR}")
        print("   Ejecuta primero: python scrapers/wikipedia_scraper.py --execute")
        sys.exit(1)

    # ─── Listar archivos ───
    exts_validas = {".jpg", ".jpeg", ".png", ".webp"}
    if args.file:
        archivos = [IMAGES_DIR / args.file]
        archivos = [f for f in archivos if f.exists()]
    else:
        archivos = sorted([
            f for f in IMAGES_DIR.iterdir()
            if f.is_file() and f.suffix.lower() in exts_validas
        ])

    if not archivos:
        print(f"\n⚠️  No hay imágenes en {IMAGES_DIR}")
        print("   Extensiones soportadas: jpg, jpeg, png, webp")
        sys.exit(0)

    print(f"\n📁 {len(archivos)} imagen(es) encontradas\n")

    # ─── Conectar Supabase ───
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print(f"✅ Conectado a Supabase: {SUPABASE_URL[:40]}...\n")

    # ─── Procesar ───
    stats = {"uploaded": 0, "skipped": 0, "not_found": 0,
             "error": 0, "dry_run": 0}

    for filepath in archivos:
        resultado = procesar_foto(filepath, supabase, dry_run, args.overwrite)
        status    = resultado.get("status", "error")
        key       = status if status in stats else "error"
        stats[key] += 1

    # ─── Resumen ───
    print("\n" + "=" * 60)
    print("📊 RESUMEN")
    print(f"  ✅ Subidas y actualizadas: {stats['uploaded']}")
    print(f"  🔵 Dry-run:               {stats['dry_run']}")
    print(f"  ⏭️  Saltadas:              {stats['skipped']}")
    print(f"  ❌ No encontradas en DB:   {stats['not_found']}")
    print(f"  🚨 Errores:               {stats['error']}")
    print("=" * 60)

    if dry_run:
        print("\n💡 Para subir de verdad: agrega --execute a los argumentos")


if __name__ == "__main__":
    main()
