"""
BEACON PROTOCOL — SuperEntity Model (El Ecosistema Multiclase)
===============================================================
Permite que Beacon sea un ecosistema multiclase donde
Personas, Empresas, Eventos y Encuestas conviven bajo
una misma lógica de búsqueda pero con comportamientos distintos.

Tipos de entidad:
  - PERSON  → Políticos, figuras públicas (Sliders 1-5)
  - COMPANY → Empresas con service_tags (evaluación multidimensional)
  - EVENT   → Festivales, candidaturas (votos temporales)
  - POLL    → Encuestas V2.0 (preparado para el futuro)

"Una base, cuatro pilares."
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Any

from app.domain.enums import EntityType


@dataclass
class SuperEntity:
    """
    Modelo de dominio de Entidad Beacon.
    Mapea directamente a la tabla 'entities' en Supabase/PostgreSQL.

    El campo service_tags permite evaluación multidimensional
    de empresas tipo holding (ej: Banco Estado → BANCO, RETAIL).
    """

    # ─── Identidad Core ───
    id: str                                     # UUID de la entidad
    type: str                                   # PERSON, COMPANY, EVENT, POLL
    name: str                                   # Nombre público indexado

    # ─── Multi-servicio para Empresas (Holding) ───
    service_tags: List[str] = field(default_factory=list)
    # Ej: ['BANCO', 'RETAIL', 'ATENCION_CLIENTE']

    # ─── Metadata Flexible ───
    metadata: Dict[str, Any] = field(default_factory=dict)
    # Para cargos políticos: {"partido": "X", "cargo": "Senador"}
    # Para empresas: {"rubro": "Telecomunicaciones", "rut_empresa": "..."}

    # ─── Métricas de Integridad ───
    reputation_score: float = 3.0               # Nota base (Shrinkage bayesiano)
    total_reviews: int = 0                      # Cantidad de reseñas/votos
    is_verified: bool = False                   # Verificado por el Overlord

    # ─── Localización ───
    commune: Optional[str] = None               # Comuna de la entidad
    region: Optional[str] = None                # Región

    # ─── Para Eventos/Festivales ───
    start_date: Optional[str] = None            # Inicio del evento (ISO format)
    end_date: Optional[str] = None              # Fin del evento
    is_active: bool = True                      # Evento abierto/cerrado

    # ─── Timestamps ───
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_dict(cls, data: dict) -> "SuperEntity":
        """Construye una SuperEntity desde un diccionario de Supabase."""
        return cls(
            id=data.get("id", ""),
            type=data.get("type", EntityType.PERSON),
            name=data.get("name", ""),
            service_tags=data.get("service_tags", []),
            metadata=data.get("metadata", {}),
            reputation_score=data.get("reputation_score", 3.0),
            total_reviews=data.get("total_reviews", 0),
            is_verified=data.get("is_verified", False),
            commune=data.get("commune"),
            region=data.get("region"),
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
            is_active=data.get("is_active", True),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
        )

    def to_dict(self) -> dict:
        """Serializa a diccionario para Supabase."""
        result = {
            "id": self.id,
            "type": self.type,
            "name": self.name,
            "service_tags": self.service_tags,
            "metadata": self.metadata,
            "reputation_score": self.reputation_score,
            "total_reviews": self.total_reviews,
            "is_verified": self.is_verified,
            "commune": self.commune,
            "region": self.region,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "is_active": self.is_active,
        }
        return {k: v for k, v in result.items() if v is not None}

    def is_event(self) -> bool:
        """Verifica si la entidad es un evento temporal."""
        return self.type == EntityType.EVENT

    def is_company(self) -> bool:
        """Verifica si la entidad es una empresa multiservicios."""
        return self.type == EntityType.COMPANY
