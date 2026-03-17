/**
 * BEACON PROTOCOL — Versus Detail Page
 * =====================================
 * Ruta dinámica: /versus/[id]
 * Duelo directo A vs B con votación ponderada (P3).
 */

"use client";

import { use } from "react";
import Link from "next/link";
import ShareQR from "@/components/shared/ShareQR";

interface VersusPageProps {
    params: Promise<{ id: string }>;
}

export default function VersusDetailPage({ params }: VersusPageProps) {
    const { id } = use(params);

    return (
        <div className="min-h-screen px-6 py-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <Link
                        href="/versus"
                        className="text-foreground-muted hover:text-foreground text-xs font-mono transition-colors"
                    >
                        ← Arena VS
                    </Link>
                    <span className="text-foreground-muted text-xs">/</span>
                    <span
                        className="text-xs font-mono tracking-wider"
                        style={{ color: "#D4AF37" }}
                    >
                        VS:{id.slice(0, 8).toUpperCase()}
                    </span>
                    <div className="ml-auto">
                        <ShareQR title={`Versus — ${id.slice(0, 8).toUpperCase()}`} label="Compartir" />
                    </div>
                </div>

                {/* VS Card */}
                <div
                    className="rounded-xl p-8"
                    style={{
                        background: "linear-gradient(135deg, rgba(212,175,55,0.05) 0%, rgba(138,43,226,0.05) 100%)",
                        border: "1px solid rgba(212,175,55,0.15)",
                    }}
                >
                    <div className="flex items-center gap-4 mb-6">
                        <div
                            className="w-16 h-16 rounded-xl flex items-center justify-center"
                            style={{
                                background: "linear-gradient(135deg, rgba(212,175,55,0.2), rgba(138,43,226,0.1))",
                                border: "1px solid rgba(212,175,55,0.2)",
                            }}
                        >
                            <span className="text-2xl">⚔️</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">
                                Enfrentamiento en curso
                            </h1>
                            <p className="text-sm text-foreground-muted mt-1">
                                ID: <span className="font-mono" style={{ color: "#D4AF37" }}>{id}</span>
                            </p>
                        </div>
                    </div>

                    {/* Arena A vs B */}
                    <div className="grid grid-cols-3 gap-4 items-center mb-6">
                        <div
                            className="rounded-xl p-6 text-center"
                            style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.15)" }}
                        >
                            <div className="text-4xl mb-2">👤</div>
                            <p className="text-sm font-bold text-foreground">Entidad A</p>
                            <p className="text-[10px] text-foreground-muted font-mono mt-1">Pendiente</p>
                        </div>

                        <div className="text-center">
                            <span
                                className="text-3xl font-black"
                                style={{ background: "linear-gradient(135deg, #D4AF37, #8A2BE2)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                            >
                                VS
                            </span>
                        </div>

                        <div
                            className="rounded-xl p-6 text-center"
                            style={{ background: "rgba(138,43,226,0.05)", border: "1px solid rgba(138,43,226,0.15)" }}
                        >
                            <div className="text-4xl mb-2">👤</div>
                            <p className="text-sm font-bold text-foreground">Entidad B</p>
                            <p className="text-[10px] text-foreground-muted font-mono mt-1">Pendiente</p>
                        </div>
                    </div>

                    <div className="border border-dashed border-beacon-border rounded-lg p-6 text-center">
                        <p className="text-sm text-foreground-muted">
                            ⚔️ Votación en duelo (P3 — En desarrollo)
                        </p>
                        <p className="text-[10px] text-foreground-muted mt-1 font-mono">
                            Tu peso de voto depende de tu rango verificado
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
