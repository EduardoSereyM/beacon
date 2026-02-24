/**
 * BEACON PROTOCOL — useEntityPulse (Real-Time Pulse Hook)
 * =========================================================
 * Custom hook que abre una conexión WebSocket con el backend
 * para recibir actualizaciones en tiempo real de una entidad.
 *
 * Arquitectura:
 *   ws://host/api/v1/realtime/pulse/{entityId}
 *   → Solo lectura: el cliente NO puede enviar datos
 *   → Los votos solo entran por REST
 *
 * Efectos visuales:
 *   - Al recibir is_gold_verdict: true → dispara goldExplosion
 *   - Actualiza score, votos e integrity sin refresh
 *
 * "El Latido de Beacon. Donde la verdad se propaga
 *  a la velocidad de la luz."
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/** Payload que llega del WebSocket */
interface PulseEvent {
    type: "VERDICT_PULSE";
    entity_id: string;
    new_score: number;
    total_votes: number;
    integrity_index: number;
    is_gold_verdict: boolean;
    voter_rank: string;
    timestamp: string;
}

/** Estado del hook */
interface PulseState {
    /** Último score recibido */
    score: number | null;
    /** Total de votos actualizado */
    totalVotes: number | null;
    /** Integrity Index actualizado */
    integrityIndex: number | null;
    /** ¿Se acaba de recibir un Veredicto de Oro? (true por 3 segundos) */
    isGoldExplosion: boolean;
    /** Rango del último votante */
    lastVoterRank: string | null;
    /** ¿Está conectado el WebSocket? */
    isConnected: boolean;
    /** Timestamp del último pulso */
    lastPulseAt: string | null;
}

interface UseEntityPulseOptions {
    /** URL base del WebSocket (default: ws://localhost:8000) */
    wsBaseUrl?: string;
    /** Duración de la explosión de oro en ms (default: 3000) */
    goldExplosionDuration?: number;
    /** Auto-reconectar al desconectarse (default: true) */
    autoReconnect?: boolean;
}

export function useEntityPulse(
    entityId: string | null,
    options: UseEntityPulseOptions = {}
) {
    const {
        wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000",
        goldExplosionDuration = 3000,
        autoReconnect = true,
    } = options;

    const [state, setState] = useState<PulseState>({
        score: null,
        totalVotes: null,
        integrityIndex: null,
        isGoldExplosion: false,
        lastVoterRank: null,
        isConnected: false,
        lastPulseAt: null,
    });

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const goldTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    /** Procesa un mensaje del WebSocket */
    const handleMessage = useCallback(
        (event: MessageEvent) => {
            try {
                const data: PulseEvent = JSON.parse(event.data);

                if (data.type !== "VERDICT_PULSE") return;

                setState((prev) => ({
                    ...prev,
                    score: data.new_score,
                    totalVotes: data.total_votes,
                    integrityIndex: data.integrity_index,
                    lastVoterRank: data.voter_rank,
                    lastPulseAt: data.timestamp,
                    isGoldExplosion: data.is_gold_verdict,
                }));

                // Si es un Veredicto de Oro → mantener la explosión visual
                if (data.is_gold_verdict) {
                    // Limpiar timeout anterior si existe
                    if (goldTimeoutRef.current) {
                        clearTimeout(goldTimeoutRef.current);
                    }

                    // Apagar la explosión después de goldExplosionDuration ms
                    goldTimeoutRef.current = setTimeout(() => {
                        setState((prev) => ({ ...prev, isGoldExplosion: false }));
                    }, goldExplosionDuration);
                }
            } catch (err) {
                console.warn("[useEntityPulse] Invalid message:", err);
            }
        },
        [goldExplosionDuration]
    );

    /** Conectar al WebSocket */
    useEffect(() => {
        if (!entityId) return;

        const url = `${wsBaseUrl}/api/v1/realtime/pulse/${entityId}`;
        let ws: WebSocket;

        const connect = () => {
            ws = new WebSocket(url);

            ws.onopen = () => {
                setState((prev) => ({ ...prev, isConnected: true }));
                console.log(`[BeaconPulse] Connected to entity ${entityId}`);
            };

            ws.onmessage = handleMessage;

            ws.onclose = () => {
                setState((prev) => ({ ...prev, isConnected: false }));
                console.log(`[BeaconPulse] Disconnected from entity ${entityId}`);

                // Auto-reconectar después de 2 segundos
                if (autoReconnect) {
                    reconnectTimeoutRef.current = setTimeout(connect, 2000);
                }
            };

            ws.onerror = (err) => {
                console.warn(`[BeaconPulse] WebSocket error:`, err);
            };

            wsRef.current = ws;
        };

        connect();

        // Cleanup al desmontar
        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (goldTimeoutRef.current) {
                clearTimeout(goldTimeoutRef.current);
            }
            ws?.close();
        };
    }, [entityId, wsBaseUrl, handleMessage, autoReconnect]);

    return state;
}
