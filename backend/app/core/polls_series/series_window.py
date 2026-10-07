"""
BEACON PROTOCOL — Ventana de edición de series de encuestas
============================================================
Calcula a qué edición pertenece un instante y su ventana de votación, en hora
de Chile (America/Santiago). Los límites se devuelven en UTC para guardarlos
como timestamptz sin que el cierre se vea un día antes.

  monthly → edición 'YYYY-MM':  día 1 00:00 → último día 23:59:59.
  weekly  → edición 'YYYY-Www' (semana ISO): lunes 04:00 → lunes siguiente 03:59:59.
            Chile cambia de horario el sábado a las 24:00; empezar el lunes a las
            04:00 deja el cambio dentro de la semana anterior a cualquier borde
            de ventana, así que el inicio y el cierre nunca caen en una hora
            ambigua o inexistente.
"""

import calendar
import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

CHILE_TZ = ZoneInfo("America/Santiago")

CADENCES = ("monthly", "weekly")
WEEK_START = time(4, 0, 0)
WEEK_END = time(3, 59, 59)

_WEEKLY_EDITION = re.compile(r"^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$")

MONTHS_ES = (
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
)
MONTHS_ES_SHORT = (
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
)


def current_edition(now: datetime, cadence: str = "monthly") -> str:
    """Edición que corresponde a `now` en hora de Chile para la cadencia dada."""
    local = now.astimezone(CHILE_TZ)
    if cadence == "monthly":
        return f"{local.year:04d}-{local.month:02d}"
    if cadence == "weekly":
        # Antes del lunes 04:00 todavía rige la semana anterior.
        iso_year, iso_week, _ = (local - timedelta(hours=WEEK_START.hour)).isocalendar()
        return f"{iso_year:04d}-W{iso_week:02d}"
    raise ValueError(f"Cadencia desconocida: {cadence!r}")


def _weekly_monday(edition: str) -> date | None:
    match = _WEEKLY_EDITION.match(edition)
    if not match:
        return None
    # fromisocalendar rechaza la semana 53 en años que no la tienen.
    return date.fromisocalendar(int(match.group(1)), int(match.group(2)), 1)


def edition_window(edition: str) -> tuple[datetime, datetime]:
    """(starts_at, ends_at) en UTC para una edición 'YYYY-MM' o 'YYYY-Www'."""
    monday = _weekly_monday(edition)
    if monday is not None:
        starts = datetime.combine(monday, WEEK_START, tzinfo=CHILE_TZ)
        ends = datetime.combine(monday + timedelta(days=7), WEEK_END, tzinfo=CHILE_TZ)
        return starts.astimezone(timezone.utc), ends.astimezone(timezone.utc)

    year, month = (int(part) for part in edition.split("-"))
    last_day = calendar.monthrange(year, month)[1]
    starts = datetime(year, month, 1, 0, 0, 0, tzinfo=CHILE_TZ)
    ends = datetime(year, month, last_day, 23, 59, 59, tzinfo=CHILE_TZ)
    return starts.astimezone(timezone.utc), ends.astimezone(timezone.utc)


def edition_label(edition: str) -> str:
    """Etiqueta legible: '2026-10' → 'Octubre 2026'; '2026-W41' → 'Semana 41 · 5–11 oct 2026'."""
    monday = _weekly_monday(edition)
    if monday is not None:
        sunday = monday + timedelta(days=6)
        week = int(edition.split("-W")[1])
        if monday.year != sunday.year:
            span = f"{monday.day} {MONTHS_ES_SHORT[monday.month - 1]} {monday.year} – {sunday.day} {MONTHS_ES_SHORT[sunday.month - 1]} {sunday.year}"
        elif monday.month != sunday.month:
            span = f"{monday.day} {MONTHS_ES_SHORT[monday.month - 1]} – {sunday.day} {MONTHS_ES_SHORT[sunday.month - 1]} {sunday.year}"
        else:
            span = f"{monday.day}–{sunday.day} {MONTHS_ES_SHORT[monday.month - 1]} {monday.year}"
        return f"Semana {week} · {span}"

    year, month = (int(part) for part in edition.split("-"))
    return f"{MONTHS_ES[month - 1]} {year}"
