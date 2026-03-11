#!/usr/bin/env python3
"""
BEACON PROTOCOL — run_decay.py
================================
Script ejecutable para el decay job de reputación.
Diseñado para ser invocado por un cron job o manualmente.

Uso:
  # Dry-run (no escribe en la BBDD — solo muestra qué cambiaría)
  cd backend && python scripts/run_decay.py --dry-run

  # Producción (aplica el decay)
  cd backend && python scripts/run_decay.py

  # Umbral personalizado (mínimo 60 días de inactividad)
  cd backend && python scripts/run_decay.py --min-days 60

Cron sugerido (ejecutar cada noche a las 03:00 UTC):
  0 3 * * * cd /app/backend && python scripts/run_decay.py >> /var/log/beacon/decay.log 2>&1

Requiere:
  - .env con SUPABASE_URL y SUPABASE_SERVICE_KEY
  - pip install supabase python-dotenv
"""

import asyncio
import argparse
import json
import sys
from pathlib import Path

# Asegurar que el backend está en el path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()


async def main(dry_run: bool, min_days: int) -> int:
    """Ejecuta el decay job. Retorna 0 si OK, 1 si hay errores."""
    from app.core.database import get_async_supabase_client
    from app.core.decay.reputation_decay import ReputationDecayJob

    supabase = get_async_supabase_client()
    job = ReputationDecayJob(supabase)

    print(f"[run_decay] Iniciando decay job | dry_run={dry_run} | min_days={min_days}")

    summary = await job.run(dry_run=dry_run, min_days=min_days)

    if "error" in summary:
        print(f"[run_decay] ERROR CRÍTICO: {summary['error']}", file=sys.stderr)
        return 1

    print(json.dumps(summary, indent=2, ensure_ascii=False))

    if dry_run:
        print(f"\n[run_decay] DRY-RUN: {summary['total_eligible']} entidades serían modificadas.")
        print("[run_decay] Ejecutar sin --dry-run para aplicar cambios.")
    else:
        print(
            f"\n[run_decay] Completado: {summary['total_modified']} entidades actualizadas, "
            f"{summary['total_errors']} errores."
        )

    return 1 if summary.get("total_errors", 0) > 0 else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="BEACON Reputation Decay Job — decaimiento temporal hacia el prior Bayesiano"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Calcula cambios sin escribir en la BBDD (preview seguro)",
    )
    parser.add_argument(
        "--min-days",
        type=int,
        default=30,
        help="Mínimo de días de inactividad para aplicar decay (default: 30)",
    )
    args = parser.parse_args()

    exit_code = asyncio.run(main(dry_run=args.dry_run, min_days=args.min_days))
    sys.exit(exit_code)
