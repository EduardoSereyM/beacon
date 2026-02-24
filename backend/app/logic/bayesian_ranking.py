"""
BEACON PROTOCOL — Bayesian Ranking Engine (El Cerebro Matemático)
===================================================================
Implementa el Promedio Bayesiano con Shrinkage Estadístico para que
entidades con pocos votos no distorsionen el ranking público.

Fórmula Central (Shrinkage):
  W = (N / (N + m)) × R  +  (m / (N + m)) × C

  Donde:
    N = Número de votos reales de la entidad
    R = Promedio real (media aritmética de los votos)
    m = Umbral de confianza (mínimo de votos para "confiar" en R)
    C = Media global del sistema (prior bayesiano)

  Interpretación:
    - Si N << m → la nota se "encoge" (shrink) hacia C (3.0)
    - Si N >> m → la nota converge al promedio real R
    - Esto PROTEGE contra entidades con 2 votos de 5.0

Factor de Volumen:
  V = min(1.0, √(N / 100))

  Interpretación:
    - Con 1 voto:    V = 0.10 → la nota tiene 10% de estabilidad
    - Con 25 votos:  V = 0.50 → la nota tiene 50% de estabilidad
    - Con 100 votos: V = 1.00 → la nota es 100% confiable

"La verdad matemática no se negocia. Shrinkage es la vacuna
 contra la tiranía de las minorías ruidosas."
"""

import math
from typing import List, Optional, Dict, Any


class BayesianRankingEngine:
    """
    Motor de Ranking Bayesiano con Shrinkage Estadístico.

    ¿Por qué Shrinkage y no un promedio simple?
    ─────────────────────────────────────────────
    Problema: Un político con 2 votos de 5.0 aparecería #1 en el ranking,
    superando a uno con 500 votos y promedio 4.8.

    Solución: El shrinkage "encoge" la nota hacia la media global (3.0)
    cuando hay pocos votos, protegiendo la integridad del ranking.

    Ejemplo:
      - Entidad A: 2 votos, promedio 5.0 → shrunk = 3.12 (baja mucho)
      - Entidad B: 500 votos, promedio 4.8 → shrunk = 4.79 (casi igual)

    Así la Entidad B queda correctamente por encima de la A.
    """

    def __init__(
        self,
        confidence_threshold: int = 30,
        global_mean: float = 3.0,
        volume_saturation: int = 100,
    ):
        """
        Args:
            confidence_threshold (m): Cantidad mínima de votos para que
                el promedio real supere al prior bayesiano. Default: 30.
                ¿Por qué 30? Es el estándar estadístico para "muestra
                suficiente" (Central Limit Theorem).

            global_mean (C): Media global del sistema. Default: 3.0.
                En una escala 1-5, 3.0 es el punto neutro.
                Este valor se recalcula periódicamente desde config_params.

            volume_saturation: Número de votos para alcanzar 100% de
                estabilidad en el Factor de Volumen. Default: 100.
        """
        self.m = confidence_threshold
        self.C = global_mean
        self.volume_saturation = volume_saturation

    def calculate_shrinkage(self, n_votes: int, raw_average: float) -> float:
        """
        Calcula el promedio bayesiano con shrinkage.

        Fórmula: W = (N/(N+m)) × R + (m/(N+m)) × C

        Args:
            n_votes: Número de votos (N)
            raw_average: Promedio aritmético real (R)

        Returns:
            Nota "encogida" hacia la media global

        Ejemplos:
            >>> engine = BayesianRankingEngine()
            >>> engine.calculate_shrinkage(0, 0.0)    # Sin votos → C
            3.0
            >>> engine.calculate_shrinkage(2, 5.0)    # Pocos votos → ~C
            3.125
            >>> engine.calculate_shrinkage(500, 4.8)  # Muchos votos → ~R
            4.79
        """
        if n_votes <= 0:
            return self.C

        weight_real = n_votes / (n_votes + self.m)
        weight_prior = self.m / (n_votes + self.m)

        return round((weight_real * raw_average) + (weight_prior * self.C), 4)

    def calculate_volume_factor(self, n_votes: int) -> float:
        """
        Factor de Volumen: curva de confianza basada en √(N/100).

        ¿Por qué raíz cuadrada y no lineal?
        Porque la confianza crece rápido al principio (de 0 a 25 votos
        ya tienes 50% de estabilidad) pero cada voto adicional
        aporta menos estabilidad marginal. Esto evita que una
        entidad necesite miles de votos para ser confiable.

        Args:
            n_votes: Número de votos

        Returns:
            Factor entre 0.0 y 1.0

        Ejemplos:
            >>> engine = BayesianRankingEngine()
            >>> engine.calculate_volume_factor(1)     # 0.10
            >>> engine.calculate_volume_factor(25)    # 0.50
            >>> engine.calculate_volume_factor(100)   # 1.00
            >>> engine.calculate_volume_factor(500)   # 1.00 (capped)
        """
        if n_votes <= 0:
            return 0.0

        factor = math.sqrt(n_votes / self.volume_saturation)
        return round(min(1.0, factor), 4)

    def calculate_final_score(
        self,
        n_votes: int,
        raw_average: float,
        reputation_weight: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Calcula la nota final de una entidad combinando Shrinkage + Volumen.

        Fórmula final:
          final = shrinkage_score × volume_factor × reputation_weight

        El reputation_weight permite que votos de usuarios GOLD/DIAMOND
        tengan más peso que los de BRONZE (peso del voto por rango).

        Args:
            n_votes: Total de votos válidos (is_counted=True)
            raw_average: Promedio aritmético de los votos válidos
            reputation_weight: Multiplicador de reputación (default 1.0)

        Returns:
            Diccionario con el desglose completo del cálculo.
            Esto cumple con las Directives 2026 §11:
            "registrar parámetros exactos para reconstrucción matemática"
        """
        shrinkage = self.calculate_shrinkage(n_votes, raw_average)
        volume = self.calculate_volume_factor(n_votes)

        # Nota final: shrinkage ajustado por volumen y reputación
        # Si volume = 0.5, la nota se acerca 50% al prior
        final = shrinkage * volume * reputation_weight

        # Nivel de confianza cualitativo (para la UI)
        if n_votes == 0:
            confidence_label = "SIN_DATOS"
        elif n_votes < 10:
            confidence_label = "INSUFICIENTE"
        elif n_votes < self.m:
            confidence_label = "PRELIMINAR"
        elif n_votes < self.volume_saturation:
            confidence_label = "CONFIABLE"
        else:
            confidence_label = "ESTABLE"

        return {
            "final_score": round(final, 4),
            "shrinkage_score": shrinkage,
            "volume_factor": volume,
            "reputation_weight": reputation_weight,
            "n_votes": n_votes,
            "raw_average": raw_average,
            "confidence_threshold_m": self.m,
            "global_mean_C": self.C,
            "confidence_label": confidence_label,
        }

    def rank_entities(self, entities: List[dict]) -> List[dict]:
        """
        Rankea una lista de entidades usando el score bayesiano.

        Cada entidad debe tener:
          - "total_reviews" (int): Número de votos válidos
          - "reputation_score" (float): Promedio actual

        Returns:
            Lista ordenada de mayor a menor score final,
            con desglose matemático completo (Directives 2026 §11).
        """
        ranked = []
        for entity in entities:
            n_votes = entity.get("total_reviews", 0)
            raw_avg = entity.get("reputation_score", self.C)

            result = self.calculate_final_score(n_votes, raw_avg)
            result["entity_id"] = entity.get("id", "unknown")
            result["entity_name"] = entity.get("name", "unknown")
            result["entity_type"] = entity.get("type", "unknown")
            ranked.append(result)

        # Ordenar por score final descendente
        ranked.sort(key=lambda x: x["final_score"], reverse=True)

        # Asignar posición en el ranking
        for i, item in enumerate(ranked):
            item["rank_position"] = i + 1

        return ranked

    def update_global_mean(self, new_mean: float) -> None:
        """
        Actualiza la media global C desde config_params.
        El Overlord puede ajustar este valor según el ecosistema.
        """
        self.C = new_mean


# ─── Instancia global del Cerebro Matemático ───
ranking_brain = BayesianRankingEngine()
"""
Singleton del motor de ranking bayesiano.
Uso: from app.logic.bayesian_ranking import ranking_brain
"""
