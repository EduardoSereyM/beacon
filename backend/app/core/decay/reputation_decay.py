"""
BEACON PROTOCOL — Reputation Decay (Decaimiento Temporal de Reputación)
========================================================================
Responsabilidad única: calcular y aplicar el decaimiento exponencial del
reputation_score de entidades que no han recibido nuevos votos.

Fórmula (mean-reversion exponencial hacia el prior Bayesiano):
  new_score = C + (old_score - C) × exp(−ln(2) × elapsed_days / half_life)

Donde:
  C         = 3.0 (prior Bayesiano — neutro)
  half_life = DECAY_HALF_LIFE_DAYS desde config_params (default: 180 días)
  elapsed_days = días desde el último voto (last_reviewed_at)

Comportamiento:
  - A los 0 días: score inalterado.
  - A los 180 días (half_life): score = C + (old_score − C) × 0.5
    → Un 5.0 pasa a 4.0; un 1.0 pasa a 2.0. La verdad se enfría.
  - A los 360 días: score = C + (old_score − C) × 0.25
  - A tiempo ∞: score → C = 3.0 (neutral perpetuo)

Seguridad:
  - Solo afecta entidades con last_reviewed_at < threshold
  - No toca entidades sin votos (last_reviewed_at IS NULL)
  - Registra AUDIT_LOG por cada entidad modificada (trazabilidad)
  - Dry-run disponible para pre-visualizar cambios sin modificar la BBDD

"Una reputación que no se actualiza, se erosiona."
"""

import math
import logging
from datetime import datetime, timezone

logger = logging.getLogger("beacon.decay")

# Prior Bayesiano — espejo de BAYESIAN_C en votes.py
BAYESIAN_PRIOR = 3.0

# Half-life por defecto si config_params no está disponible
DEFAULT_HALF_LIFE_DAYS = 180.0

# Threshold mínimo de días antes de aplicar decay (evitar ruido)
MIN_DAYS_FOR_DECAY = 30


def compute_decayed_score(
    old_score: float,
    elapsed_days: float,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
    prior: float = BAYESIAN_PRIOR,
) -> float:
    """
    Calcula el nuevo score tras decay exponencial.

    Args:
        old_score: Score actual [0, 5]
        elapsed_days: Días desde el último voto
        half_life_days: Vida media del decaimiento (desde config_params)
        prior: Prior Bayesiano = punto de convergencia a largo plazo

    Returns:
        Nuevo score [0, 5], redondeado a 4 decimales.
    """
    if elapsed_days < MIN_DAYS_FOR_DECAY:
        return round(old_score, 4)

    decay_factor = math.exp(-math.log(2) * elapsed_days / half_life_days)
    new_score = prior + (old_score - prior) * decay_factor
    return round(max(0.0, min(5.0, new_score)), 4)


class ReputationDecayJob:
    """
    Job de decaimiento temporal de reputation scores.

    Diseño:
      - Fetch de entidades con last_reviewed_at vencido desde Supabase
      - Cálculo de decay por entidad (sin bloquear el event loop)
      - UPDATE batch en Supabase
      - Audit log de cada entidad modificada
    """

    def __init__(self, supabase_client, half_life_days: float = DEFAULT_HALF_LIFE_DAYS):
        self._supabase = supabase_client
        self._half_life_days = half_life_days

    async def fetch_half_life_from_config(self) -> float:
        """Lee DECAY_HALF_LIFE_DAYS desde config_params. Fallback al default."""
        try:
            result = await (
                self._supabase.table("config_params")
                .select("value")
                .eq("key", "DECAY_HALF_LIFE_DAYS")
                .single()
                .execute()
            )
            if result.data:
                return float(result.data["value"])
        except Exception as e:
            logger.warning(f"No se pudo leer DECAY_HALF_LIFE_DAYS: {e}. Usando {DEFAULT_HALF_LIFE_DAYS}d")
        return DEFAULT_HALF_LIFE_DAYS

    async def run(
        self,
        dry_run: bool = False,
        min_days: int = MIN_DAYS_FOR_DECAY,
    ) -> dict:
        """
        Ejecuta el decay job completo.

        Args:
            dry_run: Si True, calcula cambios pero NO escribe en la BBDD.
            min_days: Mínimo de días de inactividad para aplicar decay.

        Returns:
            Resumen: {total_processed, total_modified, dry_run, changes}
        """
        now = datetime.now(timezone.utc)
        half_life = await self.fetch_half_life_from_config()
        self._half_life_days = half_life

        logger.info(
            f"[DecayJob] Iniciando | half_life={half_life}d | "
            f"min_days={min_days} | dry_run={dry_run}"
        )

        # Traer solo entidades con last_reviewed_at (las que tienen votos)
        # y solo los campos necesarios para el cálculo
        try:
            result = await (
                self._supabase.table("entities")
                .select("id, reputation_score, last_reviewed_at, total_reviews")
                .not_.is_("last_reviewed_at", "null")
                .eq("is_active", True)
                .execute()
            )
        except Exception as e:
            logger.error(f"[DecayJob] Error fetching entities: {e}")
            return {"error": str(e), "total_processed": 0, "total_modified": 0}

        entities = result.data or []
        logger.info(f"[DecayJob] {len(entities)} entidades con votos previos")

        changes = []
        errors = []

        for entity in entities:
            entity_id = entity["id"]
            old_score = float(entity.get("reputation_score") or BAYESIAN_PRIOR)
            last_reviewed_raw = entity.get("last_reviewed_at")

            if not last_reviewed_raw:
                continue

            try:
                last_reviewed = datetime.fromisoformat(
                    last_reviewed_raw.replace("Z", "+00:00")
                )
            except (ValueError, AttributeError):
                continue

            elapsed_days = (now - last_reviewed).total_seconds() / 86400.0

            if elapsed_days < min_days:
                continue

            new_score = compute_decayed_score(old_score, elapsed_days, half_life)

            # Solo procesar si hay cambio significativo (> 0.001)
            if abs(new_score - old_score) < 0.001:
                continue

            change = {
                "entity_id": entity_id,
                "old_score": old_score,
                "new_score": new_score,
                "elapsed_days": round(elapsed_days, 1),
                "delta": round(new_score - old_score, 4),
            }
            changes.append(change)

            if not dry_run:
                try:
                    await (
                        self._supabase.table("entities")
                        .update({"reputation_score": new_score})
                        .eq("id", entity_id)
                        .execute()
                    )
                    # Audit log del decay aplicado
                    await (
                        self._supabase.table("audit_logs")
                        .insert({
                            "actor_id": "SYSTEM",
                            "action": "REPUTATION_DECAY_APPLIED",
                            "entity_type": "ENTITY",
                            "entity_id": entity_id,
                            "details": change,
                            "created_at": now.isoformat(),
                        })
                        .execute()
                    )
                except Exception as e:
                    logger.error(f"[DecayJob] Error updating entity {entity_id}: {e}")
                    errors.append({"entity_id": entity_id, "error": str(e)})

        summary = {
            "dry_run": dry_run,
            "half_life_days": half_life,
            "min_days_threshold": min_days,
            "total_processed": len(entities),
            "total_eligible": len(changes) + len(errors),
            "total_modified": len(changes) if not dry_run else 0,
            "total_errors": len(errors),
            "changes": changes,
            "errors": errors,
            "ran_at": now.isoformat(),
        }

        logger.info(
            f"[DecayJob] Completado | eligible={summary['total_eligible']} | "
            f"modified={summary['total_modified']} | errors={summary['total_errors']}"
        )

        return summary
