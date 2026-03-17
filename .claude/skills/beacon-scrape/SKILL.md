---
name: beacon-scrape
description: Guía técnica para implementar los scrapers de P6 (BCN, Cámara, Senado, Wikipedia) siguiendo las Directives 2026 y la estructura de la carpeta scrapers/
allowed-tools: Read, Write, Bash, Grep, Glob
disable-model-invocation: false
---

# beacon-scrape — Skill de Scraping & Enrichment de Entidades

## Propósito
Este skill guía la implementación de los **6 scripts de P6** definidos en `ROADMAP_LOG.md` para completar los campos faltantes de la tabla `entities` (foto, bio, partido, cargo, district, official_links).

Invoca con `/beacon-scrape` cuando el usuario necesite:
- Implementar o modificar scripts en `scrapers/`
- Enriquecer entidades con datos de fuentes públicas
- Diagnosticar por qué un scraper falla o trae datos incorrectos

---

## Contexto del Proyecto

### Tabla objetivo
```
entities (Supabase)
  ├── metadata JSONB  → bio, photo_path, official_links, district, position, party
  ├── source_url TEXT → URL de donde se extrajo el dato (OBLIGATORIO)
  └── last_scraped_at TIMESTAMPTZ → cuándo se scrapeó (OBLIGATORIO)
```

### Scripts a implementar (en orden de prioridad)
| Script | Fuente | Campos objetivo |
|--------|--------|-----------------|
| `scrapers/wikipedia_scraper.py` | Wikipedia ES | `bio` (primer párrafo), `photo_path` (infobox) |
| `scrapers/bcn_scraper.py` | bcn.cl | `bio`, `party`, `position` |
| `scrapers/camara_scraper.py` | camara.cl | `photo_path`, `district`, `region` |
| `scrapers/senado_scraper.py` | senado.cl | `photo_path`, datos senadores |
| `scrapers/photo_downloader.py` | Imágenes encontradas | Descarga a Supabase Storage |
| `scrapers/enrichment_runner.py` | Orquestador | Itera `entities` sin foto/bio, llama scrapers |

---

## Reglas Operativas (NON-NEGOTIABLE — Directives 2026)

### 1. Trazabilidad obligatoria
Todo dato insertado DEBE llevar:
```python
{
    "source_url": "https://www.bcn.cl/person/...",   # URL exacta
    "last_scraped_at": "2026-03-11T10:00:00Z",       # ISO 8601
    "scraper_version": "1.0"                          # versión del script
}
```
Estos van dentro del campo `metadata JSONB` de la tabla `entities`.

### 2. Rate limiting OBLIGATORIO
```python
import time
time.sleep(2.0)  # MÍNIMO 2 segundos entre páginas de la misma fuente
```
Nunca hacer requests paralelos a la misma fuente.

### 3. Validación antes de UPSERT
```python
# Antes de escribir en Supabase:
# 1. Verificar que el campo no sea vacío ni None
# 2. Si el cambio es DRÁSTICO (ej: partido cambia de "UDI" a "PC"),
#    marcar para Revisión Humana en lugar de actualizar automáticamente
if abs_change_is_drastic(old_value, new_value):
    mark_for_human_review(entity_id, field, old_value, new_value)
    return  # NO insertar
```

### 4. NUNCA insertar sin validación previa
- Verificar que el `entity_id` existe en la tabla `entities`
- Validar formato de campos críticos (foto: extensión .jpg/.png/.webp)
- Loguear cada operación en consola con nivel INFO

### 5. Soft-upsert (no sobreescribir si ya hay dato)
```python
# Solo actualizar si el campo está vacío en la DB
if entity.metadata.get("bio") is None:
    # actualizar
else:
    # solo loguear "ya tiene dato, skip"
```

---

## Estructura de Carpetas

```
scrapers/
├── data/                    # JSONs brutos descargados (gitignored)
├── scripts/
│   ├── wikipedia_scraper.py
│   ├── bcn_scraper.py
│   ├── camara_scraper.py
│   ├── senado_scraper.py
│   ├── photo_downloader.py
│   └── enrichment_runner.py
└── utils/
    ├── supabase_client.py   # Cliente con service_role para UPSERT
    ├── helpers.py           # Limpieza de strings, normalización
    └── rate_limiter.py      # Decorador de rate limiting
```

---

## Patrón Stage → Clean → Load

Cada scraper sigue tres etapas:

```python
# STAGE: Descargar HTML/JSON bruto
raw_data = fetch_page(url)
save_raw(raw_data, "data/bcn_raw.json")

# CLEAN: Limpiar y normalizar
bio = clean_text(raw_data["bio"])
party = normalize_party_name(raw_data["party"])

# LOAD: Upsert en Supabase con trazabilidad
supabase.table("entities").update({
    "metadata": {"bio": bio, "party": party,
                 "source_url": url,
                 "last_scraped_at": now_iso()}
}).eq("id", entity_id).execute()
```

---

## Fuentes Autorizadas y sus URLs

| Fuente | URL base | Notas |
|--------|----------|-------|
| BCN | `https://www.bcn.cl/` | Fichas de parlamentarios |
| Cámara | `https://www.camara.cl/diputados/` | Fotos oficiales HD |
| Senado | `https://www.senado.cl/senadores/` | Fotos y datos senadores |
| Wikipedia ES | `https://es.wikipedia.org/wiki/` | Bio y foto infobox |
| Servel | `https://www.servel.cl/` | Solo datos electorales |

---

## Cómo reportar al usuario

Al terminar `/beacon-scrape`, entrega siempre:
1. Lista de entidades enriquecidas (con `entity_id` y campos actualizados)
2. Lista de entidades marcadas para Revisión Humana (si las hay)
3. Errores o fuentes que no respondieron
4. Próximo paso recomendado

---

## Referencia de archivos clave

- `ROADMAP_LOG.md` → Sección P6 (estrategia completa)
- `MEMORY.md` → Stack y variables de entorno
- `backend/app/core/config.py` → SUPABASE_URL, SUPABASE_SERVICE_KEY
- `docs/esquema_bbdd.md` → Esquema completo de la tabla `entities`
