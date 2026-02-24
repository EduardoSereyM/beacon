"""
BEACON PROTOCOL — Schemas User (Contratos de Intercambio)
==========================================================
Pydantic v2 para asegurar que ningún bit de basura entre al sistema.

Reglas de oro:
  - UserResponse NUNCA filtra hashed_password ni datos forenses internos.
  - UserVerifyRUT recibe el RUT en plano para hashear en el servidor.
  - UserCreate exige contraseña de mínimo 8 caracteres.

"Lo que no pasa por Pydantic, no existe."
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

from app.domain.enums import UserRank


# ─── Base (Campos compartidos) ───
class UserBase(BaseModel):
    """Campos comunes entre creación y respuesta."""
    email: EmailStr
    full_name: str


# ─── Registro de Ciudadano ───
class UserCreate(UserBase):
    """
    Schema de entrada para registrar un nuevo ciudadano.
    El password se hasheará con bcrypt antes de tocar la BBDD.
    """
    password: str = Field(..., min_length=8, description="Contraseña mínima de 8 caracteres")


# ─── Verificación de RUT ───
class UserVerifyRUT(BaseModel):
    """
    Schema para la validación de identidad.
    El RUT se recibe en plano para:
      1. Validar el dígito verificador (módulo 11)
      2. Hashear con SHA-256
      3. Descartar el texto plano inmediatamente
    """
    rut: str = Field(..., description="RUT chileno (ej: 12345678-9)")


# ─── Actualización de Perfil ───
class UserProfileUpdate(BaseModel):
    """
    Schema para actualizar datos demográficos.
    Estos campos alimentan la "Mina de Oro":
    segmentación de alta fidelidad para conglomerados.
    """
    commune: Optional[str] = Field(None, description="Comuna (ej: Providencia)")
    region: Optional[str] = Field(None, description="Región (ej: Metropolitana)")
    age_range: Optional[str] = Field(None, description="Rango etario (ej: 25-34)")


# ─── Respuesta Pública ───
class UserResponse(UserBase):
    """
    Schema de respuesta pública del ciudadano.
    NUNCA incluye: hashed_password, rut_hash, is_shadow_banned,
    ni datos forenses internos.
    Solo el estatus y el poder público.
    """
    id: str
    rank: UserRank
    integrity_score: float
    reputation_score: float = 0.0
    verification_level: int = 1
    is_verified: bool
    commune: Optional[str] = None
    region: Optional[str] = None
    age_range: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Respuesta de Login ───
class TokenResponse(BaseModel):
    """Respuesta del endpoint de login con JWT."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
