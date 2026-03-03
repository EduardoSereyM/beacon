/**
 * BEACON PROTOCOL — Admin Dashboard (Sovereign Dashboard)
 * =========================================================
 * Panel principal del Overlord con métricas del sistema.
 *
 * "Desde aquí se controla la integridad de la República."
 */

"use client";

import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        totalEntities: 0,
        activeEntities: 0,
    });

    useEffect(() => {
        const token = localStorage.getItem("beacon_token");
        if (!token) return;

        const fetchStats = async () => {
            try {
                const res = await fetch(`${API_URL}/api/v1/entities?limit=200`);
                if (res.ok) {
                    const data = await res.json();
                    setStats({
                        totalEntities: data.total || 0,
                        activeEntities: data.total || 0,
                    });
                }
            } catch (err) {
                console.error("Error cargando stats:", err);
            }
        };
        fetchStats();
    }, []);

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <h1
                    className="text-2xl font-bold tracking-tight"
                    style={{ color: "#D4AF37" }}
                >
                    Sovereign Dashboard
                </h1>
                <p className="text-xs text-foreground-muted mt-1 font-mono">
                    Panel de control del Overlord — Sistema Beacon Protocol v1.0
                </p>
            </div>

            {/* Métricas principales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                    { label: "Entidades Activas", value: stats.activeEntities, color: "#00E5FF", icon: "⚖️" },
                    { label: "Usuarios Registrados", value: 0, color: "#D4AF37", icon: "👥" },
                    { label: "Votos Procesados", value: 0, color: "#39FF14", icon: "🗳️" },
                    { label: "Alertas de Seguridad", value: 0, color: "#FF073A", icon: "🚨" },
                ].map((stat) => (
                    <div
                        key={stat.label}
                        className="rounded-xl p-4"
                        style={{
                            background: "rgba(17, 17, 17, 0.8)",
                            border: `1px solid ${stat.color}15`,
                        }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-lg">{stat.icon}</span>
                            <span
                                className="text-2xl font-mono font-bold"
                                style={{ color: stat.color }}
                            >
                                {stat.value.toLocaleString()}
                            </span>
                        </div>
                        <p className="text-[10px] text-foreground-muted uppercase tracking-wider">
                            {stat.label}
                        </p>
                    </div>
                ))}
            </div>

            {/* Accesos rápidos */}
            <div className="mb-8">
                <h2 className="text-xs uppercase tracking-wider text-foreground-muted font-mono mb-4">
                    Acciones Rápidas
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <a
                        href="/admin/entities"
                        className="rounded-xl p-4 flex items-center gap-4 transition-all duration-200"
                        style={{
                            background: "rgba(17, 17, 17, 0.6)",
                            border: "1px solid rgba(212, 175, 55, 0.1)",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "rgba(212, 175, 55, 0.3)";
                            e.currentTarget.style.transform = "translateY(-2px)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "rgba(212, 175, 55, 0.1)";
                            e.currentTarget.style.transform = "translateY(0)";
                        }}
                    >
                        <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: "rgba(212, 175, 55, 0.1)" }}
                        >
                            <span className="text-lg">⚖️</span>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-foreground">Gestión de Entidades</p>
                            <p className="text-[10px] text-foreground-muted">
                                Crear, editar y desactivar políticos, empresas y personajes
                            </p>
                        </div>
                    </a>

                    <div
                        className="rounded-xl p-4 flex items-center gap-4 opacity-50 cursor-not-allowed"
                        style={{
                            background: "rgba(17, 17, 17, 0.6)",
                            border: "1px solid rgba(255, 255, 255, 0.03)",
                        }}
                    >
                        <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: "rgba(255, 255, 255, 0.03)" }}
                        >
                            <span className="text-lg">📊</span>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-foreground">Terminal de Amenazas</p>
                            <p className="text-[10px] text-foreground-muted">
                                Próximamente — Monitor de bots y brigadas
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Terminal de actividad */}
            <div>
                <h2 className="text-xs uppercase tracking-wider text-foreground-muted font-mono mb-4">
                    Últimas Acciones del Overlord
                </h2>
                <div
                    className="rounded-xl p-4"
                    style={{
                        background: "rgba(10, 10, 10, 0.9)",
                        border: "1px solid rgba(255, 255, 255, 0.03)",
                        fontFamily: "'JetBrains Mono', monospace",
                    }}
                >
                    <p className="text-[10px] text-foreground-muted">
                        <span style={{ color: "#39FF14" }}>$</span> No hay acciones recientes.
                        El Escriba espera registros del Overlord.
                    </p>
                </div>
            </div>
        </div>
    );
}
