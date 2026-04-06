"use client";

import Link from "next/link";
import usePermissions from "@/hooks/usePermissions";

export default function HomeHeroClient() {
    const { isAuthenticated } = usePermissions();

    return (
        <section
            className={`relative px-6 overflow-hidden transition-all duration-500 ease-in-out ${
                isAuthenticated ? "pt-24 pb-12" : "pt-32 pb-24"
            }`}
        >
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(0,229,255,0.06) 0%, transparent 70%)",
                }}
            />

            <div className="max-w-4xl mx-auto text-center relative z-10">
                {/* Live badge */}
                <div
                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full glass transition-all ${
                        isAuthenticated ? "mb-4 scale-90" : "mb-6"
                    }`}
                    style={{
                        animation: "beaconPulse 3s ease-in-out infinite",
                        border: "1px solid rgba(255,7,58,0.7)",
                        boxShadow: "0 0 8px rgba(255, 7, 57, 0.81)",
                    }}
                >
                    <div className="w-1.5 h-1.5 rounded-full bg-beacon-neon pulse-live" />
                    <span
                        className="text-[10px] tracking-[0.2em] uppercase font-mono"
                        style={{ color: "#FF073A" }}
                    >
                        En vivo — Chile opina en tiempo real
                    </span>
                </div>

                {/* Título */}
                <h1
                    className={`font-extrabold tracking-tight leading-tight transition-all ${
                        isAuthenticated
                            ? "text-3xl sm:text-4xl md:text-5xl mb-3"
                            : "text-4xl sm:text-5xl md:text-6xl mb-6"
                    }`}
                >
                    <span className="text-foreground">Por fin, </span>
                    <br className="sm:hidden" />
                    <span
                        className="bg-clip-text text-transparent"
                        style={{ backgroundImage: "linear-gradient(135deg, #00E5FF, #8A2BE2)" }}
                    >
                        alguien te pregunta.
                    </span>
                </h1>

                {/* Subtítulo */}
                <p
                    className={`text-foreground-muted mx-auto leading-relaxed transition-all ${
                        isAuthenticated
                            ? "text-sm max-w-lg mb-6"
                            : "text-base sm:text-lg max-w-2xl mb-10"
                    }`}
                >
                    Beacon es la plataforma de opinión ciudadana abierta y verificada de Chile.
                    Sin panelistas seleccionados, sin agenda oculta.
                    Vota, ve los resultados y propón preguntas. Siempre gratis.
                </p>

                {/* CTAs */}
                <div className="flex items-center justify-center gap-4 flex-wrap">
                    {!isAuthenticated ? (
                        <>
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent("beacon:open-auth-modal"))}
                                className="px-6 py-3 rounded-xl text-sm font-semibold uppercase tracking-wider transition-all duration-300 hover:scale-105"
                                style={{
                                    background: "linear-gradient(135deg, rgba(212,175,55,0.15), rgba(138,43,226,0.15))",
                                    border: "1px solid rgba(212,175,55,0.3)",
                                    color: "#D4AF37",
                                    boxShadow: "0 0 15px rgba(212,175,55,0.15)",
                                }}
                            >
                                Dar mi opinión →
                            </button>
                            <Link
                                href="/encuestas"
                                className="px-6 py-3 rounded-xl text-sm font-semibold uppercase tracking-wider transition-all duration-300 hover:scale-105"
                                style={{
                                    background: "transparent",
                                    border: "1px solid rgba(0,229,255,0.2)",
                                    color: "#00E5FF",
                                }}
                            >
                                Ver encuestas →
                            </Link>
                        </>
                    ) : (
                        <Link
                            href="/encuestas"
                            className="px-6 py-3 rounded-xl text-sm font-semibold uppercase tracking-wider transition-all duration-300 hover:scale-105"
                            style={{
                                background: "linear-gradient(135deg, rgba(0,229,255,0.15), rgba(138,43,226,0.15))",
                                border: "1px solid rgba(0,229,255,0.3)",
                                color: "#00E5FF",
                            }}
                        >
                            Ver encuestas →
                        </Link>
                    )}
                </div>
            </div>
        </section>
    );
}
