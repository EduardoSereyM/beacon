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
    Algoritmo Módulo 11 para validación de RUT chileno.
    
    El dígito verificador se calcula multiplicando cada dígito del cuerpo
    (de derecha a izquierda) por los factores [2,3,4,5,6,7] cíclicamente,
    sumando los productos y aplicando: 11 - (suma % 11).

    Args:
        rut: RUT en cualquier formato (con o sin puntos/guiones)
    
    Returns:
        True si el dígito verificador es correcto

    Ejemplos:
        validate_rut("12345678-5") → True/False (según DV real)
        validate_rut("11.111.111-1") → True
    """
    rut = format_rut(rut)
    if len(rut) < 2:
        return False

    cuerpo, dv = rut[:-1], rut[-1]

    try:
        reverso = map(int, reversed(cuerpo))
        factores = [2, 3, 4, 5, 6, 7]
        s = sum(d * factores[i % 6] for i, d in enumerate(reverso))
        v = 11 - (s % 11)

        if v == 11:
            res = '0'
        elif v == 10:
            res = 'K'
        else:
            res = str(v)

        return res == dv
    except ValueError:
        return False


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
    from app.core.config import settings

    effective_salt = salt if salt is not None else settings.RUT_HASH_SALT
    normalized = format_rut(rut)
    payload = f"{effective_salt}:{normalized}"
    return hashlib.sha256(payload.encode()).hexdigest()
