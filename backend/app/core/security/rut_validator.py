"""
BEACON PROTOCOL — Validador de RUT (El Filtro de Certeza Legal)
================================================================
Implementa el algoritmo de Módulo 11, el estándar de oro en Chile.
Asegura que nadie use identidades falsas en el sistema.

Funciones:
  - format_rut(): Limpia puntos y guiones
  - validate_rut(): Módulo 11 para verificar dígito verificador
  - hash_rut(): SHA-256 para almacenamiento inmutable y privado

"El RUT nunca se almacena en texto plano.
 Solo el hash SHA-256 toca la base de datos."
"""

import hashlib
import re


def format_rut(rut: str) -> str:
    """
    Limpia puntos y guiones, dejando solo números y K.
    
    Ejemplos:
        "12.345.678-9" → "123456789"
        "12345678-K"   → "12345678K"
        "12.345.678-k" → "12345678K"
    """
    return re.sub(r'[^0-9kK]', '', rut).upper()


def validate_rut(rut: str) -> bool:
    """
    Algoritmo Módulo 11 para validación de RUT chileno — estándar SII.

    El dígito verificador se calcula multiplicando cada dígito del cuerpo
    (de derecha a izquierda) por los factores [2,3,4,5,6,7] ciclando,
    sumando los productos y aplicando: 11 - (suma % 11).

    Guards aplicados (alineados con ENGINEERING_STANDARDSv2 §26):
      - Cuerpo mínimo de 7 dígitos (RUT real más bajo: ~1.000.000-x)
      - DV debe ser dígito o 'K' — caracteres inválidos rechazan sin strip silencioso
      - Cuerpo debe ser todo numérico

    Args:
        rut: RUT en cualquier formato (con o sin puntos/guiones)

    Returns:
        True si el dígito verificador es correcto

    Ejemplos:
        validate_rut("76354771-K") → True
        validate_rut("12345678-5") → True
        validate_rut("11.111.111-1") → True
        validate_rut("76354771-A") → False  (DV inválido — rechazado explícitamente)
        validate_rut("1-9")        → False  (cuerpo demasiado corto)
    """
    # Separar cuerpo y DV ANTES de strip, para detectar DV inválidos
    rut_stripped = rut.upper().replace(".", "").replace("-", "").strip()
    if len(rut_stripped) < 2:
        return False

    cuerpo_raw = rut_stripped[:-1]
    dv = rut_stripped[-1]

    if not cuerpo_raw.isdigit():          # cuerpo debe ser todo numérico
        return False
    if len(cuerpo_raw) < 7:              # RUT mínimo real: 7 dígitos en el cuerpo
        return False
    if dv not in "0123456789K":          # DV solo puede ser dígito o K — sin strip silencioso
        return False

    factores = [2, 3, 4, 5, 6, 7]
    s = sum(int(d) * factores[i % 6] for i, d in enumerate(reversed(cuerpo_raw)))
    v = 11 - (s % 11)

    if v == 11:
        res = '0'
    elif v == 10:
        res = 'K'
    else:
        res = str(v)

    return res == dv


def hash_rut(rut: str, salt: str | None = None) -> str:
    """
    Genera un hash SHA-256 con salt para almacenamiento inmutable y privado.
    El RUT se normaliza antes de hashear para garantizar consistencia.

    Formato del hash: SHA-256(salt:RUT_NORMALIZADO)
      → La salt proviene de settings.RUT_HASH_SALT
      → El RUT se normaliza con format_rut() (sin puntos, uppercase)
      → Esto evita colisiones falsas por diferencia de formato

    Args:
        rut: RUT en cualquier formato (ej: "12.345.678-9")
        salt: Salt explícita para tests. Si es None, usa settings.

    Returns:
        Hash SHA-256 hexadecimal de 64 caracteres

    Nota:
        El texto plano del RUT se descarta inmediatamente después del hash.
        Esto nos permite decir: "Sabemos que es un humano real y único"
        sin poseer el dato sensible. Blindaje legal total.
    """
    # Import lazy y condicional: solo se carga settings cuando no hay salt
    # explícita. Esto permite usar hash_rut() en tests unitarios sin .env.
    if salt is None:
        from app.core.config import settings
        salt = settings.RUT_HASH_SALT

    normalized = format_rut(rut)
    payload = f"{salt}:{normalized}"
    return hashlib.sha256(payload.encode()).hexdigest()
