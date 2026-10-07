"""
BEACON PROTOCOL — Publicador de ediciones de series de encuestas
=================================================================
Clona la plantilla de cada serie activa en una encuesta (polls) de su edición en
curso (mes o semana, según la cadencia de la serie). Idempotente: si la edición
ya existe no hace nada, así que el cron puede correr varias veces al día y
reintentarse sin duplicar.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from app.core.audit_logger import audit_bus
from app.core.polls_series.series_agenda import AwaitingOptions, edition_questions, load_edition_options
from app.core.polls_series.series_snapshot import snapshot_closed_editions
from app.core.polls_series.series_window import (
    CADENCES,
    current_edition,
    edition_label,
    edition_window,
)

logger = logging.getLogger("beacon.polls_series")


def build_edition_payload(
    series: dict[str, Any],
    edition: str,
    actor_id: str,
    questions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Construye la fila de `polls` para una edición. Las preguntas se copian con
    sus ids originales para que las ediciones sean comparables entre meses; en una serie
    agenda se pasan ya armadas con las opciones de la semana (`questions`)."""
    starts_at, ends_at = edition_window(edition)
    return {
        "title": f"{series['title']} — {edition_label(edition)}",
        "slug": f"{series['slug']}-{edition.lower()}",
        "context": series.get("context"),
        "tags": series.get("tags") or [],
        "starts_at": starts_at.isoformat(),
        "ends_at": ends_at.isoformat(),
        "status": "active",
        "is_active": True,
        "is_featured": False,
        "created_by": actor_id,
        "questions": questions if questions is not None else series["questions"],
        "category": series.get("category") or "general",
        "requires_auth": series.get("requires_auth", True),
        "series_id": series["id"],
        "edition": edition,
        "template_version": series["template_version"],
    }


class AuditWriteFailed(Exception):
    """La edición se publicó pero no se pudo escribir el audit_log."""

    def __init__(self, poll_id: str):
        super().__init__(f"audit_log no escrito para poll {poll_id}")
        self.poll_id = poll_id


def is_duplicate_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "23505" in text or "duplicate key" in text


async def _edition_exists(supabase, series_id: str, edition: str) -> bool:
    found = await (
        supabase.table("polls")
        .select("id")
        .eq("series_id", series_id)
        .eq("edition", edition)
        .limit(1)
        .execute()
    )
    return bool(found.data)


async def _touch_last_published(supabase, series: dict[str, Any]) -> None:
    """Dato informativo: si falla se registra, la edición ya está publicada."""
    try:
        await supabase.table("poll_series").update(
            {"last_published_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", series["id"]).execute()
    except Exception as exc:
        logger.error(f"series: no se pudo actualizar last_published_at | series={series['slug']} | {exc}")


async def publish_series_edition(
    supabase,
    series: dict[str, Any],
    edition: str,
    actor_id: str,
) -> dict[str, Any] | None:
    """Publica la edición `edition` de `series`. Devuelve la poll creada, o None
    si la edición ya existía."""
    if await _edition_exists(supabase, series["id"], edition):
        return None

    questions = None
    if series.get("kind") == "agenda":
        options = await load_edition_options(supabase, series["id"], edition)
        if options is None:
            raise AwaitingOptions(series["slug"], edition)
        questions = edition_questions(series["questions"], options)

    try:
        result = await supabase.table("polls").insert(
            build_edition_payload(series, edition, actor_id, questions)
        ).execute()
    except Exception as exc:
        # Carrera entre dos cron: el índice único (series_id, edition) rechazó el insert.
        # Otro 23505 (p.ej. slug ocupado por otra poll) NO es "ya publicada": se propaga.
        if is_duplicate_error(exc) and await _edition_exists(supabase, series["id"], edition):
            return None
        raise

    poll = result.data[0]
    logger.info(f"series: edición publicada | series={series['slug']} | edition={edition} | poll={poll['id']}")

    # La poll ya existe y no se borra: si el audit falla se reporta, no se oculta.
    audit_error: Exception | None = None
    try:
        await audit_bus.alog_event(
            actor_id=actor_id,
            action="SERIES_EDITION_PUBLISHED",
            entity_type="POLL",
            entity_id=poll["id"],
            details={
                "series_id": series["id"],
                "series_slug": series["slug"],
                "edition": edition,
                "cadence": series["cadence"],
                "template_version": series["template_version"],
            },
            raise_on_error=True,
        )
    except Exception as exc:
        logger.error(f"series: AUDIT FALLÓ tras publicar | poll={poll['id']} | {exc}", exc_info=True)
        audit_error = exc

    await _touch_last_published(supabase, series)

    if audit_error:
        raise AuditWriteFailed(poll["id"]) from audit_error
    return poll


async def publish_due_series(
    supabase,
    actor_id: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Publica la edición en curso (mensual o semanal, según su cadencia) de cada
    serie activa y fotografía las ediciones cerradas. Un error en una serie no
    impide publicar las demás."""
    now = now or datetime.now(timezone.utc)
    editions = {cadence: current_edition(now, cadence) for cadence in CADENCES}

    active = await (
        supabase.table("poll_series")
        .select("*")
        .eq("is_active", True)
        .execute()
    )

    published: list[str] = []
    skipped: list[str] = []
    failed: list[str] = []
    audit_failed: list[str] = []
    awaiting_options: list[str] = []

    for series in active.data or []:
        edition = editions[series["cadence"]]
        try:
            poll = await publish_series_edition(supabase, series, edition, actor_id)
        except AuditWriteFailed:
            published.append(series["slug"])
            audit_failed.append(series["slug"])
            continue
        except AwaitingOptions:
            # No es un fallo: una persona debe definir las opciones de la semana. Se reintenta en la siguiente ejecución.
            logger.warning(f"series: esperando opciones | series={series['slug']} | edition={edition}")
            awaiting_options.append(series["slug"])
            continue
        except Exception:
            logger.exception(f"series: error publicando | series={series['slug']} | edition={edition}")
            failed.append(series["slug"])
            continue
        (published if poll else skipped).append(series["slug"])

    # Las ediciones que ya cerraron quedan fotografiadas para la tendencia.
    snapshots = await snapshot_closed_editions(supabase, actor_id, now)

    return {"editions": editions, "published": published, "skipped": skipped,
            "failed": failed, "audit_failed": audit_failed, "awaiting_options": awaiting_options, **snapshots}
