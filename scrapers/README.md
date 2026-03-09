# BEACON: Recolección Inteligente de Datos (Scrapers)
# =====================================================
# Scripts para enriquecer la tabla `entities` con datos
# verificables desde fuentes públicas oficiales.
#
# Directives 2026:
#   - Cada dato debe incluir source_url y last_scraped_at
#   - Cambios drásticos se marcan para Revisión Humana
#   - NUNCA insertar sin validación de integridad previa
#   - Rate limiting mínimo: 2-3s entre requests

## Scripts disponibles

| Script | Fuente | Campos que llena |
|--------|--------|-----------------|
| `wikipedia_scraper.py` | Wikipedia ES (API REST) | `photo_path`, `bio`, `official_links.wikipedia` |
| `bcn_scraper.py` | BCN (HTML) | `bio`, `photo_path`, `position`, `party`, `district`, `region` |

## Instalación

```bash
# Desde la raíz del proyecto
pip install -r scrapers/requirements.txt
```

## Uso

### Wikipedia Scraper (empezar aquí, sin riesgos)

```bash
# Simular (no escribe en BBDD)
python scrapers/wikipedia_scraper.py --dry-run

# Procesar solo una entidad
python scrapers/wikipedia_scraper.py --dry-run --entity-id <uuid>

# Solo políticos, ejecutar de verdad
python scrapers/wikipedia_scraper.py --execute --category politico --limit 10

# Con sobreescritura de bio
python scrapers/wikipedia_scraper.py --execute --overwrite-bio --limit 5
```

### BCN Scraper (solo para políticos)

```bash
# Simular
python scrapers/bcn_scraper.py --dry-run --category politico --limit 5

# Ejecutar
python scrapers/bcn_scraper.py --execute --category politico --limit 10
```

## Flujo recomendado

1. **Primero**: Correr Wikipedia en dry-run → revisar output
2. **Luego**: Wikipedia con `--execute --limit 10` → validar en Supabase Dashboard
3. **Si OK**: aumentar limit o correr por categoría
4. **BCN**: Para políticos sin bio/foto después de Wikipedia
