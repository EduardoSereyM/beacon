"""
BEACON PROTOCOL — El Demonio Redis (Domador de Ráfagas)
=========================================================
Componente que permite el Efecto Kahoot sin fricción.
Al ser asíncrono, maneja miles de validaciones de RUT y
"me gusta" anónimos por segundo sin bloquear el sistema.

Operaciones clave:
  - Caché de rangos de usuario (latencia <2ms)
  - Contadores en vivo para ranking (HINCRBY)
  - Urna electoral atómica (SADD para unicidad)
  - Rate limiting por IP/device_hash (Token Bucket)

Persistencia Diferida: Esta estructura permite que el sistema
responda "¡Voto Recibido!" al instante, mientras guarda los
datos en segundo plano.

"Redis no es solo una base de datos en memoria,
 es el Demonio de la Pre-gestión."
"""

import redis.asyncio as redis
from app.core.config import settings
import json


class RedisWrapper:
    """
    Envoltorio asíncrono para Redis.
    Maneja el pool de conexiones de forma eficiente
    para soportar eventos masivos de alta tensión.
    """

    def __init__(self):
        self.client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )

    async def cache_set(self, key: str, value: any, expire: int = 3600):
        """
        Almacena datos en la RAM.
        Ejemplo: Guardar el rango de un Ciudadano de Oro para
        que el ranking en vivo no consulte la BBDD.
        
        Args:
            key: Identificador (ej: "user:rank:uuid-123")
            value: Cualquier dato serializable a JSON
            expire: Tiempo de vida en segundos (default: 1 hora)
        """
        await self.client.set(key, json.dumps(value), ex=expire)

    async def cache_get(self, key: str):
        """
        Recupera datos en milisegundos.
        Antes de que un voto toque PostgreSQL, el redis_client
        valida si el usuario ya votó o si es un bot.
        
        Returns:
            El valor deserializado o None si no existe.
        """
        data = await self.client.get(key)
        return json.loads(data) if data else None

    async def cache_delete(self, key: str):
        """
        Elimina llaves del caché.
        Útil para purgas de bots o cambios de rango
        que deben reflejarse inmediatamente.
        """
        await self.client.delete(key)

    async def increment(self, key: str, amount: int = 1) -> int:
        """
        Incrementa un contador atómico.
        Perfecto para el conteo de votos en tiempo real (HINCRBY).
        Operación O(1) — misma velocidad con 100 o 1.000.000 de votos.
        """
        return await self.client.incrby(key, amount)

    async def set_add(self, key: str, value: str) -> int:
        """
        Agrega un elemento a un Set (SADD).
        Retorna 1 si es nuevo, 0 si ya existe.
        Muro definitivo contra el doble voto: O(1).
        """
        return await self.client.sadd(key, value)

    async def set_is_member(self, key: str, value: str) -> bool:
        """
        Verifica si un elemento existe en el Set.
        Usado por redis_ballot_box para validar unicidad
        antes de tocar la BBDD principal.
        """
        return await self.client.sismember(key, value)

    async def health_check(self) -> bool:
        """Verifica que el Demonio Redis esté despierto."""
        try:
            return await self.client.ping()
        except Exception:
            return False


# ─── Instancia para el pool de conexiones async ───
redis_pool = RedisWrapper()


async def get_redis() -> RedisWrapper:
    """
    Dependency de FastAPI para inyectar Redis.
    
    Ejemplo:
        @router.post("/vote")
        async def cast_vote(redis=Depends(get_redis)):
            already_voted = await redis.set_is_member("event:viña:votes", rut_hash)
    """
    return redis_pool
