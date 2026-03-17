/**
 * BEACON PROTOCOL — /encuestas (Encuestas Públicas)
 * ===================================================
 * Listado de encuestas activas con acceso directo por QR.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Encuestas — Beacon Protocol",
    description: "Encuestas de opinión ciudadana verificada. Tu voto pesa según tu nivel de integridad.",
    openGraph: {
        title: "Encuestas — Beacon Protocol",
        description: "Opinión ciudadana verificada en tiempo real.",
        type: "website",
    },
};

export default function EncuestasPage() {
    return (
        <div className="min-h-screen pt-20 pb-12 px-6">
            <div className="max-w-4xl mx-auto text-center">
                <div className="pt-16 pb-8">
                    <p className="text-6xl mb-6">📊</p>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-foreground">
                        Encuestas
                    </h1>
                    <p className="text-sm text-foreground-muted max-w-md mx-auto leading-relaxed">
                        Encuestas de opinión con peso ponderado por integridad.
                        Cada respuesta vale según tu rango verificado.
                    </p>
                </div>

                <div
                    className="rounded-xl p-10 mt-8"
                    style={{
                        background: "rgba(57,255,20,0.03)",
                        border: "1px solid rgba(57,255,20,0.12)",
                    }}
                >
                    <div
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6"
                        style={{
                            border: "1px solid rgba(57,255,20,0.3)",
                            backgroundColor: "rgba(57,255,20,0.06)",
                        }}
                    >
                        <div
                            className="w-1.5 h-1.5 rounded-full animate-pulse"
                            style={{ backgroundColor: "#39FF14" }}
                        />
                        <span
                            className="text-[10px] tracking-[0.2em] uppercase font-mono"
                            style={{ color: "#39FF14" }}
                        >
                            En Desarrollo
                        </span>
                    </div>

                    <h2 className="text-lg font-bold text-foreground mb-3">
                        Encuestas ciudadanas ponderadas
                    </h2>
                    <p className="text-xs text-foreground-muted font-mono max-w-sm mx-auto mb-6">
                        Próximamente: comparte encuestas directamente con QR,
                        con resultados ponderados por rango de integridad.
                    </p>

                    <Link
                        href="/"
                        className="inline-block text-[11px] font-mono uppercase tracking-wider px-5 py-2.5 rounded-lg transition-all hover:scale-105"
                        style={{
                            backgroundColor: "rgba(57,255,20,0.08)",
                            border: "1px solid rgba(57,255,20,0.25)",
                            color: "#39FF14",
                        }}
                    >
                        Volver al Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
