/**
 * BEACON PROTOCOL — Loading State
 * =================================
 * Flujo de datos forenses (#00E5FF — Cian Eléctrico)
 * Simula la actividad del DNA Scanner mientras se cargan datos.
 */

export default function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                {/* Spinner cian con glow */}
                <div className="relative w-16 h-16 mx-auto mb-4">
                    <div
                        className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                        style={{
                            borderTopColor: "#00E5FF",
                            borderRightColor: "#00E5FF50",
                            animationDuration: "1s",
                        }}
                    />
                    <div
                        className="absolute inset-2 rounded-full border-2 border-transparent animate-spin"
                        style={{
                            borderBottomColor: "#8A2BE2",
                            borderLeftColor: "#8A2BE250",
                            animationDuration: "1.5s",
                            animationDirection: "reverse",
                        }}
                    />
                    <div
                        className="absolute inset-0 rounded-full"
                        style={{
                            boxShadow:
                                "0 0 15px rgba(0, 229, 255, 0.2), 0 0 30px rgba(0, 229, 255, 0.05)",
                        }}
                    />
                </div>

                {/* Texto de loading */}
                <p
                    className="text-xs font-mono tracking-[0.2em] uppercase"
                    style={{ color: "#00E5FF" }}
                >
                    Procesando flujo de datos...
                </p>
                <p className="text-[10px] text-foreground-muted mt-1 font-mono">
                    DNA SCANNER · INTEGRITY CHECK · FORENSIC VALIDATION
                </p>
            </div>
        </div>
    );
}
