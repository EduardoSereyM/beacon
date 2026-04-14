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
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full glass transition-all ${
                        isAuthenticated ? "mb-3 scale-90" : "mb-4"
                    }`}
                    style={{
                        animation: "beaconPulse 3s ease-in-out infinite",
                        border: "1px solid rgba(255,7,58,0.8)",
                        boxShadow: "0 0 20px rgba(255, 7, 57, 1)",
                        background: "rgba(255, 7, 58, 0.05)",
                    }}
                >
                    <div className="w-2 h-2 rounded-full bg-beacon-neon pulse-live" />
                    <span
                        className="text-[11px] sm:text-[12px] tracking-[0.2em] uppercase font-mono font-bold"
                        style={{ color: "#FF073A" }}
                    >
                        En vivo — Chile opina en tiempo real
                    </span>
                </div>

                {/* Título */}
                <h1
                    className={`font-extrabold tracking-tight leading-tight transition-all ${
                        isAuthenticated
                            ? "text-3xl sm:text-4xl md:text-5xl mb-2"
                            : "text-4xl sm:text-5xl md:text-6xl mb-4"
                    }`}
                    style={{ color: "#f5f5f5" }}
                >
                    En otros lugares eligen quién opina por ti.
                    <br className="sm:hidden" />
                    <br />
                    <span style={{ color: "#00E5FF" }}>Aquí opinas tú.</span>
                </h1>

                {/* Subtítulo */}
                <div
                    className={`mx-auto leading-relaxed transition-all ${
                        isAuthenticated
                            ? "text-sm max-w-lg mb-8"
                            : "text-base sm:text-lg max-w-3xl mb-8"
                    }`}
                    style={{ color: "rgba(255,255,255,0.75)" }}
                >
                    <p className="mb-6">
                        Beacon es la plataforma de opinión ciudadana abierta y verificada de Chile. Las encuestadoras tradicionales eligen quién habla por ti — nosotros NO. 
                        <br />
                        No necesitas que te elijan para que te escuchen. 
                        <br />
                        Cada voto cuenta porque cada persona es real. Sin bots, sin multicuentas, sin panel desconocido.
                    </p>
                </div>

                {/* 3 Claims Horizontales */}
                <div
                    className={`mx-auto transition-all ${
                        isAuthenticated ? "mb-8" : "mb-10"
                    }`}
                    style={{ color: "rgba(255,255,255,0.5)" }}
                >
                    <p className="text-sm tracking-wider font-mono">
                        Sin clientes votantes ocultos 🙈 <span className="mx-2">|</span> Datos públicos siempre <span className="mx-2">|</span> Gratis para las personas
                    </p>
                </div>

                {/* CTAs */}
                <div className="flex items-center justify-center gap-4 flex-wrap mt-2">
                    {!isAuthenticated ? (
                        <>
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent("beacon:open-auth-modal"))}
                                className="px-8 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-300 hover:opacity-90 hover:scale-105"
                                style={{
                                    background: "#00E5FF",
                                    border: "none",
                                    color: "#0A0A0A",
                                    boxShadow: "0 8px 24px rgba(0,229,255,0.3)",
                                }}
                            >
                                Dar mi opinión →
                            </button>
                            <Link
                                href="/encuestas"
                                className="px-8 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-300 hover:bg-opacity-10 hover:scale-105"
                                style={{
                                    background: "transparent",
                                    border: "1.5px solid rgba(0, 229, 255, 0.4)",
                                    color: "#00E5FF",
                                }}
                            >
                                Ver encuestas →
                            </Link>
                        </>
                    ) : (
                        <Link
                            href="/encuestas"
                            className="px-8 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-300 hover:opacity-90 hover:scale-105"
                            style={{
                                background: "#00E5FF",
                                border: "none",
                                color: "#0A0A0A",
                                boxShadow: "0 8px 24px rgba(0, 229, 255, 0.3)",
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
