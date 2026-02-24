"""
BEACON PROTOCOL — DNA Scanner (El Portero Forense MVP)
=======================================================
Primer "amigo bit" que patrulla la entrada del búnker.
Analiza los metadatos de cada petición para clasificar
al visitante antes de que toque un solo byte de la BBDD.

Clasificaciones:
  - HUMAN     (score > 70): Comportamiento orgánico, pasa sin fricción.
  - SUSPICIOUS (30 < score ≤ 70): Vigilancia extra, posible CAPTCHA.
  - DISPLACED  (score ≤ 30): Bot confirmado → Shadow Mode silencioso.

"No le decimos al bot que lo detectamos.
 Le dejamos creer que sus votos cuentan."
"""

from typing import Dict


class DNAScanner:
    """
    Scanner de ADN Digital.
    Analiza metadatos del request para detectar bots,
    herramientas de automatización y comportamiento inhumano.

    En fases futuras se expandirá con:
      - fingerprint_hasher.py (colisiones de hardware)
      - isp_analyzer.py (datacenter vs residencial)
      - spatial_logic_validator.py (coherencia territorial)
    """

    # Keywords que delatan herramientas de automatización
    BOT_KEYWORDS = [
        "headless", "selenium", "puppeteer", "python-requests",
        "scrapy", "bot", "crawler", "spider", "phantomjs",
        "playwright", "httpx", "urllib", "wget", "curl",
    ]

    def scan_request(self, metadata: Dict) -> Dict:
        """
        Analiza los metadatos de una petición HTTP.

        Args:
            metadata: Diccionario con datos capturados:
                - fill_duration (float): Segundos entre carga y submit
                - user_agent (str): Header User-Agent
                - ip (str): Dirección IP del cliente
                - screen_resolution (str): Resolución de pantalla (futuro)
                - webdriver (bool): navigator.webdriver (futuro)

        Returns:
            {
                "score": int (0-100),
                "classification": "HUMAN" | "SUSPICIOUS" | "DISPLACED",
                "alerts": list[str]
            }
        """
        score = 100
        alerts = []

        # ─── Test 1: Velocidad Inhumana ───
        # Si el formulario se llena en <2 segundos, es un bot
        fill_duration = metadata.get("fill_duration", 10.0)
        if fill_duration < 2.0:
            score -= 50
            alerts.append("BOT_SPEED_DETECTED")
        elif fill_duration < 4.0:
            score -= 20
            alerts.append("UNUSUALLY_FAST_SUBMISSION")

        # ─── Test 2: User-Agent Sospechoso ───
        ua = metadata.get("user_agent", "").lower()
        if any(bot in ua for bot in self.BOT_KEYWORDS):
            score -= 80
            alerts.append("AUTOMATION_TOOL_DETECTED")

        # ─── Test 3: User-Agent Vacío o Genérico ───
        if not ua or ua == "mozilla/5.0":
            score -= 30
            alerts.append("GENERIC_OR_MISSING_UA")

        # ─── Test 4: WebDriver Flag (Chrome Headless) ───
        if metadata.get("webdriver", False):
            score -= 60
            alerts.append("WEBDRIVER_DETECTED")

        # ─── Clasificación Final ───
        # Asegurar que el score no baje de 0
        score = max(0, score)

        if score > 70:
            classification = "HUMAN"
        elif score > 30:
            classification = "SUSPICIOUS"
        else:
            classification = "DISPLACED"

        return {
            "score": score,
            "classification": classification,
            "alerts": alerts,
        }


# ─── Instancia global del guardián ───
gatekeeper = DNAScanner()
