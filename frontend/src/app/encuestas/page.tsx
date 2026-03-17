/**
 * BEACON PROTOCOL — /encuestas (Listado Público)
 * ================================================
 * Lista encuestas activas con imagen, título y QR compartible.
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import ShareQR from "@/components/shared/ShareQR";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Poll {
    id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    start_at: string | null;
    end_at: string | null;
}

export default function EncuestasPage() {
    const [polls, setPolls] = useState<Poll[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_URL}/api/v1/encuestas?limit=50`)
            .then((r) => r.json())
            .then((d) => setPolls(d.polls || []))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="min-h-screen pt-24 pb-12 px-6">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">
                        📊 Encuestas
                    </h1>
                    <p className="text-sm text-foreground-muted">
                        Opinión ciudadana ponderada por integridad. Tu voto vale según tu rango verificado.
                    </p>
                </div>

                {loading ? (
                    <div className="text-center py-16">
                        <p className="text-foreground-muted text-sm font-mono animate-pulse">Cargando encuestas...</p>
                    </div>
                ) : polls.length === 0 ? (
                    <div
                        className="rounded-xl p-12 text-center"
                        style={{ background: "rgba(57,255,20,0.03)", border: "1px solid rgba(57,255,20,0.1)" }}
                    >
                        <p className="text-4xl mb-4">📊</p>
                        <p className="text-sm text-foreground-muted">No hay encuestas activas en este momento.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {polls.map((poll) => (
                            <div
                                key={poll.id}
                                className="rounded-xl overflow-hidden"
                                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                            >
                                <div className="flex">
                                    {poll.cover_image_url && (
                                        <div className="w-32 flex-shrink-0 relative min-h-[100px]">
                                            <Image src={poll.cover_image_url} alt="" fill className="object-cover" />
                                        </div>
                                    )}
                                    <div className="flex-1 p-5">
                                        <h2 className="font-bold text-base text-foreground mb-1">{poll.title}</h2>
                                        {poll.description && (
                                            <p className="text-xs text-foreground-muted mb-3">{poll.description}</p>
                                        )}
                                        {poll.end_at && (
                                            <p className="text-[10px] text-foreground-muted font-mono mb-3">
                                                Cierra: {new Date(poll.end_at).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-3">
                                            <Link
                                                href={`/encuestas/${poll.id}`}
                                                className="px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-105"
                                                style={{ background: "linear-gradient(135deg, #D4AF37, #B8860B)", color: "#0A0A0A" }}
                                            >
                                                Participar →
                                            </Link>
                                            <ShareQR
                                                url={`${typeof window !== "undefined" ? window.location.origin : "https://www.beaconchile.cl"}/encuestas/${poll.id}`}
                                                title={poll.title}
                                                label="Compartir"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
