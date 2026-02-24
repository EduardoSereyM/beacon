/**
 * BEACON PROTOCOL — Event Detail Page (Ficha de Evento)
 * =======================================================
 * Ruta dinámica: /events/[id]
 * Muestra el perfil de un evento con votación en vivo (Efecto Kahoot).
 */

"use client";

import { use } from "react";

interface EventPageProps {
    params: Promise<{ id: string }>;
}

export default function EventPage({ params }: EventPageProps) {
    const { id } = use(params);

    return (
        <div className="min-h-screen px-6 py-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <a
                        href="/"
                        className="text-foreground-muted hover:text-foreground text-xs font-mono transition-colors"
                    >
                        ← Volver
                    </a>
                    <span className="text-foreground-muted text-xs">/</span>
                    <span
                        className="text-xs font-mono tracking-wider"
                        style={{ color: "#39FF14" }}
                    >
                        EVENT:{id.slice(0, 8).toUpperCase()}
                    </span>
                </div>

                {/* Event Card */}
                <div className="elite-card rounded-xl p-8" style={{ borderColor: "rgba(57, 255, 20, 0.15)" }}>
                    {/* Event Header */}
                    <div className="flex items-center gap-4 mb-6">
                        <div
                            className="w-16 h-16 rounded-xl flex items-center justify-center neon-pulse"
                            style={{
                                background: "linear-gradient(135deg, rgba(57, 255, 20, 0.2), rgba(57, 255, 20, 0.05))",
                                border: "1px solid rgba(57, 255, 20, 0.2)",
                            }}
                        >
                            <span className="text-2xl">🎪</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">
                                Cargando evento...
                            </h1>
                            <p className="text-sm text-foreground-muted mt-1">
                                ID: <span className="font-mono" style={{ color: "#39FF14" }}>{id}</span>
                            </p>
                        </div>
                    </div>

                    {/* Live Status Banner */}
                    <div
                        className="rounded-lg p-4 mb-6 flex items-center justify-between"
                        style={{
                            background: "rgba(57, 255, 20, 0.05)",
                            border: "1px solid rgba(57, 255, 20, 0.15)",
                        }}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-3 h-3 rounded-full pulse-live"
                                style={{ backgroundColor: "#39FF14" }}
                            />
                            <span
                                className="text-sm font-mono score-display uppercase tracking-wider"
                                style={{ color: "#39FF14" }}
                            >
                                Votación en Vivo
                            </span>
                        </div>
                        <span className="text-xs text-foreground-muted font-mono">
                            WebSocket: Pendiente (Fase 7)
                        </span>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="glass rounded-lg p-4 text-center">
                            <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-1">
                                Participantes
                            </p>
                            <p
                                className="text-3xl font-mono score-display font-bold"
                                style={{ color: "#39FF14" }}
                            >
                                —
                            </p>
                        </div>
                        <div className="glass rounded-lg p-4 text-center">
                            <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-1">
                                Votos Totales
                            </p>
                            <p
                                className="text-3xl font-mono score-display font-bold"
                                style={{ color: "#00E5FF" }}
                            >
                                —
                            </p>
                        </div>
                        <div className="glass rounded-lg p-4 text-center">
                            <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-1">
                                Score Promedio
                            </p>
                            <p
                                className="text-3xl font-mono score-display font-bold"
                                style={{ color: "#D4AF37" }}
                            >
                                —
                            </p>
                        </div>
                    </div>

                    {/* Placeholder para ranking en vivo */}
                    <div className="border border-dashed border-beacon-border rounded-lg p-6 text-center">
                        <p className="text-sm text-foreground-muted">
                            📊 Ranking en tiempo real (Efecto Kahoot)
                        </p>
                        <p className="text-[10px] text-foreground-muted mt-1">
                            Se implementará en la Fase 7: Módulo de Eventos y Votación en Vivo
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
