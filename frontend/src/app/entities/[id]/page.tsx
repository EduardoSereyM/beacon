/**
 * BEACON PROTOCOL — Entity Detail Page (Ficha de Entidad)
 * =========================================================
 * Ruta dinámica: /entities/[id]
 * Muestra el perfil completo de una entidad evaluada.
 */

"use client";

import { use } from "react";

interface EntityPageProps {
    params: Promise<{ id: string }>;
}

export default function EntityPage({ params }: EntityPageProps) {
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
                        style={{ color: "#00E5FF" }}
                    >
                        ENTITY:{id.slice(0, 8).toUpperCase()}
                    </span>
                </div>

                {/* Main Card */}
                <div className="elite-card rounded-xl p-8">
                    {/* Entity Header */}
                    <div className="flex items-center gap-4 mb-6">
                        <div
                            className="w-16 h-16 rounded-xl flex items-center justify-center neon-gold"
                            style={{
                                background: "linear-gradient(135deg, #D4AF37, #f5d374)",
                            }}
                        >
                            <span className="text-2xl">👤</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">
                                Cargando entidad...
                            </h1>
                            <p className="text-sm text-foreground-muted mt-1">
                                ID: <span className="font-mono" style={{ color: "#00E5FF" }}>{id}</span>
                            </p>
                        </div>
                    </div>

                    {/* Score Section */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="glass rounded-lg p-4 text-center">
                            <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-1">
                                Reputation
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
                                Total Votos
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
                                Integrity
                            </p>
                            <p
                                className="text-3xl font-mono score-display font-bold"
                                style={{ color: "#D4AF37" }}
                            >
                                —%
                            </p>
                        </div>
                    </div>

                    {/* Placeholder para sliders de votación */}
                    <div className="border border-dashed border-beacon-border rounded-lg p-6 text-center">
                        <p className="text-sm text-foreground-muted">
                            🗳️ Sistema de votación con sliders dinámicos
                        </p>
                        <p className="text-[10px] text-foreground-muted mt-1">
                            Se implementará en la Fase 6: Entidades y Evaluación
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
