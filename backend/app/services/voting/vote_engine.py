"""
BEACON PROTOCOL — Vote Engine (Motor de Votos para Personajes Públicos)
========================================================================
Sistema de evaluación cívica con las siguientes reglas:

Voto Único (MVP / Upsert):
  Un usuario puede evaluar a una entidad muchas veces,
  pero SOLO el último voto se persiste. No hay duplicados
  en el ranking histórico de gestión.

Sliders Estructurales (1-5):
  PERSON: Transparencia, Gestión, Coherencia
  COMPANY: Calidad, Precio, Atención
  EVENT: Organización, Impacto, Valor

Bono Territorial Quirúrgico:
  El multiplicador SOLO se aplica si:
    1. verify_territoriality() == True
    2. entity_type == "PERSON" con jurisdicción definida
    3. user.rank >= SILVER (RUT verificado)
  Si NO se cumplen las 3 condiciones → bonus = 1.0x

Shadow Mode (DNA Scanner):
  Si el DNA score < 70, el voto se procesa en Shadow Mode:
    - El usuario ve su voto como 'exitoso'
    - Internamente: is_counted = False
  "No le decimos al bot que lo detectamos."

"Cada voto es un juicio. Cada juicio tiene consecuencias."
"""

import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger("beacon.vote_engine")


# ─── Rangos con acceso a bonus territorial ───
TERRITORIAL_ELIGIBLE_RANKS = {"SILVER", "GOLD", "DIAMOND"}

# ─── Tipos de entidad con jurisdicción ───
JURISDICTIONAL_ENTITY_TYPES = {"PERSON"}


@dataclass
class VotePayload:
    """Estructura de un voto entrante."""
    user_id: str
    entity_id: str
    entity_type: str  # PERSON, COMPANY, EVENT, POLL
    sliders: Dict[str, int]  # {"transparencia": 4, "gestion": 3, "coherencia": 5}
    user_rank: str = "BRONZE"
    user_comuna_id: Optional[int] = None
    entity_jurisdiction_id: Optional[int] = None
    dna_score: int = 100
    fill_duration: float = 10.0


@dataclass
class VoteResult:
    """Resultado de procesar un voto."""
    success: bool
    vote_id: str
    entity_id: str
    user_id: str
    raw_average: float
    is_counted: bool  # False = Shadow Mode
    is_local: bool
    territorial_bonus: float
    effective_weight: float
    was_updated: bool  # True si es un upsert (voto previo sobrescrito)
    shadow_reason: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class VoteEngine:
    """
    Motor de votos del Protocolo Beacon.

    Responsabilidades:
      1. Validar integridad del voto (DNA Scanner)
      2. Determinar si es voto local (bonus territorial quirúrgico)
      3. Calcular el promedio de sliders
      4. Upsert: sobrescribir voto previo del mismo usuario→entidad
      5. Registrar resultado con trazabilidad forense
    """

    def __init__(self):
        # Almacenamiento en memoria para MVP (en producción → Supabase)
        self._votes: Dict[str, Dict[str, Any]] = {}
        """
        Estructura: {
            "user_id:entity_id": {
                "user_id": str,
                "entity_id": str,
                "sliders": {...},
                "raw_average": float,
                "is_counted": bool,
                "is_local": bool,
                "territorial_bonus": float,
                "effective_weight": float,
                "timestamp": str,
            }
        }
        """

    def process_vote(self, payload: VotePayload) -> VoteResult:
        """
        Procesa un voto completo con todas las validaciones.

        Flujo:
          1. DNA Check → ¿es humano? (score >= 70)
          2. Territorial Check → ¿es voto local?
          3. Calcular promedio de sliders
          4. Determinar peso efectivo (rank × territorial bonus)
          5. Upsert en almacenamiento
          6. Devolver resultado con trazabilidad
        """
        vote_key = f"{payload.user_id}:{payload.entity_id}"
        was_updated = vote_key in self._votes

        # ─── 1. DNA Scanner Check ───
        is_counted = True
        shadow_reason = None

        if payload.dna_score < 70:
            is_counted = False
            shadow_reason = "DNA_SCORE_BELOW_THRESHOLD"
            logger.warning(
                f"[VoteEngine] Shadow Mode activado para {vote_key} "
                f"(DNA score: {payload.dna_score})"
            )

        # ─── 2. Verificación Territorial Quirúrgica ───
        is_local = False
        territorial_bonus = 1.0

        if self._qualifies_for_territorial_bonus(payload):
            from app.services.geo_logic import verify_territoriality
            result = verify_territoriality(
                user_comuna_id=payload.user_comuna_id,
                entity_jurisdiction_id=payload.entity_jurisdiction_id,
            )
            is_local = result.is_local
            territorial_bonus = result.bonus_applied

            if is_local:
                logger.info(
                    f"[VoteEngine] Bono territorial {territorial_bonus}x "
                    f"para {vote_key} (PERSON + jurisdicción + {payload.user_rank})"
                )

        # ─── 3. Calcular promedio de sliders ───
        raw_average = self._calculate_slider_average(payload.sliders)

        # ─── 4. Peso efectivo ───
        rank_weights = {
            "BRONZE": 1.0,
            "SILVER": 1.5,
            "GOLD": 2.5,
            "DIAMOND": 5.0,
        }
        base_weight = rank_weights.get(payload.user_rank, 1.0)
        effective_weight = base_weight * territorial_bonus

        # ─── 5. Upsert ───
        vote_data = {
            "user_id": payload.user_id,
            "entity_id": payload.entity_id,
            "entity_type": payload.entity_type,
            "sliders": payload.sliders,
            "raw_average": raw_average,
            "is_counted": is_counted,
            "is_local": is_local,
            "territorial_bonus": territorial_bonus,
            "effective_weight": effective_weight,
            "dna_score": payload.dna_score,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._votes[vote_key] = vote_data

        action = "ACTUALIZADO" if was_updated else "NUEVO"
        logger.info(
            f"[VoteEngine] Voto {action}: {vote_key} | "
            f"avg={raw_average:.2f} | counted={is_counted} | "
            f"local={is_local} | weight={effective_weight}"
        )

        # ─── 6. Resultado con trazabilidad ───
        return VoteResult(
            success=True,
            vote_id=vote_key,
            entity_id=payload.entity_id,
            user_id=payload.user_id,
            raw_average=raw_average,
            is_counted=is_counted,
            is_local=is_local,
            territorial_bonus=territorial_bonus,
            effective_weight=effective_weight,
            was_updated=was_updated,
            shadow_reason=shadow_reason,
        )

    def get_entity_votes(self, entity_id: str, counted_only: bool = True) -> List[Dict]:
        """
        Obtiene todos los votos de una entidad.
        Si counted_only=True, excluye votos en Shadow Mode.
        """
        votes = [
            v for v in self._votes.values()
            if v["entity_id"] == entity_id
            and (not counted_only or v["is_counted"])
        ]
        return votes

    def get_user_vote(self, user_id: str, entity_id: str) -> Optional[Dict]:
        """Obtiene el voto actual de un usuario para una entidad."""
        key = f"{user_id}:{entity_id}"
        return self._votes.get(key)

    def _qualifies_for_territorial_bonus(self, payload: VotePayload) -> bool:
        """
        Verifica las 3 condiciones para el bonus territorial quirúrgico:
          1. entity_type == PERSON (con jurisdicción)
          2. user.rank >= SILVER (RUT verificado)
          3. Ambos IDs de comuna presentes
        """
        # Condición 1: Solo entidades con jurisdicción
        if payload.entity_type not in JURISDICTIONAL_ENTITY_TYPES:
            return False

        # Condición 2: Solo usuarios SILVER+ (RUT verificado)
        if payload.user_rank not in TERRITORIAL_ELIGIBLE_RANKS:
            return False

        # Condición 3: Datos territoriales disponibles
        if payload.entity_jurisdiction_id is None:
            return False

        return True

    @staticmethod
    def _calculate_slider_average(sliders: Dict[str, int]) -> float:
        """
        Calcula el promedio de los sliders.
        Si está vacío, retorna 3.0 (neutro).
        """
        if not sliders:
            return 3.0
        values = list(sliders.values())
        return round(sum(values) / len(values), 2)


# ─── Instancia global del Motor de Votos ───
vote_engine = VoteEngine()
"""
Singleton del motor de votos.
Uso: from app.services.voting.vote_engine import vote_engine
"""
