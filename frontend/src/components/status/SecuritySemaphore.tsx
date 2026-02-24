/**
 * BEACON PROTOCOL — Security Semaphore (Semáforo del Búnker)
 * ============================================================
 * Componente visual que refleja el estado de seguridad global
 * del sistema Beacon directamente desde la variable security_level
 * del Panic Gate (panic_gate_extreme.py → Redis).
 *
 * Estados:
 *   🟢 GREEN  → #00FF41  → Operación normal, filtros estándar
 *   🟡 YELLOW → #FFD700  → Alerta moderada, CAPTCHA selectivo
 *   🔴 RED    → #FF0000  → Emergencia total, CAPTCHA global
 *
 * "El semáforo no miente. Si es rojo, el búnker está cerrado."
 */

"use client";



/** Tipo para los 3 estados de seguridad del Panic Gate */
type SecurityLevel = "GREEN" | "YELLOW" | "RED";

/** Configuración visual de cada estado */
const LEVEL_CONFIG = {
    GREEN: {
        color: "#00FF41",
        label: "OPERACIÓN NORMAL",
        description: "Filtros estándar activos. Sistema estable.",
        glowClass: "glow-green",
        animClass: "semaphore-active",
        icon: "🟢",
    },
    YELLOW: {
        color: "#FFD700",
        label: "ALERTA MODERADA",
        description: "CAPTCHA selectivo activado. Anomalía detectada.",
        glowClass: "glow-yellow",
        animClass: "semaphore-active",
        icon: "🟡",
    },
    RED: {
        color: "#FF0000",
        label: "EMERGENCIA TOTAL",
        description: "CAPTCHA global. IPs de Data Centers bloqueadas.",
        glowClass: "glow-red",
        animClass: "semaphore-urgent",
        icon: "🔴",
    },
};

interface SecuritySemaphoreProps {
    /** Estado actual de seguridad (default: GREEN) */
    level: SecurityLevel;
    /** Callback cuando se cambia el estado (solo Overlord) */
    onLevelChange?: (level: SecurityLevel) => void;
    /** Mostrar controles del Overlord */
    showControls?: boolean;
}

export default function SecuritySemaphore({
    level,
    onLevelChange,
    showControls = false,
}: SecuritySemaphoreProps) {
    const config = LEVEL_CONFIG[level];

    return (
        <div className="glass rounded-xl p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] tracking-[0.2em] uppercase text-foreground-muted">
                    Security Level
                </h3>
                <span
                    className="text-xs font-mono score-display"
                    style={{ color: config.color }}
                >
                    {config.icon} {level}
                </span>
            </div>

            {/* Semáforo Visual (3 LEDs) */}
            <div className="flex items-center justify-center gap-3 mb-4">
                {(["GREEN", "YELLOW", "RED"] as SecurityLevel[]).map((lvl) => {
                    const isActive = lvl === level;
                    const ledColor = LEVEL_CONFIG[lvl].color;

                    return (
                        <div
                            key={lvl}
                            className={`relative rounded-full transition-all duration-500 ${isActive ? "w-8 h-8" : "w-5 h-5"
                                }`}
                            style={{
                                backgroundColor: isActive ? ledColor : `${ledColor}15`,
                                boxShadow: isActive
                                    ? `0 0 12px ${ledColor}66, 0 0 24px ${ledColor}33, 0 0 48px ${ledColor}1A`
                                    : "none",
                            }}
                        >
                            {/* Halo pulsante para el LED activo */}
                            {isActive && (
                                <div
                                    className={`absolute inset-0 rounded-full ${lvl === "RED" ? "semaphore-urgent" : "semaphore-active"
                                        }`}
                                    style={{
                                        backgroundColor: `${ledColor}30`,
                                        transform: "scale(1.5)",
                                    }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Estado Actual */}
            <div className="text-center">
                <p
                    className="text-sm font-bold tracking-wider uppercase"
                    style={{ color: config.color }}
                >
                    {config.label}
                </p>
                <p className="text-xs text-foreground-muted mt-1">
                    {config.description}
                </p>
            </div>

            {/* Controles Overlord (solo si showControls = true) */}
            {showControls && onLevelChange && (
                <div className="mt-4 pt-3 border-t border-beacon-border">
                    <p className="text-[9px] text-beacon-purple tracking-[0.2em] uppercase mb-2 text-center">
                        Overlord Controls
                    </p>
                    <div className="flex gap-2 justify-center">
                        {(["GREEN", "YELLOW", "RED"] as SecurityLevel[]).map((lvl) => (
                            <button
                                key={lvl}
                                onClick={() => onLevelChange(lvl)}
                                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all
                  ${lvl === level
                                        ? "ring-2 ring-offset-1 ring-offset-beacon-black"
                                        : "opacity-50 hover:opacity-80"
                                    }`}
                                style={{
                                    backgroundColor: `${LEVEL_CONFIG[lvl].color}20`,
                                    color: LEVEL_CONFIG[lvl].color,
                                    border: `1px solid ${LEVEL_CONFIG[lvl].color}40`,
                                }}
                            >
                                {lvl}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
