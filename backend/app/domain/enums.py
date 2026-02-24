"""
BEACON PROTOCOL — Enumeraciones del Sistema (Código de Honor)
==============================================================
Las leyes inmutables de jerarquía y seguridad.
Definen el estatus y el poder de cada individuo
en el Juego del Calamar de la Integridad.

"Un archivo, una responsabilidad."
"""

from enum import Enum


# ─── Rangos de Usuario (Meritocracia Digital) ───
class UserRank(str, Enum):
    """
    Escalafón del Ciudadano Beacon.
    A mayor rango, mayor Poder de Voto (V_p).

    BRONZE  = 1.0x  | Solo email verificado
    SILVER  = 1.5x  | RUT Validado + 3 votos
    GOLD    = 2.5x  | Perfil Completo + 30 días
    DIAMOND = 5.0x  | Verificación presencial (Auditor de la Verdad)
    """
    BRONZE = "BRONZE"
    SILVER = "SILVER"
    GOLD = "GOLD"
    DIAMOND = "DIAMOND"


# ─── Nivel de Verificación de Identidad ───
class VerificationLevel(int, Enum):
    """
    Niveles de certeza de identidad.
    Peso del voto: EMAIL=1x, RUT=3x, ADMIN=5x.
    """
    EMAIL = 1      # Solo email verificado
    RUT = 2        # RUT hash validado (Ciudadano confirmado)
    ADMIN = 3      # Verificación manual por administrador


# ─── Nivel de Seguridad del Sistema ───
class SecurityLevel(str, Enum):
    """
    Estados del panic_gate.py.
    El Overlord controla esto desde el Dashboard.
    """
    GREEN = "GREEN"    # Filtros estándar. Captcha al 1%.
    YELLOW = "YELLOW"  # Captcha al 20%. Bloqueo IPs Data Centers.
    RED = "RED"        # Captcha obligatorio para TODOS. Modo Pánico.


# ─── Tipos de Entidad ───
class EntityType(str, Enum):
    """
    Discriminador maestro de la tabla 'entities'.
    Una base, cuatro pilares.
    """
    PERSON = "PERSON"      # Políticos, figuras públicas → Sliders 1-5
    COMPANY = "COMPANY"    # Empresas → Evaluadas por servicio/ética
    EVENT = "EVENT"        # Festivales, candidaturas → Votos temporales
    POLL = "POLL"          # Encuestas V2.0 → Preparado para el futuro


# ─── Tags de Servicio (Multi-servicio para empresas) ───
class ServiceTag(str, Enum):
    """
    Permite evaluar una empresa por líneas de servicio distintas.
    Ej: Banco Estado → BANCO, RETAIL, ATENCION_CLIENTE
    """
    BANCO = "BANCO"
    RETAIL = "RETAIL"
    SALUD = "SALUD"
    EDUCACION = "EDUCACION"
    TRANSPORTE = "TRANSPORTE"
    TELECOMUNICACIONES = "TELECOMUNICACIONES"
    ATENCION_CLIENTE = "ATENCION_CLIENTE"
    GOBIERNO = "GOBIERNO"
    ENERGIA = "ENERGIA"
    OTRO = "OTRO"


# ─── Clasificación del DNA Scanner ───
class DNAClassification(str, Enum):
    """Resultado del análisis forense del dna_scanner.py."""
    HUMAN = "HUMAN"
    SUSPICIOUS = "SUSPICIOUS"
    DISPLACED = "DISPLACED"


# ─── Estado de un Voto ───
class VoteStatus(str, Enum):
    """Ciclo de vida de un voto en el sistema."""
    ACTIVE = "ACTIVE"
    UNDER_REVIEW = "UNDER_REVIEW"
    SHADOW_BANNED = "SHADOW_BANNED"
    ARCHIVED = "ARCHIVED"


# ─── Acciones de Auditoría ───
class AuditAction(str, Enum):
    """Acciones registradas en el master_forensic_log."""
    USER_REGISTERED = "USER_REGISTERED"
    USER_VERIFIED_RUT = "USER_VERIFIED_RUT"
    USER_RANK_CHANGED = "USER_RANK_CHANGED"
    VOTE_CAST = "VOTE_CAST"
    VOTE_SHADOW_BANNED = "VOTE_SHADOW_BANNED"
    BRIGADE_DETECTED = "BRIGADE_DETECTED"
    SECURITY_LEVEL_CHANGED = "SECURITY_LEVEL_CHANGED"
    CONFIG_UPDATED = "CONFIG_UPDATED"
    ADMIN_MANUAL_ACTION = "ADMIN_MANUAL_ACTION"
