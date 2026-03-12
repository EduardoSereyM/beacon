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

from pydantic import BaseModel, EmailStr, Field, field_validator
import re
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
    Los campos demográficos son opcionales en el registro inicial
    y alimentan la 'Mina de Oro' desde el primer momento.

    Para ascender a VERIFIED se requieren 5 campos:
      rut_hash (via /verify-identity) + birth_year + country + region + commune
    """
    password: str = Field(..., min_length=8, description="Contraseña mínima de 8 caracteres")
    birth_year: Optional[int] = Field(None, ge=1920, le=2010, description="Año de nacimiento (ej: 1990)")
    country: Optional[str] = Field(None, description="País (ej: Chile)")
    region: Optional[str] = Field(None, description="Región (ej: Metropolitana)")
    commune: Optional[str] = Field(None, description="Comuna (ej: Providencia)")
    age_range: Optional[str] = Field(None, description="Rango etario (ej: 25-34)")

    @field_validator('password')
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        """
        Valida:
        - Al menos una mayúscula.
        - Al menos un número.
        - Al menos un carácter especial (@, #, $, %, &, *).
        """
        if not re.search(r'[A-Z]', v):
            raise ValueError('La contraseña debe contener al menos una mayúscula.')
        if not re.search(r'[0-9]', v):
            raise ValueError('La contraseña debe contener al menos un número.')
        if not re.search(r'[@#$%&*]', v):
            raise ValueError('La contraseña debe contener al menos un carácter especial (@, #, $, %, &, *).')
        return v


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

    Cuando birth_year + country + region + commune + rut_hash están todos presentes,
    el backend evalúa automáticamente el ascenso a VERIFIED.
    """
    birth_year: Optional[int] = Field(None, ge=1920, le=2010, description="Año de nacimiento (ej: 1990)")
    country: Optional[str] = Field(None, description="País (ej: Chile)")
    region: Optional[str] = Field(None, description="Región (ej: Metropolitana)")
    commune: Optional[str] = Field(None, description="Comuna (ej: Providencia)")
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
    country: Optional[str] = None
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
