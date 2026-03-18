"""
BEACON PROTOCOL — Modelo User (La Bóveda de Identidad)
=======================================================
Reflejo exacto de la tabla 'users' en Supabase.

Campos clave:
  - rut_hash: SHA-256 para validación única sin guardar RUT real
  - rank: BASIC (0.5x) | VERIFIED (1.0x)
  - integrity_score: "Nota de vida" en Beacon (0.0 a 1.0)
  - is_shadow_banned: Purgatorio invisible para desplazados

"Privacidad Forense: sabemos que es un humano real y único,
 sin poseer el dato sensible. Blindaje legal total."
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from app.domain.enums import UserRank


@dataclass
class User:
    """
    Modelo de dominio del Ciudadano Beacon.
    Mapea directamente a la tabla 'users' en Supabase/PostgreSQL.

    Este modelo NO es un ORM; es una representación lógica
    que se transforma a/desde los diccionarios de Supabase.
    """

    # ─── Identidad Core ───
    id: str                                         # UUID del ciudadano
    email: str                                      # Email verificado
    first_name: str = ""                            # Nombre
    last_name: str = ""                             # Apellido

    # ─── Verificación Forense ───
    rut_hash: Optional[str] = None                  # SHA-256 del RUT (INVIOLABLE)
    is_rut_verified: bool = False                   # True cuando valida RUT

    # ─── Meritocracia ───
    rank: str = UserRank.BASIC                      # BASIC (0.5x) → VERIFIED (1.0x)
    integrity_score: float = 0.5                    # 0.0 a 1.0 ("nota de vida")
    reputation_score: float = 0.0                   # Puntos por veredictos correctos
    role: str = "user"                              # user | moderator | admin

    # ─── Segmentación Demográfica (Mina de Oro) ───
    commune: Optional[str] = None                   # Ej: "Providencia"
    region: Optional[str] = None                    # Ej: "Metropolitana"
    country: Optional[str] = None                   # Ej: "Chile"
    age_range: Optional[str] = None                 # Ej: "25-34"
    gender: Optional[str] = None                    # Ej: "Femenino"
    birth_year: Optional[int] = None

    # ─── Control del Búnker ───
    is_active: bool = True                          # Soft delete (nunca borrar datos)
    is_shadow_banned: bool = False                  # Purgatorio invisible

    # ─── Timestamps ───
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_dict(cls, data: dict) -> "User":
        """
        Construye un User desde un diccionario de Supabase.
        Mapea la respuesta de la BBDD a nuestro modelo de dominio.
        """
        return cls(
            id=data.get("id", ""),
            email=data.get("email", ""),
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
            rut_hash=data.get("rut_hash"),
            is_rut_verified=data.get("is_rut_verified", False),
            rank=data.get("rank", UserRank.BASIC),
            integrity_score=data.get("integrity_score", 0.5),
            reputation_score=data.get("reputation_score", 0.0),
            role=data.get("role", "user"),
            commune=data.get("commune"),
            region=data.get("region"),
            country=data.get("country"),
            age_range=data.get("age_range"),
            gender=data.get("gender"),
            birth_year=data.get("birth_year"),
            is_active=data.get("is_active", True),
            is_shadow_banned=data.get("is_shadow_banned", False),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
        )

    def to_dict(self) -> dict:
        """
        Serializa el modelo a diccionario para Supabase.
        Excluye campos None para no sobreescribir valores existentes.
        """
        result = {
            "id": self.id,
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "rut_hash": self.rut_hash,
            "is_rut_verified": self.is_rut_verified,
            "rank": self.rank,
            "integrity_score": self.integrity_score,
            "reputation_score": self.reputation_score,
            "role": self.role,
            "commune": self.commune,
            "region": self.region,
            "country": self.country,
            "age_range": self.age_range,
            "gender": self.gender,
            "birth_year": self.birth_year,
            "is_active": self.is_active,
            "is_shadow_banned": self.is_shadow_banned,
        }
        return {k: v for k, v in result.items() if v is not None}
