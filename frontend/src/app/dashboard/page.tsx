/**
 * BEACON PROTOCOL — Sovereign Dashboard (Panel del Overlord)
 * ===========================================================
 * Dashboard principal del sistema Beacon con:
 *   - Semáforo de seguridad vinculado a security_level
 *   - Métricas en tiempo real (JetBrains Mono)
 *   - Efecto de emergencia global en modo RED
 *   - Contraste visual Élite vs Desplazados
 *
 * En modo RED:
 *   - backdrop-blur sobre todo el dashboard
 *   - border rojo animado pulsante
 *   - vignette de peligro perimetral
 *
 * "El Overlord ve todo. El dashboard refleja la verdad."
 */

"use client";

import { useState } from "react";
import SecuritySemaphore from "@/components/status/SecuritySemaphore";

type SecurityLevel = "GREEN" | "YELLOW" | "RED";

export default function SovereignDashboard() {
    const [securityLevel, setSecurityLevel] = useState<SecurityLevel>("GREEN");

    /** Clases dinámicas según el estado de seguridad */
    const dashboardClasses = [
        "min-h-screen p-6 transition-all duration-700",
        securityLevel === "RED" ? "panic-border panic-overlay panic-vignette" : "",
    ].join(" ");

    /** Color del borde según estado */
    const borderStyle =
        securityLevel === "RED"
            ? { borderColor: "#FF0000" }
            : securityLevel === "YELLOW"
                ? { borderColor: "#FFD70030" }
                : {};

    return (
        <div className={dashboardClasses} style={borderStyle}>
            {/* ─── Header Overlord ─── */}
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        <span className="neon-overlord" style={{ color: "#8A2BE2" }}>
                            ⚔️
                        </span>{" "}
                        Sovereign Dashboard
                    </h1>
                    <p className="text-xs text-foreground-muted mt-1">
                        Panel de Control del Protocolo Beacon — Overlord Access
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-foreground-muted tracking-wider uppercase">
                        PROTOCOL v1.0
                    </span>
                    <div
                        className="w-2 h-2 rounded-full pulse-live"
                        style={{ backgroundColor: securityLevel === "RED" ? "#FF0000" : securityLevel === "YELLOW" ? "#FFD700" : "#00FF41" }}
                    />
                </div>
            </header>

            {/* ─── Grid Principal ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Columna 1: Semáforo + Estado */}
                <div className="space-y-6">
                    <SecuritySemaphore
                        level={securityLevel}
                        onLevelChange={setSecurityLevel}
                        showControls={true}
                    />

                    {/* Threat Level Meter */}
                    <div className="glass rounded-xl p-5">
                        <h3 className="text-[10px] tracking-[0.2em] uppercase text-foreground-muted mb-3">
                            Threat Assessment
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-xs text-foreground-muted">Anomaly Rate</span>
                                    <span className="text-xs font-mono score-display" style={{ color: "#00FF41" }}>
                                        2.3%
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-beacon-border rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000"
                                        style={{ width: "23%", backgroundColor: "#00FF41" }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-xs text-foreground-muted">Bot Detection</span>
                                    <span className="text-xs font-mono score-display" style={{ color: "#00E5FF" }}>
                                        14 blocked
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-beacon-border rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000"
                                        style={{ width: "14%", backgroundColor: "#00E5FF" }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-xs text-foreground-muted">Shadow Banned</span>
                                    <span className="text-xs font-mono score-display" style={{ color: "#FF073A" }}>
                                        7 silenced
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-beacon-border rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000"
                                        style={{ width: "7%", backgroundColor: "#FF073A" }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Columna 2: Métricas del Motor */}
                <div className="space-y-6">
                    {/* Integrity Score Global */}
                    <div className="elite-card rounded-xl p-5 neon-gold">
                        <h3 className="text-[10px] tracking-[0.2em] uppercase text-beacon-gold mb-2">
                            Global Integrity Score
                        </h3>
                        <div className="flex items-end gap-2">
                            <span className="text-5xl font-mono score-display text-beacon-gold">
                                4.21
                            </span>
                            <span className="text-xs text-foreground-muted mb-2">/ 5.00</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded badge-gold">CONFIABLE</span>
                            <span className="text-[10px] text-foreground-muted">m=30, C=3.0</span>
                        </div>
                    </div>

                    {/* Ciudadanos por Rango */}
                    <div className="glass rounded-xl p-5">
                        <h3 className="text-[10px] tracking-[0.2em] uppercase text-foreground-muted mb-4">
                            Ciudadanos por Rango
                        </h3>
                        <div className="space-y-3">
                            {[
                                { rank: "DIAMOND", count: 3, color: "#b9f2ff", badge: "badge-diamond", neon: "neon-diamond" },
                                { rank: "GOLD", count: 47, color: "#D4AF37", badge: "badge-gold", neon: "neon-gold" },
                                { rank: "SILVER", count: 312, color: "#C0C0C0", badge: "badge-silver", neon: "" },
                                { rank: "BRONZE", count: 1284, color: "#cd7f32", badge: "badge-bronze", neon: "" },
                            ].map((tier) => (
                                <div key={tier.rank} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] px-2 py-0.5 rounded ${tier.badge} ${tier.neon}`}>
                                            {tier.rank}
                                        </span>
                                    </div>
                                    <span
                                        className="text-sm font-mono score-display"
                                        style={{ color: tier.color }}
                                    >
                                        {tier.count.toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-beacon-border flex justify-between">
                            <span className="text-xs text-foreground-muted">Total Activos</span>
                            <span className="text-sm font-mono score-display text-foreground">
                                1,646
                            </span>
                        </div>
                    </div>
                </div>

                {/* Columna 3: Contrastes Élite vs Desplazados */}
                <div className="space-y-6">
                    {/* Tarjeta Élite (brillo máximo) */}
                    <div className="elite-card rounded-xl p-5 glow-gold">
                        <h3 className="text-[10px] tracking-[0.2em] uppercase text-beacon-gold mb-3">
                            🥇 Top Ciudadano — Élite
                        </h3>
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center neon-gold"
                                style={{ background: "linear-gradient(135deg, #d4af37, #f5d374)" }}
                            >
                                <span className="text-beacon-black font-bold text-sm">AS</span>
                            </div>
                            <div>
                                <p className="text-sm font-semibold">Andrea Sotomayor</p>
                                <p className="text-[10px] text-foreground-muted">
                                    Integrity: <span className="text-beacon-gold font-mono">0.94</span> ·
                                    Valor: <span className="text-beacon-gold font-mono">$412.50</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta Desplazado (vacío, fantasma) */}
                    <div className="displaced-box rounded-xl p-5">
                        <h3 className="text-[10px] tracking-[0.2em] uppercase displaced-text mb-3">
                            👻 Usuario Desplazado — Shadow Mode
                        </h3>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-beacon-border flex items-center justify-center opacity-40">
                                <span className="text-foreground-muted text-sm">??</span>
                            </div>
                            <div>
                                <p className="text-sm displaced-text">Identidad no verificada</p>
                                <p className="text-[10px] displaced-text">
                                    Integrity: <span className="font-mono">0.12</span> ·
                                    Valor: <span className="font-mono">$0.14</span> ·
                                    Votos: <span className="font-mono">silenciados</span>
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-beacon-border border-opacity-10">
                            <p className="text-[9px] displaced-text italic">
                                &quot;Tus votos se registran pero no afectan el ranking público.
                                Verifica tu identidad para ascender.&quot;
                            </p>
                        </div>
                    </div>

                    {/* Asset Valuation */}
                    <div className="glass rounded-xl p-5">
                        <h3 className="text-[10px] tracking-[0.2em] uppercase text-foreground-muted mb-3">
                            💵 Asset Valuation — Base de Datos
                        </h3>
                        <div className="flex items-end gap-2">
                            <span className="text-3xl font-mono score-display" style={{ color: "#00FF41" }}>
                                $47,230
                            </span>
                            <span className="text-xs text-foreground-muted mb-1">USD</span>
                        </div>
                        <p className="text-[10px] text-foreground-muted mt-2">
                            Valor proyectado de 1,646 ciudadanos verificados
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="bg-beacon-dark rounded p-2">
                                <span className="text-[9px] text-foreground-muted block">RUT Verificados</span>
                                <span className="text-sm font-mono" style={{ color: "#C0C0C0" }}>362</span>
                            </div>
                            <div className="bg-beacon-dark rounded p-2">
                                <span className="text-[9px] text-foreground-muted block">Data Bonus</span>
                                <span className="text-sm font-mono" style={{ color: "#00E5FF" }}>+$1,810</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Footer de Estado ─── */}
            <footer className="mt-8 pt-4 border-t border-beacon-border flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-[10px] text-foreground-muted font-mono">
                        BAYESIAN: m=30 C=3.0 V=√(N/100)
                    </span>
                    <span className="text-[10px] text-foreground-muted">·</span>
                    <span className="text-[10px] text-foreground-muted font-mono">
                        SHADOW_BAN_THRESHOLD: 0.2
                    </span>
                </div>
                <span
                    className="text-[10px] font-mono tracking-wider"
                    style={{ color: "#8A2BE2" }}
                >
                    OVERLORD ACCESS GRANTED
                </span>
            </footer>
        </div>
    );
}
