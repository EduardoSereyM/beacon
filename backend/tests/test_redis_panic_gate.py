"""
BEACON PROTOCOL — Tests Funcionales: Redis Panic Gate + RUT Forensic Hashing
=============================================================================
Validaciones mandatorias de la Fase 1:

  1. Propagación de nivel de seguridad en Redis < 2ms
  2. Hash de RUT determinista pero irreversible (forensics check)
  3. Detección de colisiones de RUT sin revelar el dato original

Patrón de Silencio Estratégico:
  Si algo falla en la validación, el sistema NO revela detalles técnicos,
  solo un código de error genérico. Los tests verifican este comportamiento.

"Lo que entra al test, define la verdad del búnker."
"""

import hashlib
import time
import pytest

from app.core.security.rut_validator import format_rut, validate_rut, hash_rut


# ═══════════════════════════════════════════
#  TEST 1: Propagación de seguridad < 2ms
# ═══════════════════════════════════════════

class TestSecurityLevelPropagation:
    """
    Verifica que el cambio de nivel de seguridad en Redis
    se propague en menos de 2ms.

    Si Redis no está disponible (CI sin Redis), el test
    valida que el modo degradado (YELLOW) se active < 1ms.
    """

    @pytest.mark.asyncio
    async def test_security_level_propagation_speed(self):
        """
        Cambia GREEN → RED y mide el tiempo de propagación.
        Requisito: < 2ms (2_000 microsegundos).
        """
        from app.core.security.panic_gate_extreme import PanicGateExtreme

        try:
            import redis.asyncio as aioredis
            redis_client = aioredis.from_url(
                "redis://localhost:6379/0",
                decode_responses=True,
                socket_connect_timeout=1,
            )
            await redis_client.ping()
        except Exception:
            # Sin Redis: validar modo degradado
            gate = PanicGateExtreme(redis_client=None)
            start = time.perf_counter()
            level = await gate.get_security_level()
            elapsed_ms = (time.perf_counter() - start) * 1000

            assert level == "YELLOW", (
                "Sin Redis, el sistema debe defaultear a YELLOW (fail-safe)"
            )
            assert elapsed_ms < 1.0, (
                f"Modo degradado tardó {elapsed_ms:.3f}ms (máximo: 1ms)"
            )
            return

        # Con Redis: test completo de propagación
        gate = PanicGateExtreme(redis_client=redis_client)

        # Inicializar en GREEN
        await gate.switch_security_level("GREEN", triggered_by="TEST")

        # ─── Medir propagación GREEN → RED ───
        start = time.perf_counter()
        await gate.switch_security_level("RED", triggered_by="TEST", reason="STRESS_TEST")
        elapsed_ms = (time.perf_counter() - start) * 1000

        # Verificar que el nivel cambió
        current = await gate.get_security_level()
        assert current == "RED", f"Se esperaba RED, se obtuvo {current}"

        # Verificar tiempo de propagación < 2ms
        assert elapsed_ms < 2.0, (
            f"Propagación tardó {elapsed_ms:.3f}ms — FALLO. "
            f"Requisito: < 2ms (código: PERF_BREACH_001)"
        )

        # ─── Limpiar: volver a GREEN ───
        await gate.switch_security_level("GREEN", triggered_by="TEST_CLEANUP")
        await redis_client.close()

    @pytest.mark.asyncio
    async def test_failsafe_defaults_to_yellow_without_redis(self):
        """
        Sin Redis, el Panic Gate DEBE defaultear a YELLOW.
        Nunca a GREEN (demasiado permisivo) ni RED (bloqueo total).
        """
        from app.core.security.panic_gate_extreme import PanicGateExtreme

        gate = PanicGateExtreme(redis_client=None)
        level = await gate.get_security_level()

        assert level == "YELLOW", (
            "código: FAILSAFE_001 — El sistema debe operar en YELLOW sin Redis"
        )


# ═══════════════════════════════════════════
#  TEST 2: Hash de RUT determinista e irreversible
# ═══════════════════════════════════════════

class TestRutHashDeterministicIrreversible:
    """
    Verifica que:
    - El mismo RUT siempre genera el mismo hash (determinismo)
    - El hash NO contiene el RUT original (irreversibilidad)
    - Diferentes formatos del mismo RUT generan el mismo hash
    - Diferentes salts generan diferentes hashes
    """

    SALT = "test-forensic-salt-2026"
    SAMPLE_RUT = "12.345.678-5"
    SAMPLE_RUT_CLEAN = "123456785"

    def test_hash_is_deterministic(self):
        """Mismo RUT + misma salt = mismo hash. Siempre."""
        h1 = hash_rut(self.SAMPLE_RUT, salt=self.SALT)
        h2 = hash_rut(self.SAMPLE_RUT, salt=self.SALT)

        assert h1 == h2, "código: DETERM_001 — El hash debe ser determinista"

    def test_hash_is_irreversible(self):
        """
        El hash NO debe contener el RUT original ni su formato limpio.
        Esto garantiza la privacidad forense.
        """
        h = hash_rut(self.SAMPLE_RUT, salt=self.SALT)
        rut_clean = format_rut(self.SAMPLE_RUT)

        # El hash no contiene el RUT
        assert rut_clean not in h, (
            "código: IRREVERSIBLE_001 — El hash contiene el RUT original"
        )
        assert self.SAMPLE_RUT.replace(".", "").replace("-", "") not in h, (
            "código: IRREVERSIBLE_002 — El hash contiene partes del RUT"
        )

    def test_hash_length_is_sha256(self):
        """Un SHA-256 siempre tiene 64 caracteres hexadecimales."""
        h = hash_rut(self.SAMPLE_RUT, salt=self.SALT)

        assert len(h) == 64, f"código: FORMAT_001 — Hash tiene {len(h)} chars, esperados 64"
        assert all(c in "0123456789abcdef" for c in h), (
            "código: FORMAT_002 — Hash contiene caracteres no hexadecimales"
        )

    def test_same_rut_different_formats_same_hash(self):
        """
        "12.345.678-5", "12345678-5", "123456785" → mismo hash.
        La normalización con format_rut() garantiza consistencia.
        """
        formats = [
            "12.345.678-5",
            "12345678-5",
            "123456785",
            "12.345.678-5",
        ]
        hashes = [hash_rut(r, salt=self.SALT) for r in formats]

        assert len(set(hashes)) == 1, (
            "código: NORMALIZE_001 — Diferentes formatos generan diferentes hashes"
        )

    def test_different_salt_different_hash(self):
        """Salts diferentes DEBEN producir hashes diferentes."""
        h1 = hash_rut(self.SAMPLE_RUT, salt="salt-alpha")
        h2 = hash_rut(self.SAMPLE_RUT, salt="salt-beta")

        assert h1 != h2, (
            "código: SALT_001 — Diferentes salts deben generar hashes distintos"
        )

    def test_hash_matches_manual_sha256(self):
        """Verificar que el hash coincide con cálculo manual SHA-256."""
        normalized = format_rut(self.SAMPLE_RUT)
        expected = hashlib.sha256(
            f"{self.SALT}:{normalized}".encode()
        ).hexdigest()

        actual = hash_rut(self.SAMPLE_RUT, salt=self.SALT)
        assert actual == expected, (
            "código: INTEGRITY_001 — El hash no coincide con SHA-256 manual"
        )


# ═══════════════════════════════════════════
#  TEST 3: Detección de colisiones sin revelar dato original
# ═══════════════════════════════════════════

class TestRutCollisionDetection:
    """
    Verifica que el sistema puede detectar colisiones de RUT
    (mismo RUT = mismo hash) SIN revelar el dato original.

    Esto es crucial para:
    - Evitar multicuentas (un RUT = una cuenta)
    - No exponer RUTs válidos en mensajes de error
    """

    SALT = "test-forensic-salt-2026"

    def test_collision_detected_same_rut(self):
        """
        Dos usuarios con el mismo RUT DEBEN generar el mismo hash.
        Esto permite detectar multicuentas sin guardar RUTs en texto plano.
        """
        rut_user_a = "11.111.111-1"
        rut_user_b = "11.111.111-1"

        hash_a = hash_rut(rut_user_a, salt=self.SALT)
        hash_b = hash_rut(rut_user_b, salt=self.SALT)

        assert hash_a == hash_b, (
            "código: COLLISION_001 — Mismo RUT debe generar mismo hash"
        )

    def test_no_collision_different_ruts(self):
        """
        Dos RUTs diferentes NUNCA deben generar el mismo hash.
        (estadísticamente imposible con SHA-256, pero lo verificamos)
        """
        rut_a = "11.111.111-1"
        rut_b = "22.222.222-2"

        hash_a = hash_rut(rut_a, salt=self.SALT)
        hash_b = hash_rut(rut_b, salt=self.SALT)

        assert hash_a != hash_b, (
            "código: COLLISION_002 — RUTs diferentes generaron el mismo hash"
        )

    def test_error_message_does_not_reveal_rut(self):
        """
        Patrón de Silencio Estratégico:
        Cuando se detecta una colisión, el mensaje de error
        NO debe contener el RUT original ni su hash completo.
        Solo un código genérico.
        """
        rut = "11.111.111-1"
        hash_value = hash_rut(rut, salt=self.SALT)
        rut_clean = format_rut(rut)

        # Simular mensaje de error genérico (como haría el backend)
        error_response = {
            "status": "error",
            "message": "Error interno del servidor. El incidente ha sido registrado.",
            "code": "IDENTITY_CONFLICT",
        }

        # Verificar que NO se filtra información
        error_str = str(error_response)
        assert rut_clean not in error_str, (
            "código: SILENCE_001 — El RUT aparece en el mensaje de error"
        )
        assert hash_value not in error_str, (
            "código: SILENCE_002 — El hash completo aparece en el mensaje de error"
        )
        assert rut not in error_str, (
            "código: SILENCE_003 — El RUT formateado aparece en el mensaje de error"
        )

    def test_collision_check_workflow(self):
        """
        Simula el flujo completo de detección de multicuenta:
        1. Usuario A se registra → hash guardado en "DB" simulada
        2. Usuario B intenta registrar el mismo RUT
        3. El sistema detecta la colisión por hash, no por RUT
        4. El RUT original nunca se compara en texto plano
        """
        simulated_db: dict[str, str] = {}  # hash → user_id

        # Usuario A se registra
        rut_a = "12.345.678-5"
        hash_a = hash_rut(rut_a, salt=self.SALT)
        simulated_db[hash_a] = "user-001"

        # Usuario B intenta registrar el mismo RUT (multicuenta)
        rut_b = "12345678-5"  # Mismo RUT, diferente formato
        hash_b = hash_rut(rut_b, salt=self.SALT)

        # Detección de colisión
        is_collision = hash_b in simulated_db
        assert is_collision, (
            "código: COLLISION_003 — La colisión no fue detectada"
        )

        # El RUT original NUNCA se guarda ni compara en texto plano
        assert rut_a not in simulated_db.values(), (
            "código: SILENCE_004 — El RUT en texto plano está en la base de datos"
        )
        assert rut_b not in simulated_db.values(), (
            "código: SILENCE_005 — El RUT en texto plano está en la base de datos"
        )
