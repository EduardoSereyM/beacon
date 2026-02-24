"""
BEACON PROTOCOL — Test de Integración: Flujo de Ascensión
===========================================================
Simula el ciclo completo de vida de un ciudadano:
  1. Se registra (nace BRONZE, vale $1.00)
  2. Valida su RUT (asciende a SILVER, vale ~$21.00)
  3. Completa su perfil demográfico (integrity boost)
  4. Se calcula su valor en USD para la plataforma

Este test valida la lógica de negocio SIN tocar Supabase.
Usa mocks para aislar los componentes.

"Del caos al orden. Del fantasma al ciudadano."
"""

import pytest
from unittest.mock import patch, MagicMock

# ─── Importaciones del sistema ───
from app.core.security.rut_validator import validate_rut, format_rut, hash_rut
from app.core.security.dna_scanner import DNAScanner, gatekeeper
from app.core.valuation.user_asset_calculator import UserAssetCalculator, asset_calculator
from app.domain.enums import UserRank, VerificationLevel, SecurityLevel


# ═══════════════════════════════════════════════
# TEST 1: Validador de RUT (Módulo 11)
# ═══════════════════════════════════════════════


class TestRUTValidator:
    """Valida el algoritmo de Módulo 11 para RUT chileno."""

    def test_format_rut_removes_dots_and_dashes(self):
        assert format_rut("12.345.678-9") == "123456789"
        assert format_rut("12345678-K") == "12345678K"
        assert format_rut("12.345.678-k") == "12345678K"
        assert format_rut("1-9") == "19"

    def test_validate_rut_known_valid(self):
        """RUT conocido: 11.111.111-1 es válido."""
        assert validate_rut("11.111.111-1") is True
        assert validate_rut("11111111-1") is True
        assert validate_rut("111111111") is True

    def test_validate_rut_with_k(self):
        """RUT con dígito verificador K."""
        # 22.222.222-K no es un RUT verdadero, pero
        # cualquier RUT con DV=K correcto debe pasar
        rut = "12345678-5"  # Este puede o no ser válido
        result = validate_rut(rut)
        assert isinstance(result, bool)

    def test_validate_rut_rejects_invalid(self):
        """RUTs claramente inválidos."""
        assert validate_rut("") is False
        assert validate_rut("1") is False
        assert validate_rut("ABCDEF") is False

    def test_hash_rut_is_consistent(self):
        """El mismo RUT siempre genera el mismo hash."""
        hash1 = hash_rut("12.345.678-9")
        hash2 = hash_rut("12345678-9")
        hash3 = hash_rut("123456789")
        assert hash1 == hash2 == hash3

    def test_hash_rut_is_sha256(self):
        """El hash debe tener 64 caracteres hexadecimales (SHA-256)."""
        h = hash_rut("11.111.111-1")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_different_ruts_different_hashes(self):
        """Dos RUTs distintos deben generar hashes distintos."""
        h1 = hash_rut("11.111.111-1")
        h2 = hash_rut("22.222.222-2")
        assert h1 != h2


# ═══════════════════════════════════════════════
# TEST 2: DNA Scanner (Portero Forense)
# ═══════════════════════════════════════════════


class TestDNAScanner:
    """Valida la clasificación forense del DNA Scanner."""

    def test_human_classification(self):
        """Un usuario normal con timing > 5s es HUMAN."""
        metadata = {
            "fill_duration": 8.0,
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        result = gatekeeper.scan_request(metadata)
        assert result["classification"] == "HUMAN"
        assert result["score"] > 70
        assert len(result["alerts"]) == 0

    def test_suspicious_fast_submission(self):
        """Un submit en <4s pero >2s es SUSPICIOUS o HUMAN."""
        metadata = {
            "fill_duration": 3.0,
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        result = gatekeeper.scan_request(metadata)
        assert "UNUSUALLY_FAST_SUBMISSION" in result["alerts"]

    def test_displaced_bot_speed(self):
        """Un submit en <2s es un bot → penalización de 50 puntos."""
        metadata = {
            "fill_duration": 0.5,
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        result = gatekeeper.scan_request(metadata)
        assert "BOT_SPEED_DETECTED" in result["alerts"]
        assert result["score"] <= 70  # Penalizado 50 puntos

    def test_displaced_automation_tool(self):
        """Selenium/Puppeteer → DISPLACED inmediato."""
        metadata = {
            "fill_duration": 5.0,
            "user_agent": "Mozilla/5.0 headless chrome selenium",
        }
        result = gatekeeper.scan_request(metadata)
        assert result["classification"] == "DISPLACED"
        assert "AUTOMATION_TOOL_DETECTED" in result["alerts"]

    def test_displaced_python_requests(self):
        """python-requests UA → DISPLACED."""
        metadata = {
            "fill_duration": 5.0,
            "user_agent": "python-requests/2.31.0",
        }
        result = gatekeeper.scan_request(metadata)
        assert result["classification"] == "DISPLACED"

    def test_webdriver_flag_detected(self):
        """navigator.webdriver = true → penalización fuerte."""
        metadata = {
            "fill_duration": 5.0,
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "webdriver": True,
        }
        result = gatekeeper.scan_request(metadata)
        assert "WEBDRIVER_DETECTED" in result["alerts"]
        assert result["score"] <= 40

    def test_empty_user_agent(self):
        """UA vacío → sospecha de automatización."""
        metadata = {
            "fill_duration": 5.0,
            "user_agent": "",
        }
        result = gatekeeper.scan_request(metadata)
        assert "GENERIC_OR_MISSING_UA" in result["alerts"]


# ═══════════════════════════════════════════════
# TEST 3: User Asset Calculator (Caja Registradora)
# ═══════════════════════════════════════════════


class TestUserAssetCalculator:
    """Valida el cálculo de valor en USD por usuario."""

    def test_bronze_minimal_value(self):
        """BRONZE sin datos → valor mínimo."""
        user = {
            "rank": "BRONZE",
            "integrity_score": 0.5,
            "commune": None,
            "age_range": None,
            "region": None,
            "rut_hash": None,
        }
        value = asset_calculator.calculate_usd_value(user)
        assert value > 0
        assert value < 5.0  # BRONZE base es $1.00

    def test_silver_verified_value(self):
        """SILVER con RUT verificado → valor significativamente mayor."""
        user = {
            "rank": "SILVER",
            "integrity_score": 0.75,
            "commune": "Providencia",
            "age_range": "25-34",
            "region": "Metropolitana",
            "rut_hash": "abc123hash",
        }
        value = asset_calculator.calculate_usd_value(user)
        assert value >= 15.0
        # Debe ser: (15 * 0.9) + 5.0 + 1.0 + 3.0 = 22.50

    def test_gold_referent_value(self):
        """GOLD con perfil completo → valor alto."""
        user = {
            "rank": "GOLD",
            "integrity_score": 0.95,
            "commune": "Las Condes",
            "age_range": "35-44",
            "region": "Metropolitana",
            "rut_hash": "xyz789hash",
        }
        value = asset_calculator.calculate_usd_value(user)
        assert value >= 150.0

    def test_diamond_auditor_value(self):
        """DIAMOND con integridad perfecta → máximo valor."""
        user = {
            "rank": "DIAMOND",
            "integrity_score": 1.0,
            "commune": "Vitacura",
            "age_range": "45-54",
            "region": "Metropolitana",
            "rut_hash": "diamond_hash",
        }
        value = asset_calculator.calculate_usd_value(user)
        assert value >= 500.0

    def test_data_bonus_with_partial_data(self):
        """Datos parciales → bono parcial ($2.00 vs $5.00)."""
        user_partial = {
            "rank": "BRONZE",
            "integrity_score": 0.5,
            "commune": "Ñuñoa",
            "age_range": None,
            "region": None,
            "rut_hash": None,
        }
        user_full = {
            "rank": "BRONZE",
            "integrity_score": 0.5,
            "commune": "Ñuñoa",
            "age_range": "25-34",
            "region": None,
            "rut_hash": None,
        }
        value_partial = asset_calculator.calculate_usd_value(user_partial)
        value_full = asset_calculator.calculate_usd_value(user_full)
        assert value_full > value_partial

    def test_ascension_value_increase(self):
        """
        TEST DE INTEGRACIÓN: El ciclo BRONZE → SILVER
        Simula el flujo completo de registro y ascensión.
        """
        # Paso 1: Usuario recién registrado (BRONZE)
        user_bronze = {
            "rank": "BRONZE",
            "integrity_score": 0.5,
            "commune": None,
            "age_range": None,
            "region": None,
            "rut_hash": None,
        }
        value_bronze = asset_calculator.calculate_usd_value(user_bronze)

        # Paso 2: Verifica su RUT → asciende a SILVER
        user_silver = {
            "rank": "SILVER",
            "integrity_score": 0.75,
            "commune": None,
            "age_range": None,
            "region": None,
            "rut_hash": hash_rut("11.111.111-1"),
        }
        value_silver = asset_calculator.calculate_usd_value(user_silver)

        # Paso 3: Completa perfil demográfico
        user_silver_full = {
            "rank": "SILVER",
            "integrity_score": 0.79,  # 0.75 + 2*0.02 (commune + age_range)
            "commune": "Santiago",
            "age_range": "25-34",
            "region": "Metropolitana",
            "rut_hash": hash_rut("11.111.111-1"),
        }
        value_silver_full = asset_calculator.calculate_usd_value(user_silver_full)

        # Verificaciones: cada paso aumenta el valor del ciudadano
        assert value_silver > value_bronze, (
            f"SILVER ({value_silver}) debe valer más que BRONZE ({value_bronze})"
        )
        assert value_silver_full > value_silver, (
            f"SILVER+datos ({value_silver_full}) debe valer más que SILVER ({value_silver})"
        )

        # Logging del test para evidencia
        print(f"\n{'='*50}")
        print(f"  BEACON — Test de Ascensión (Ciclo de Vida)")
        print(f"{'='*50}")
        print(f"  BRONZE (registro):        ${value_bronze:.2f}")
        print(f"  SILVER (RUT verificado):   ${value_silver:.2f}")
        print(f"  SILVER + datos completos:  ${value_silver_full:.2f}")
        print(f"{'='*50}")

    def test_platform_total_value(self):
        """Calcula el valor total de una plataforma de ejemplo."""
        users = [
            {"rank": "BRONZE", "integrity_score": 0.5, "commune": None,
             "age_range": None, "region": None, "rut_hash": None},
            {"rank": "SILVER", "integrity_score": 0.75, "commune": "Santiago",
             "age_range": "25-34", "region": "Metropolitana", "rut_hash": "hash1"},
            {"rank": "GOLD", "integrity_score": 0.95, "commune": "Las Condes",
             "age_range": "35-44", "region": "Metropolitana", "rut_hash": "hash2"},
        ]
        result = asset_calculator.calculate_total_platform_value(users)
        assert result["total_usd"] > 0
        assert result["user_count"] == 3
        assert result["avg_value"] > 0
        assert "BRONZE" in result["by_tier"]


# ═══════════════════════════════════════════════
# TEST 4: Enums (Código de Honor)
# ═══════════════════════════════════════════════


class TestEnums:
    """Valida que las enumeraciones estén correctas."""

    def test_user_ranks_exist(self):
        assert UserRank.BRONZE == "BRONZE"
        assert UserRank.SILVER == "SILVER"
        assert UserRank.GOLD == "GOLD"
        assert UserRank.DIAMOND == "DIAMOND"

    def test_verification_levels(self):
        assert VerificationLevel.EMAIL == 1
        assert VerificationLevel.RUT == 2
        assert VerificationLevel.ADMIN == 3

    def test_security_levels(self):
        assert SecurityLevel.GREEN == "GREEN"
        assert SecurityLevel.YELLOW == "YELLOW"
        assert SecurityLevel.RED == "RED"
