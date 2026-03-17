/**
 * BEACON PROTOCOL — Encuesta Detail Page
 * ========================================
 * Ruta dinámica: /encuestas/[id]
 * Participación en encuesta pública con QR compartible.
 */

"use client";

import { use } from "react";
import Link from "next/link";
import ShareQR from "@/components/shared/ShareQR";

interface EncuestaPageProps {
    params: Promise<{ id: string }>;
}

export default function EncuestaDetailPage({ params }: EncuestaPageProps) {
    const { id } = use(params);

    return (
        <div className="min-h-screen px-6 py-8">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <Link
                        href="/encuestas"
                        className="text-foreground-muted hover:text-foreground text-xs font-mono transition-colors"
                    >
                        ← Encuestas
                    </Link>
                    <span className="text-foreground-muted text-xs">/</span>
                    <span
                        className="text-xs font-mono tracking-wider"
                        style={{ color: "#39FF14" }}
                    >
                        POLL:{id.slice(0, 8).toUpperCase()}
                    </span>
                    <div className="ml-auto">
                        <ShareQR title={`Encuesta — ${id.slice(0, 8).toUpperCase()}`} label="Compartir" />
                    </div>
                </div>

                {/* Poll Card */}
                <div
                    className="rounded-xl p-8"
                    style={{
                        background: "rgba(57,255,20,0.03)",
                        border: "1px solid rgba(57,255,20,0.12)",
                    }}
                >
                    <div className="flex items-center gap-4 mb-6">
                        <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center"
                            style={{
                                background: "rgba(57,255,20,0.1)",
                                border: "1px solid rgba(57,255,20,0.2)",
                            }}
                        >
                            <span className="text-2xl">📊</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-foreground">
                                Cargando encuesta...
                            </h1>
                            <p className="text-xs text-foreground-muted font-mono mt-1">
                                ID: {id}
                            </p>
                        </div>
                    </div>

                    <div className="border border-dashed border-beacon-border rounded-lg p-8 text-center">
                        <p className="text-sm text-foreground-muted">
                            📊 Módulo de encuestas (En desarrollo)
                        </p>
                        <p className="text-[10px] text-foreground-muted mt-2 font-mono">
                            Las respuestas se ponderan por integridad del votante
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
