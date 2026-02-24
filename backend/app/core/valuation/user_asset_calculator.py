"""
BEACON PROTOCOL — User Asset Calculator (La Caja Registradora)
================================================================
Motor que le da valor de mercado a tu imperio de ciudadanos.
Cada usuario tiene un precio basado en su rango, comportamiento
y densidad de datos demográficos.

Tiers de valor (USD):
  - BRONZE:  $1.00   → Valor de masa crítica
  - SILVER:  $15.00  → Humano verificado (RUT validado)
  - GOLD:    $150.00 → Referente de integridad
  - DIAMOND: $500.00 → Auditor de la verdad

"Cada humano verificado es una mina de oro.
 Cada dato demográfico, una pepita extra."
"""

from typing import Optional


class UserAssetCalculator:
    """
    Calcula el valor en USD de cada perfil de usuario
    según su rango y la densidad de datos que ha proporcionado.

    Factores del cálculo:
      1. Valor base del tier (rango)
      2. Multiplicador por pureza de comportamiento (integrity_score)
      3. Bono por datos demográficos (Data B2B: commune + age_range)
      4. Bono por verificación de identidad (RUT hash presente)
    """

    # Valor base en USD por rango
    TIER_VALUES = {
        "BRONZE": 1.00,     # Masa crítica — muchos, pero sin confirmar
        "SILVER": 15.00,    # Humano verificado — RUT validado, identidad real
        "GOLD": 150.00,     # Referente de integridad — voz con peso
        "DIAMOND": 500.00,  # Auditor de la verdad — verificación presencial
    }

    def calculate_usd_value(self, user) -> float:
        """
        Calcula el valor en dólares de un perfil de usuario.

        Fórmula:
          valor = (base_tier * integrity_multiplier) + data_bonus + rut_bonus

        Args:
            user: Diccionario o modelo User con los campos:
                - rank (str): BRONZE, SILVER, GOLD, DIAMOND
                - integrity_score (float): 0.0 a 1.0
                - commune (str|None): Comuna del ciudadano
                - age_range (str|None): Rango etario
                - rut_hash (str|None): Hash SHA-256 del RUT
                - region (str|None): Región del ciudadano

        Returns:
            Valor en USD redondeado a 2 decimales

        Ejemplos:
            BRONZE sin datos:    $1.00 * 0.6 = $0.60
            SILVER con datos:    $15.00 * 0.9 + $5.00 + $3.00 = $21.50
            GOLD completo:       $150.00 * 1.2 + $5.00 + $3.00 = $188.00
            DIAMOND completo:    $500.00 * 1.2 + $5.00 + $3.00 = $608.00
        """
        # Acceso flexible: soporta dict y dataclass
        rank = self._get(user, "rank", "BRONZE")
        integrity = self._get(user, "integrity_score", 0.5)
        commune = self._get(user, "commune")
        age_range = self._get(user, "age_range")
        region = self._get(user, "region")
        rut_hash = self._get(user, "rut_hash")

        # 1. Valor base del tier
        base = self.TIER_VALUES.get(rank, 1.0)

        # 2. Multiplicador por pureza de comportamiento
        #    integrity_score 0.5 = 0.6x, 1.0 = 1.2x
        multiplier = integrity * 1.2

        # 3. Bono por datos demográficos (Mina de Oro B2B)
        data_bonus = 0.0
        if commune and age_range:
            data_bonus = 5.0  # Paquete completo de segmentación
        elif commune or age_range:
            data_bonus = 2.0  # Segmentación parcial

        # Bono extra por región (mapa de calor)
        if region:
            data_bonus += 1.0

        # 4. Bono por identidad verificada (RUT hash)
        rut_bonus = 3.0 if rut_hash else 0.0

        return round((base * multiplier) + data_bonus + rut_bonus, 2)

    def calculate_total_platform_value(self, users: list) -> dict:
        """
        Calcula el valor total de la plataforma.
        Útil para reportes al Overlord y pitch a inversionistas.

        Returns:
            {
                "total_usd": float,
                "user_count": int,
                "avg_value": float,
                "by_tier": {"BRONZE": ..., "SILVER": ..., ...}
            }
        """
        total = 0.0
        by_tier = {"BRONZE": 0.0, "SILVER": 0.0, "GOLD": 0.0, "DIAMOND": 0.0}

        for user in users:
            value = self.calculate_usd_value(user)
            total += value
            rank = self._get(user, "rank", "BRONZE")
            by_tier[rank] = by_tier.get(rank, 0.0) + value

        count = len(users)
        return {
            "total_usd": round(total, 2),
            "user_count": count,
            "avg_value": round(total / count, 2) if count > 0 else 0.0,
            "by_tier": by_tier,
        }

    @staticmethod
    def _get(obj, key: str, default=None):
        """Accede a un campo de forma flexible (dict o atributo)."""
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)


# ─── Instancia global de la Caja Registradora ───
asset_calculator = UserAssetCalculator()
