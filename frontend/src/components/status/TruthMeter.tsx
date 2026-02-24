/**
 * BEACON PROTOCOL — Truth Meter (Medidor de Verdad)
 * ===================================================
 * Componente circular SVG que muestra el integrity_index
 * de una entidad evaluada por el Protocolo Beacon.
 *
 * - Color: #39FF14 (Neón Cyber) con glow dinámico
 * - Font: JetBrains Mono (score-display)
 * - Etiqueta: "AUDITADO POR BEACON PROTOCOL"
 *
 * El arco se llena proporcionalmente al porcentaje (0-100%).
 * A mayor integridad, mayor brillo del neon.
 */

"use client";

interface TruthMeterProps {
    /** Índice de integridad (0 a 100) */
    value: number;
    /** Tamaño del componente en px */
    size?: number;
}

export default function TruthMeter({ value, size = 200 }: TruthMeterProps) {
    const clampedValue = Math.min(100, Math.max(0, value));
    const radius = 80;
    const strokeWidth = 8;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (clampedValue / 100) * circumference;

    /** Color dinámico según porcentaje */
    const meterColor =
        clampedValue >= 70
            ? "#39FF14" // Neón Cyber — Alta integridad
            : clampedValue >= 40
                ? "#FFD700" // Gold — Integridad media
                : "#FF073A"; // Panic Red — Baja integridad

    /** Intensidad del glow según valor */
    const glowIntensity = Math.max(0.2, clampedValue / 100);

    return (
        <div className="flex flex-col items-center gap-3">
            {/* SVG Circular */}
            <div className="relative" style={{ width: size, height: size }}>
                <svg
                    width={size}
                    height={size}
                    viewBox="0 0 200 200"
                    className="transform -rotate-90"
                >
                    {/* Track de fondo */}
                    <circle
                        cx="100"
                        cy="100"
                        r={radius}
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.05)"
                        strokeWidth={strokeWidth}
                    />

                    {/* Arco de integridad */}
                    <circle
                        cx="100"
                        cy="100"
                        r={radius}
                        fill="none"
                        stroke={meterColor}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        style={{
                            transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)",
                            filter: `drop-shadow(0 0 ${6 * glowIntensity}px ${meterColor}80) drop-shadow(0 0 ${14 * glowIntensity}px ${meterColor}40)`,
                        }}
                    />

                    {/* Glow filter */}
                    <defs>
                        <filter id="truthGlow">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                </svg>

                {/* Score central */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span
                        className="text-4xl font-mono score-display font-black"
                        style={{
                            color: meterColor,
                            filter: `drop-shadow(0 0 8px ${meterColor}60)`,
                        }}
                    >
                        {clampedValue}
                    </span>
                    <span
                        className="text-[10px] font-mono uppercase tracking-wider mt-0.5"
                        style={{ color: `${meterColor}99` }}
                    >
                        %
                    </span>
                </div>
            </div>

            {/* Etiqueta de auditoría */}
            <div className="text-center">
                <p
                    className="text-[9px] tracking-[0.25em] uppercase font-bold"
                    style={{ color: meterColor }}
                >
                    Auditado por Beacon Protocol
                </p>
                <p className="text-[8px] text-foreground-muted mt-0.5 font-mono tracking-wider">
                    INTEGRITY INDEX · FORENSIC VALIDATED
                </p>
            </div>
        </div>
    );
}
