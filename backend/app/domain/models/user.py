"""
BEACON PROTOCOL — Modelo User (La Bóveda de Identidad)
=======================================================
Reflejo exacto de la tabla 'users' en Supabase.
Diseñado para soportar el análisis forense completo.

Campos clave:
  - rut_hash: SHA-256 para validación única sin guardar RUT real
  - rank: Nivel de poder (BRONZE a DIAMOND)
  - integrity_score: "Nota de vida" en Beacon (0.0 a 1.0)
  - is_shadow_banned: Purgatorio invisible para desplazados

"Privacidad Forense: sabemos que es un humano real y único,
 sin poseer el dato sensible. Blindaje legal total."
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from app.domain.enums import UserRank, VerificationLevel


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
    full_name: str                                  # Nombre público
    hashed_password: str                            # Bcrypt hash (NUNCA texto plano)

    # ─── Verificación Forense ───
    rut_hash: Optional[str] = None                  # SHA-256 del RUT (INVIOLABLE)
    verification_level: int = VerificationLevel.EMAIL  # 1=Email, 2=RUT, 3=Admin
    is_verified: bool = False                       # True cuando valida RUT

    # ─── Meritocracia (El Juego del Calamar) ───
    rank: str = UserRank.BRONZE                     # BRONZE → SILVER → GOLD → DIAMOND
    integrity_score: float = 0.5                    # 0.0 a 1.0 ("nota de vida")
    reputation_score: float = 0.0                   # Puntos por veredictos correctos

    # ─── Segmentación Demográfica (Mina de Oro) ───
    commune: Optional[str] = None                   # Ej: "Providencia"
    region: Optional[str] = None                    # Ej: "Metropolitana"
    age_range: Optional[str] = None                 # Ej: "25-34"

    # ─── Control del Búnker ───
    is_active: bool = True                          # Soft delete (nunca borrar datos)
    is_shadow_banned: bool = False                  # Purgatorio invisible

    # ─── Timestamps ───
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None           # Fecha del soft delete

    @classmethod
    def from_dict(cls, data: dict) -> "User":
        """
        Construye un User desde un diccionario de Supabase.
        Mapea la respuesta de la BBDD a nuestro modelo de dominio.
        """
        return cls(
            id=data.get("id", ""),
            email=data.get("email", ""),
            full_name=data.get("full_name", ""),
            hashed_password=data.get("hashed_password", ""),
            rut_hash=data.get("rut_hash"),
            verification_level=data.get("verification_level", VerificationLevel.EMAIL),
            is_verified=data.get("is_verified", False),
            rank=data.get("rank", UserRank.BRONZE),
            integrity_score=data.get("integrity_score", 0.5),
            reputation_score=data.get("reputation_score", 0.0),
            commune=data.get("commune"),
            region=data.get("region"),
            age_range=data.get("age_range"),
            is_active=data.get("is_active", True),
            is_shadow_banned=data.get("is_shadow_banned", False),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
            deleted_at=data.get("deleted_at"),
        )

    def to_dict(self) -> dict:
        """
        Serializa el modelo a diccionario para Supabase.
        Excluye campos None para no sobreescribir valores existentes.
        """
        result = {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "hashed_password": self.hashed_password,
            "rut_hash": self.rut_hash,
            "verification_level": self.verification_level,
            "is_verified": self.is_verified,
            "rank": self.rank,
            "integrity_score": self.integrity_score,
            "reputation_score": self.reputation_score,
            "commune": self.commune,
            "region": self.region,
            "age_range": self.age_range,
            "is_active": self.is_active,
            "is_shadow_banned": self.is_shadow_banned,
        }
        return {k: v for k, v in result.items() if v is not None}
