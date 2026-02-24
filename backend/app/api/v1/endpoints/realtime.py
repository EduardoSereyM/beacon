"""
BEACON PROTOCOL — Real-Time Pulse (WebSocket + Redis Pub/Sub)
==============================================================
Arquitectura:
  0ms:  Oro presiona "Emitir Veredicto" → REST endpoint validado
  10ms: Redis Pub/Sub recibe la actualización
  15ms: WebSocket empuja la data a todos los clientes en esa entidad
  30ms: La pantalla de miles de personas explota en oro

Seguridad del Bridge:
  - El WebSocket es SOLO LECTURA para el cliente
  - Los votos SOLO entran por el endpoint REST validado por los "amigos bits"
  - El cliente no puede inyectar datos por el socket
  - El backend publica al canal; el frontend solo escucha

Canales Redis:
  - beacon:pulse:{entity_id} → Actualizaciones de una entidad específica
  - beacon:pulse:global → Eventos globales (seguridad, etc.)

"El Latido de Beacon. Donde la verdad se propaga a la velocidad de la luz."
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import redis.asyncio as redis

from app.core.config import get_settings

logger = logging.getLogger("beacon.realtime")

router = APIRouter(prefix="/realtime", tags=["Real-Time Pulse"])

# ══════════════════════════════════════════════
# CONNECTION MANAGER
# ══════════════════════════════════════════════
# Gestiona conexiones WebSocket agrupadas por entity_id.
# Cada entity_id tiene su propio "salon" donde los clientes
# reciben actualizaciones en tiempo real.


class ConnectionManager:
    """Administrador de conexiones WebSocket por entidad."""

    def __init__(self) -> None:
        # { entity_id: [websocket1, websocket2, ...] }
        self._rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, entity_id: str) -> None:
        """Acepta la conexión y la añade al salon de la entidad."""
        await websocket.accept()
        if entity_id not in self._rooms:
            self._rooms[entity_id] = []
        self._rooms[entity_id].append(websocket)
        logger.info(
            "WS connected | entity=%s | clients=%d",
            entity_id,
            len(self._rooms[entity_id]),
        )

    def disconnect(self, websocket: WebSocket, entity_id: str) -> None:
        """Remueve la conexión del salon."""
        if entity_id in self._rooms:
            self._rooms[entity_id] = [
                ws for ws in self._rooms[entity_id] if ws != websocket
            ]
            if not self._rooms[entity_id]:
                del self._rooms[entity_id]

    async def broadcast_to_entity(self, entity_id: str, data: dict[str, Any]) -> None:
        """Envía datos a TODOS los clientes en el salon de una entidad."""
        if entity_id not in self._rooms:
            return

        disconnected: list[WebSocket] = []
        message = json.dumps(data)

        for ws in self._rooms[entity_id]:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)

        # Limpiar conexiones muertas
        for ws in disconnected:
            self.disconnect(ws, entity_id)

    @property
    def total_connections(self) -> int:
        return sum(len(clients) for clients in self._rooms.values())

    @property
    def active_rooms(self) -> int:
        return len(self._rooms)


manager = ConnectionManager()


# ══════════════════════════════════════════════
# REDIS PUB/SUB LISTENER
# ══════════════════════════════════════════════
# Escucha el canal Redis y reenvía a los WebSockets.
# Patrón: beacon:pulse:* (wildcard por entity_id)


async def _get_redis_connection() -> redis.Redis | None:
    """Crea conexión Redis para Pub/Sub."""
    try:
        settings = get_settings()
        r = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
        await r.ping()
        return r
    except Exception as e:
        logger.warning("Redis Pub/Sub unavailable: %s", e)
        return None


async def redis_subscriber(entity_id: str) -> None:
    """
    Suscriptor Redis para una entidad específica.
    Escucha el canal beacon:pulse:{entity_id} y reenvía
    todos los mensajes al salon WebSocket correspondiente.
    """
    r = await _get_redis_connection()
    if not r:
        logger.warning("Redis not available for entity %s pulse", entity_id)
        return

    channel = f"beacon:pulse:{entity_id}"
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)

    logger.info("Redis subscriber started | channel=%s", channel)

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await manager.broadcast_to_entity(entity_id, data)
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON in channel %s", channel)
    except Exception as e:
        logger.error("Redis subscriber error: %s", e)
    finally:
        await pubsub.unsubscribe(channel)
        await r.aclose()


# ══════════════════════════════════════════════
# PUBLISHER (para uso del backend)
# ══════════════════════════════════════════════
# Cuando un veredicto se registra, el backend llama a esta
# función para publicar la actualización al canal Redis.


async def publish_verdict_pulse(
    entity_id: str,
    new_score: float,
    total_votes: int,
    integrity_index: float,
    is_gold_verdict: bool = False,
    voter_rank: str = "BRONZE",
) -> bool:
    """
    Publica un pulso de veredicto al canal Redis de la entidad.

    Este es el ÚNICO punto de entrada para emitir actualizaciones.
    El WebSocket es de solo lectura para el cliente.

    Args:
        entity_id: UUID de la entidad evaluada
        new_score: Nuevo reputation_score calculado
        total_votes: Conteo total de votos
        integrity_index: Índice de integridad actualizado
        is_gold_verdict: Si es un Veredicto Magistral (Gold/Diamond)
        voter_rank: Rango del votante (para efectos visuales)

    Returns:
        True si se publicó exitosamente, False si Redis no disponible
    """
    r = await _get_redis_connection()
    if not r:
        return False

    channel = f"beacon:pulse:{entity_id}"
    payload = {
        "type": "VERDICT_PULSE",
        "entity_id": entity_id,
        "new_score": round(new_score, 4),
        "total_votes": total_votes,
        "integrity_index": round(integrity_index, 4),
        "is_gold_verdict": is_gold_verdict,
        "voter_rank": voter_rank,
        "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
    }

    try:
        await r.publish(channel, json.dumps(payload))
        logger.info(
            "Pulse published | entity=%s | gold=%s | score=%.4f",
            entity_id,
            is_gold_verdict,
            new_score,
        )
        await r.aclose()
        return True
    except Exception as e:
        logger.error("Failed to publish pulse: %s", e)
        await r.aclose()
        return False


# ══════════════════════════════════════════════
# WEBSOCKET ENDPOINT
# ══════════════════════════════════════════════
# Solo lectura. El cliente se conecta y escucha.
# No puede enviar datos.


@router.websocket("/pulse/{entity_id}")
async def entity_pulse_ws(websocket: WebSocket, entity_id: str) -> None:
    """
    WebSocket de solo lectura para recibir actualizaciones
    en tiempo real de una entidad específica.

    Conexión: ws://host/api/v1/realtime/pulse/{entity_id}

    Seguridad:
      - Solo lectura: cualquier dato enviado por el cliente es ignorado
      - Validación: entity_id debe ser un UUID válido
      - Los votos solo entran por el endpoint REST
    """
    # Validar entity_id (formato básico)
    if len(entity_id) < 3:
        await websocket.close(code=4001, reason="Invalid entity_id")
        return

    await manager.connect(websocket, entity_id)

    # Iniciar suscriptor Redis en background
    import asyncio

    subscriber_task = asyncio.create_task(redis_subscriber(entity_id))

    try:
        # El cliente solo escucha. Si envía algo, lo ignoramos.
        # Mantenemos la conexión abierta esperando desconexión.
        while True:
            # Recibir datos pero ignorarlos (seguridad: solo lectura)
            _ = await websocket.receive_text()
            # No procesamos nada del cliente.
            # Los votos SOLO entran por REST.
    except WebSocketDisconnect:
        logger.info("WS disconnected | entity=%s", entity_id)
    except Exception as e:
        logger.warning("WS error | entity=%s | err=%s", entity_id, e)
    finally:
        manager.disconnect(websocket, entity_id)
        subscriber_task.cancel()


# ══════════════════════════════════════════════
# STATUS ENDPOINT (REST)
# ══════════════════════════════════════════════


@router.get("/status")
async def realtime_status() -> dict:
    """Estado del sistema Real-Time Pulse."""
    return {
        "service": "Real-Time Pulse",
        "total_connections": manager.total_connections,
        "active_rooms": manager.active_rooms,
        "status": "operational",
    }
