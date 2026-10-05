"""
BEACON PROTOCOL — Ventana de edición de series de encuestas
============================================================
Calcula a qué mes pertenece una edición y su ventana de votación:
desde el día 1 00:00 hasta el último día del mes 23:59:59, hora de Chile
(America/Santiago). Los límites se devuelven en UTC para guardarlos como
timestamptz sin que el cierre se vea un día antes.
"""

import calendar
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

CHILE_TZ = ZoneInfo("America/Santiago")

MONTHS_ES = (
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
)


def current_edition(now: datetime) -> str:
    """Edición ('YYYY-MM') que corresponde a `now` en hora de Chile."""
    local = now.astimezone(CHILE_TZ)
    return f"{local.year:04d}-{local.month:02d}"


def edition_window(edition: str) -> tuple[datetime, datetime]:
    """(starts_at, ends_at) en UTC para una edición 'YYYY-MM'."""
    year, month = (int(part) for part in edition.split("-"))
    last_day = calendar.monthrange(year, month)[1]
    starts = datetime(year, month, 1, 0, 0, 0, tzinfo=CHILE_TZ)
    ends = datetime(year, month, last_day, 23, 59, 59, tzinfo=CHILE_TZ)
    return starts.astimezone(timezone.utc), ends.astimezone(timezone.utc)


def edition_label(edition: str) -> str:
    """Etiqueta legible, p.ej. '2026-10' → 'Octubre 2026'."""
    year, month = (int(part) for part in edition.split("-"))
    return f"{MONTHS_ES[month - 1]} {year}"
