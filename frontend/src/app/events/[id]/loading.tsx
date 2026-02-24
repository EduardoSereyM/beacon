/**
 * BEACON PROTOCOL — Loading State (Events)
 * ==========================================
 * Flujo de datos forenses (#00E5FF — Cian Eléctrico)
 * con acento verde (#39FF14) para eventos en vivo.
 */

export default function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                {/* Spinner verde-cian */}
                <div className="relative w-16 h-16 mx-auto mb-4">
                    <div
                        className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                        style={{
                            borderTopColor: "#39FF14",
                            borderRightColor: "#39FF1450",
                            animationDuration: "0.8s",
                        }}
                    />
                    <div
                        className="absolute inset-2 rounded-full border-2 border-transparent animate-spin"
                        style={{
                            borderBottomColor: "#00E5FF",
                            borderLeftColor: "#00E5FF50",
                            animationDuration: "1.2s",
                            animationDirection: "reverse",
                        }}
                    />
                    <div
                        className="absolute inset-0 rounded-full"
                        style={{
                            boxShadow:
                                "0 0 15px rgba(57, 255, 20, 0.2), 0 0 30px rgba(57, 255, 20, 0.05)",
                        }}
                    />
                </div>

                {/* Texto de loading */}
                <p
                    className="text-xs font-mono tracking-[0.2em] uppercase"
                    style={{ color: "#39FF14" }}
                >
                    Conectando con el evento...
                </p>
                <p className="text-[10px] text-foreground-muted mt-1 font-mono">
                    LIVE FEED · WEBSOCKET · REAL-TIME RANKING
                </p>
            </div>
        </div>
    );
}
