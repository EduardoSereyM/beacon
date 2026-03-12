#!/usr/bin/env python3
"""
BEACON PROTOCOL — fetch_db_schema.py
======================================
Extrae el esquema COMPLETO de Supabase (todos los schemas: public, auth,
storage, extensions, etc.) y genera docs/esquema_bbdd.md.

Modos de conexión (en orden de prioridad):
  1. --direct-url  → asyncpg directo al puerto 5432 (Session Pooler).
                     Soporta pg_catalog, information_schema y schemas privados.
  2. DATABASE_URL  → asyncpg directo desde variable de entorno.
  3. SUPABASE REST → supabase-py + service_role (solo schema público).
                     El Transaction Pooler (6543) NO soporta queries de catálogo.

Uso:
    cd backend
    python scripts/fetch_db_schema.py
    python scripts/fetch_db_schema.py --output ../docs/esquema_bbdd.md
    python scripts/fetch_db_schema.py --direct-url "postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres"

Requiere:
    pip install asyncpg python-dotenv supabase
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from textwrap import indent

# ── Cargar .env desde la carpeta backend/ ─────────────────────────────────────
ENV_PATH = Path(__file__).parent.parent / ".env"
if ENV_PATH.exists():
    from dotenv import load_dotenv
    load_dotenv(ENV_PATH)

# ── Constante de output por defecto ───────────────────────────────────────────
REPO_ROOT   = Path(__file__).parent.parent.parent
DEFAULT_OUT = REPO_ROOT / "docs" / "esquema_bbdd.md"


# ══════════════════════════════════════════════════════════════════════════════
# QUERIES — information_schema + pg_catalog
# Cubren TODOS los schemas, no solo 'public'.
# ══════════════════════════════════════════════════════════════════════════════

Q_SCHEMAS = """
SELECT schema_name, schema_owner
FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_toast', 'pg_catalog', 'information_schema')
ORDER BY schema_name;
"""

Q_TABLES = """
SELECT
    t.table_schema,
    t.table_name,
    t.table_type,
    obj_description(
        (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass,
        'pg_class'
    ) AS table_comment
FROM information_schema.tables t
WHERE t.table_schema NOT IN ('pg_toast', 'pg_catalog', 'information_schema')
ORDER BY t.table_schema, t.table_type, t.table_name;
"""

Q_COLUMNS = """
SELECT
    c.table_schema,
    c.table_name,
    c.ordinal_position AS pos,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.character_maximum_length,
    c.numeric_precision,
    c.numeric_scale,
    c.is_nullable,
    c.column_default,
    col_description(
        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
        c.ordinal_position
    ) AS column_comment
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('pg_toast', 'pg_catalog', 'information_schema')
ORDER BY c.table_schema, c.table_name, c.ordinal_position;
"""

Q_CONSTRAINTS = """
SELECT
    tc.table_schema,
    tc.table_name,
    tc.constraint_type,
    tc.constraint_name,
    string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns,
    ccu.table_schema  AS foreign_schema,
    ccu.table_name    AS foreign_table,
    ccu.column_name   AS foreign_column,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
    AND tc.table_schema   = rc.constraint_schema
LEFT JOIN information_schema.constraint_column_usage ccu
    ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.table_schema NOT IN ('pg_toast', 'pg_catalog', 'information_schema')
GROUP BY tc.table_schema, tc.table_name, tc.constraint_type, tc.constraint_name,
         ccu.table_schema, ccu.table_name, ccu.column_name, rc.update_rule, rc.delete_rule
ORDER BY tc.table_schema, tc.table_name, tc.constraint_type;
"""

Q_INDEXES = """
SELECT
    schemaname  AS schema_name,
    tablename   AS table_name,
    indexname   AS index_name,
    indexdef    AS definition
FROM pg_indexes
WHERE schemaname NOT IN ('pg_toast', 'pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, indexname;
"""

Q_POLICIES = """
SELECT
    schemaname AS schema_name,
    tablename  AS table_name,
    policyname AS policy_name,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname NOT IN ('pg_toast', 'pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, policyname;
"""

Q_FUNCTIONS = """
SELECT
    n.nspname  AS schema_name,
    p.proname  AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    t.typname  AS return_type,
    CASE p.prokind
        WHEN 'f' THEN 'FUNCTION'
        WHEN 'p' THEN 'PROCEDURE'
        WHEN 'a' THEN 'AGGREGATE'
        WHEN 'w' THEN 'WINDOW'
        ELSE p.prokind::text
    END AS kind,
    obj_description(p.oid, 'pg_proc') AS description
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_type t      ON t.oid = p.prorettype
WHERE n.nspname NOT IN ('pg_toast', 'pg_catalog', 'information_schema', 'pg_internal')
  AND n.nspname NOT LIKE 'pg_%'
ORDER BY n.nspname, p.proname;
"""

Q_TRIGGERS = """
SELECT
    trigger_schema,
    trigger_name,
    event_manipulation,
    event_object_schema,
    event_object_table,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema NOT IN ('pg_toast', 'pg_catalog', 'information_schema')
ORDER BY trigger_schema, event_object_table, trigger_name;
"""

Q_EXTENSIONS = """
SELECT
    name,
    default_version,
    installed_version,
    comment
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
ORDER BY name;
"""

Q_ENUMS = """
SELECT
    n.nspname AS schema_name,
    t.typname AS enum_name,
    e.enumlabel AS enum_value,
    e.enumsortorder AS sort_order
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typcategory = 'E'
ORDER BY n.nspname, t.typname, e.enumsortorder;
"""


# ══════════════════════════════════════════════════════════════════════════════
# FETCHER — asyncpg
# ══════════════════════════════════════════════════════════════════════════════

async def fetch_with_asyncpg(db_url: str) -> dict:
    """Conecta directamente a PostgreSQL y ejecuta todas las queries de catálogo."""
    try:
        import asyncpg
    except ImportError:
        print("ERROR: asyncpg no instalado. Ejecuta: pip install asyncpg", file=sys.stderr)
        sys.exit(1)

    print(f"[asyncpg] Conectando a PostgreSQL...", file=sys.stderr)
    conn = await asyncpg.connect(db_url)

    async def run(q: str) -> list[dict]:
        rows = await conn.fetch(q)
        return [dict(r) for r in rows]

    try:
        schema = {
            "schemas":     await run(Q_SCHEMAS),
            "tables":      await run(Q_TABLES),
            "columns":     await run(Q_COLUMNS),
            "constraints": await run(Q_CONSTRAINTS),
            "indexes":     await run(Q_INDEXES),
            "policies":    await run(Q_POLICIES),
            "functions":   await run(Q_FUNCTIONS),
            "triggers":    await run(Q_TRIGGERS),
            "extensions":  await run(Q_EXTENSIONS),
            "enums":       await run(Q_ENUMS),
        }
        print("[asyncpg] Schema completo obtenido.", file=sys.stderr)
        return schema
    finally:
        await conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# FETCHER — Supabase REST (fallback, solo schema public)
# ══════════════════════════════════════════════════════════════════════════════

async def fetch_with_supabase_rest() -> dict:
    """
    Fallback: usa supabase-py + service_role.
    Limitación: PostgREST solo expone el schema 'public'.
    No puede hacer queries a pg_catalog directamente.
    """
    try:
        from supabase import create_async_client
    except ImportError:
        print("ERROR: supabase no instalado. Ejecuta: pip install supabase", file=sys.stderr)
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_KEY", "")

    if not url or not key:
        print("ERROR: SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridos.", file=sys.stderr)
        sys.exit(1)

    print("[supabase-rest] ADVERTENCIA: modo limitado — solo schema 'public'", file=sys.stderr)
    print("[supabase-rest] Para schema completo usa --direct-url con puerto 5432", file=sys.stderr)

    client = await create_async_client(url, key)

    # Consultar tablas del schema public via PostgREST
    # PostgREST no permite queries a information_schema; solo enumera tablas expuestas.
    # Para introspección completa, usamos funciones RPC si están definidas.

    tables_result = await client.table("entities").select("id").limit(0).execute()

    # Construir schema mínimo desde conocimiento de migraciones
    return {
        "schemas": [{"schema_name": "public", "schema_owner": "postgres"}],
        "tables": [],
        "columns": [],
        "constraints": [],
        "indexes": [],
        "policies": [],
        "functions": [],
        "triggers": [],
        "extensions": [],
        "enums": [],
        "_mode": "supabase_rest_limited",
    }


# ══════════════════════════════════════════════════════════════════════════════
# MARKDOWN GENERATOR
# ══════════════════════════════════════════════════════════════════════════════

def _fmt_nullable(val: str) -> str:
    return "NULL" if val == "YES" else "NOT NULL"

def _fmt_type(row: dict) -> str:
    dt = row.get("data_type", "")
    udt = row.get("udt_name", "")
    char_max = row.get("character_maximum_length")
    num_prec = row.get("numeric_precision")
    num_scale = row.get("numeric_scale")

    if dt == "character varying":
        return f"VARCHAR({char_max})" if char_max else "TEXT"
    if dt == "numeric" and num_prec:
        return f"NUMERIC({num_prec},{num_scale or 0})"
    if dt == "USER-DEFINED":
        return udt.upper()
    return dt.upper() if dt else udt.upper()

def generate_markdown(schema: dict, generated_at: str) -> str:
    lines: list[str] = []
    mode_warning = schema.get("_mode") == "supabase_rest_limited"

    lines.append("# Esquema de Base de Datos — BEACON Protocol")
    lines.append("")
    lines.append(f"> **Generado:** {generated_at}  ")
    lines.append(f"> **Script:** `backend/scripts/fetch_db_schema.py`  ")
    if mode_warning:
        lines.append("> **⚠️ MODO LIMITADO:** Conexión via REST (solo schema public).  ")
        lines.append("> Para schema completo: `python scripts/fetch_db_schema.py --direct-url <URL>`  ")
    lines.append("")

    # ── Extensiones ─────────────────────────────────────────────────────────
    exts = schema.get("extensions", [])
    if exts:
        lines.append("## Extensiones PostgreSQL")
        lines.append("")
        lines.append("| Extensión | Versión | Descripción |")
        lines.append("|-----------|---------|-------------|")
        for e in exts:
            lines.append(f"| `{e['name']}` | {e.get('installed_version','')} | {e.get('comment','').split('.')[0]} |")
        lines.append("")

    # ── Enums ───────────────────────────────────────────────────────────────
    enums = schema.get("enums", [])
    if enums:
        lines.append("## Tipos ENUM")
        lines.append("")
        enum_grouped: dict[str, list] = {}
        for e in enums:
            key = f"{e['schema_name']}.{e['enum_name']}"
            enum_grouped.setdefault(key, []).append(e["enum_value"])
        for name, values in enum_grouped.items():
            lines.append(f"### `{name}`")
            lines.append(f"Valores: {', '.join(f'`{v}`' for v in values)}")
            lines.append("")

    # ── Schemas ──────────────────────────────────────────────────────────────
    schemas = schema.get("schemas", [])
    tables  = schema.get("tables", [])
    columns = schema.get("columns", [])
    constraints = schema.get("constraints", [])
    indexes = schema.get("indexes", [])
    policies = schema.get("policies", [])
    triggers = schema.get("triggers", [])

    # Agrupar columnas por tabla
    col_map: dict[str, list] = {}
    for c in columns:
        key = f"{c['table_schema']}.{c['table_name']}"
        col_map.setdefault(key, []).append(c)

    # Agrupar constraints por tabla
    con_map: dict[str, list] = {}
    for c in constraints:
        key = f"{c['table_schema']}.{c['table_name']}"
        con_map.setdefault(key, []).append(c)

    # Agrupar índices por tabla
    idx_map: dict[str, list] = {}
    for i in indexes:
        key = f"{i['schema_name']}.{i['table_name']}"
        idx_map.setdefault(key, []).append(i)

    # Agrupar políticas por tabla
    pol_map: dict[str, list] = {}
    for p in policies:
        key = f"{p['schema_name']}.{p['table_name']}"
        pol_map.setdefault(key, []).append(p)

    # Agrupar triggers por tabla
    trg_map: dict[str, list] = {}
    for t in triggers:
        key = f"{t['trigger_schema']}.{t['event_object_table']}"
        trg_map.setdefault(key, []).append(t)

    # Agrupar tablas por schema
    tbl_by_schema: dict[str, list] = {}
    for t in tables:
        tbl_by_schema.setdefault(t["table_schema"], []).append(t)

    schema_names = sorted(tbl_by_schema.keys())

    for schema_name in schema_names:
        schema_tables = tbl_by_schema[schema_name]
        lines.append(f"---")
        lines.append("")
        lines.append(f"## Schema `{schema_name}`")
        lines.append("")

        for tbl in schema_tables:
            tname = tbl["table_name"]
            ttype = tbl.get("table_type", "BASE TABLE")
            tcomment = tbl.get("table_comment") or ""
            full_key = f"{schema_name}.{tname}"

            type_label = "Vista" if "VIEW" in ttype else "Tabla"
            lines.append(f"### {type_label}: `{schema_name}.{tname}`")
            if tcomment:
                lines.append(f"")
                lines.append(f"_{tcomment}_")
            lines.append("")

            # ── Columnas ──────────────────────────────────────────────────
            cols = col_map.get(full_key, [])
            if cols:
                lines.append("#### Columnas")
                lines.append("")
                lines.append("| # | Columna | Tipo | Nullable | Default | Comentario |")
                lines.append("|---|---------|------|----------|---------|------------|")
                for c in sorted(cols, key=lambda x: x.get("pos", 0)):
                    col_type = _fmt_type(c)
                    nullable = _fmt_nullable(c.get("is_nullable", "YES"))
                    default  = c.get("column_default") or ""
                    # Truncar default largo
                    if len(default) > 40:
                        default = default[:37] + "..."
                    comment = (c.get("column_comment") or "").replace("\n", " ")[:60]
                    lines.append(
                        f"| {c.get('pos','')} "
                        f"| `{c['column_name']}` "
                        f"| `{col_type}` "
                        f"| {nullable} "
                        f"| `{default}` "
                        f"| {comment} |"
                    )
                lines.append("")

            # ── Constraints ───────────────────────────────────────────────
            cons = con_map.get(full_key, [])
            if cons:
                lines.append("#### Constraints")
                lines.append("")
                lines.append("| Tipo | Nombre | Columnas | Referencias |")
                lines.append("|------|--------|----------|-------------|")
                for c in cons:
                    ref = ""
                    if c.get("foreign_table"):
                        on_update = c.get("update_rule", "")
                        on_delete = c.get("delete_rule", "")
                        ref = f"`{c['foreign_schema']}.{c['foreign_table']}({c['foreign_column']})` ON DELETE {on_delete}"
                    lines.append(
                        f"| {c['constraint_type']} "
                        f"| `{c['constraint_name']}` "
                        f"| `{c.get('columns','')}` "
                        f"| {ref} |"
                    )
                lines.append("")

            # ── Índices ───────────────────────────────────────────────────
            idxs = idx_map.get(full_key, [])
            if idxs:
                lines.append("#### Índices")
                lines.append("")
                lines.append("| Nombre | Definición |")
                lines.append("|--------|------------|")
                for i in idxs:
                    defn = i.get("definition", "").replace("|", "\\|")
                    lines.append(f"| `{i['index_name']}` | `{defn}` |")
                lines.append("")

            # ── Políticas RLS ─────────────────────────────────────────────
            pols = pol_map.get(full_key, [])
            if pols:
                lines.append("#### Políticas RLS")
                lines.append("")
                lines.append("| Política | Permisiva | Roles | Comando | USING |")
                lines.append("|----------|-----------|-------|---------|-------|")
                for p in pols:
                    qual = (p.get("qual") or "").replace("|", "\\|")[:60]
                    roles = ", ".join(p.get("roles") or [])
                    lines.append(
                        f"| `{p['policy_name']}` "
                        f"| {p.get('permissive','PERMISSIVE')} "
                        f"| {roles} "
                        f"| {p.get('cmd','')} "
                        f"| `{qual}` |"
                    )
                lines.append("")

            # ── Triggers ─────────────────────────────────────────────────
            trgs = trg_map.get(full_key, [])
            if trgs:
                lines.append("#### Triggers")
                lines.append("")
                lines.append("| Nombre | Evento | Timing | Acción |")
                lines.append("|--------|--------|--------|--------|")
                seen = set()
                for t in trgs:
                    key_t = t["trigger_name"]
                    if key_t in seen:
                        continue
                    seen.add(key_t)
                    action = (t.get("action_statement") or "")[:60]
                    lines.append(
                        f"| `{t['trigger_name']}` "
                        f"| {t.get('event_manipulation','')} "
                        f"| {t.get('action_timing','')} "
                        f"| `{action}` |"
                    )
                lines.append("")

    # ── Funciones ────────────────────────────────────────────────────────────
    funcs = schema.get("functions", [])
    if funcs:
        lines.append("---")
        lines.append("")
        lines.append("## Funciones y Procedimientos")
        lines.append("")
        lines.append("| Schema | Nombre | Tipo | Args | Retorna | Descripción |")
        lines.append("|--------|--------|------|------|---------|-------------|")
        for f in funcs:
            args = (f.get("arguments") or "").replace("|", "\\|")
            if len(args) > 50:
                args = args[:47] + "..."
            desc = (f.get("description") or "")[:50]
            lines.append(
                f"| `{f['schema_name']}` "
                f"| `{f['function_name']}` "
                f"| {f.get('kind','')} "
                f"| `{args}` "
                f"| `{f.get('return_type','')}` "
                f"| {desc} |"
            )
        lines.append("")

    # ── Diagrama ER ─────────────────────────────────────────────────────────
    lines.append("---")
    lines.append("")
    lines.append("## Diagrama de Relaciones (Mermaid ER)")
    lines.append("")
    lines.append("```mermaid")
    lines.append("erDiagram")

    # Relaciones FK desde constraints
    fk_lines: list[str] = []
    for c in constraints:
        if c["constraint_type"] == "FOREIGN KEY" and c.get("foreign_table"):
            src = c["table_name"].upper()
            dst = c["foreign_table"].upper()
            col = c.get("columns", "id")
            fk_lines.append(f'    {src} }}o--|| {dst} : "{col}"')

    for fl in sorted(set(fk_lines)):
        lines.append(fl)

    lines.append("```")
    lines.append("")

    # ── Resumen ──────────────────────────────────────────────────────────────
    lines.append("---")
    lines.append("")
    lines.append("## Resumen")
    lines.append("")
    lines.append(f"| Métrica | Valor |")
    lines.append(f"|---------|-------|")
    lines.append(f"| Schemas | {len(schemas)} |")
    lines.append(f"| Tablas/Vistas | {len(tables)} |")
    lines.append(f"| Columnas totales | {len(columns)} |")
    lines.append(f"| Constraints | {len(constraints)} |")
    lines.append(f"| Índices | {len(indexes)} |")
    lines.append(f"| Políticas RLS | {len(policies)} |")
    lines.append(f"| Triggers | {len(triggers)} |")
    lines.append(f"| Funciones | {len(funcs)} |")
    lines.append(f"| Extensiones | {len(exts)} |")
    unique_enum_count = len(set(f"{e['schema_name']}.{e['enum_name']}" for e in enums))
    lines.append(f"| Enums | {unique_enum_count} |")

    lines.append("")

    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

async def main(direct_url: str | None, output_path: Path) -> None:
    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    # Determinar modo de conexión
    db_url = direct_url or os.environ.get("DATABASE_URL")

    if db_url:
        print(f"[fetch_db_schema] Modo: asyncpg directo", file=sys.stderr)
        schema = await fetch_with_asyncpg(db_url)
    else:
        print(f"[fetch_db_schema] DATABASE_URL no encontrado.", file=sys.stderr)
        print(f"[fetch_db_schema] Intentando modo Supabase REST...", file=sys.stderr)
        schema = await fetch_with_supabase_rest()

    # Generar markdown
    md = generate_markdown(schema, generated_at)

    # Escribir archivo
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(md, encoding="utf-8")
    print(f"[fetch_db_schema] ✅ Escrito: {output_path}", file=sys.stderr)
    print(f"[fetch_db_schema] Tablas encontradas: {len(schema.get('tables', []))}", file=sys.stderr)
    print(f"[fetch_db_schema] Schemas encontrados: {len(schema.get('schemas', []))}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extrae el schema completo de la BBDD Supabase y genera docs/esquema_bbdd.md"
    )
    parser.add_argument(
        "--direct-url",
        metavar="URL",
        help="URL directa de PostgreSQL (puerto 5432). Ej: postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres",
    )
    parser.add_argument(
        "--output",
        metavar="PATH",
        default=str(DEFAULT_OUT),
        help=f"Ruta del archivo de salida (default: {DEFAULT_OUT})",
    )
    args = parser.parse_args()

    asyncio.run(main(
        direct_url=args.direct_url,
        output_path=Path(args.output),
    ))
