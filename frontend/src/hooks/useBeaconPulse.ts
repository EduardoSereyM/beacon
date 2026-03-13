/**
 * BEACON PROTOCOL — useBeaconPulse (Hook genérico de Efecto Kahoot)
 * ==================================================================
 * Conecta al WebSocket de realtime para cualquier "sala":
 *   - Entidad:   roomKey = "ENTITY_UUID"
 *   - VS Arena:  roomKey = "versus:UUID"
 *   - Evento:    roomKey = "event:UUID"
 *   - Encuesta:  roomKey = "poll:UUID"
 *
 * Arquitectura:
 *   ws(s)://api/v1/realtime/pulse/{roomKey}  → solo lectura
 *   Reconexión automática cada 3 segundos.
 *   Falla silenciosa si Redis no está disponible.
 *
 * "El Latido de Beacon. La verdad a la velocidad de la luz."
 */

"use client";

import { useEffect, useRef } from "react";

// Convertir la API URL HTTP(S) → WS(S)
const toWsUrl = (apiUrl: string): string =>
  apiUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");

const WS_BASE = toWsUrl(
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
);

export type BeaconPulseHandler = (data: Record<string, unknown>) => void;

/**
 * Suscripción WebSocket a una sala de Beacon.
 *
 * @param roomKey  Identificador de la sala (ej: "versus:uuid", "event:uuid", "poll:uuid")
 * @param onMessage  Callback invocado por cada mensaje recibido
 */
export function useBeaconPulse(
  roomKey: string | null,
  onMessage: BeaconPulseHandler
): void {
  // Mantener el callback actualizado sin reiniciar el efecto
  const callbackRef = useRef<BeaconPulseHandler>(onMessage);
  useEffect(() => {
    callbackRef.current = onMessage;
  });

  useEffect(() => {
    if (!roomKey) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    const connect = () => {
      if (!alive) return;

      const url = `${WS_BASE}/api/v1/realtime/pulse/${encodeURIComponent(roomKey)}`;

      try {
        ws = new WebSocket(url);
      } catch {
        // WebSocket no soportado o URL inválida — falla silenciosa
        return;
      }

      ws.onmessage = (evt: MessageEvent) => {
        try {
          const data = JSON.parse(evt.data) as Record<string, unknown>;
          callbackRef.current(data);
        } catch {
          // Ignorar JSON inválido
        }
      };

      ws.onclose = () => {
        if (alive) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        // Silencioso — la reconexión se maneja en onclose
      };
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [roomKey]);
}
