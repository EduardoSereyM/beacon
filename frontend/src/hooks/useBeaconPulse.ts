/**
 * BEACON PROTOCOL — useBeaconPulse
 * ==================================
 * Hook genérico de tiempo real para canales de encuestas y otros eventos.
 * Se conecta al WebSocket según el canal:
 *   - "poll:{id}"  → ws://host/api/v1/realtime/poll-pulse/{id}
 *
 * Uso:
 *   useBeaconPulse(`poll:${poll.id}`, (data) => {
 *     if (data.type === "POLL_PULSE") { ... }
 *   });
 */

"use client";

import { useEffect, useRef } from "react";

type PulseCallback = (data: Record<string, unknown>) => void;

const WS_BASE =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
    .replace(/^http/, "ws") + "/api/v1/realtime";

function getWsUrl(channel: string): string | null {
  if (channel.startsWith("poll:")) {
    const pollId = channel.slice(5);
    return `${WS_BASE}/poll-pulse/${pollId}`;
  }
  return null;
}

export function useBeaconPulse(channel: string, onMessage: PulseCallback) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef<PulseCallback>(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const connect = () => {
      const url = getWsUrl(channel);
      if (!url) return;

      const ws = new WebSocket(url);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current(data);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        reconnectRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [channel]);
}
