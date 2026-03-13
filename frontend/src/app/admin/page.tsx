/**
 * BEACON PROTOCOL — Sovereign Dashboard (Overlord HQ)
 * =====================================================
 * Panel de control con métricas reales desde la BBDD.
 * Consulta GET /api/v1/admin/stats (protegido por require_admin_role).
 *
 * Secciones:
 *   1. KPIs principales (6 tarjetas)
 *   2. Desglose por categoría de entidad
 *   3. Usuarios por rango (con barra de progreso)
 *   4. Top 5 entidades por score y por votos
 *   5. Terminal de audit logs recientes
 *   6. Acciones rápidas
 *
 * "Desde aquí se controla la integridad de la República."
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface TopEntity {
    id: string;
    name: string;
    score: number;
    reviews: number;
    photo?: string;
    category?: string;
}

interface AuditEntry {
    id: string;
    action: string;
    table_name: string;
    label: string;
    created_at: string;
}

interface Stats {
    total_entities: number;
    active_entities: number;
    inactive_entities: number;
    total_users: number;
    total_votes: number;
    shadow_banned: number;
    by_category: Record<string, number>;
    by_rank: Record<string, number>;
    top_by_score: TopEntity[];
    top_by_reviews: TopEntity[];
    recent_audit: AuditEntry[];
}

// ─── Helpers visuales ────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
    politico:   "🏛️ Político",
    periodista: "📰 Periodista",
    empresario: "💼 Empresario",
    empresa:    "🏢 Empresa",
    evento:     "📅 Evento",
    artista:    "🎤 Artista",
};

const RANK_META: Record<string, { color: string; label: string }> = {
    VERIFIED:  { color: "#C0C0C0", label: "✔ Verified" },
    BASIC:     { color: "#aaaaaa", label: "○ Basic" },
    DISPLACED: { color: "#FF073A", label: "🚫 Displaced" },
};

const ACTION_COLOR: Record<string, string> = {
    INSERT: "#39FF14",
    UPDATE: "#00E5FF",
    DELETE: "#FF073A",
};

function scoreColor(score: number): string {
    if (score >= 4)   return "#39FF14";
    if (score >= 3)   return "#D4AF37";
    if (score >= 2)   return "#FF8C00";
    return "#FF073A";
}

function formatDate(iso: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("es-CL", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
}

function MiniAvatar({ photo, name }: { photo?: string; name: string }) {
    return photo ? (
        <img
            src={photo}
            alt={name}
            style={{
                width: 28, height: 28, borderRadius: "50%",
                objectFit: "cover", flexShrink: 0,
                border: "1px solid rgba(212,175,55,0.3)",
            }}
        />
    ) : (
        <div style={{
            width: 28, height: 28, borderRadius: "50%",
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0, fontSize: 12,
        }}>👤</div>
    );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function AdminDashboard() {
    const [stats, setStats]     = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchStats = useCallback(async () => {
        const token = localStorage.getItem("beacon_token");
        if (!token) { setError("Sin token de autenticación"); setLoading(false); return; }

        try {
            const res = await fetch(`${API_URL}/api/v1/admin/stats`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: Stats = await res.json();
            setStats(data);
            setLastUpdated(new Date());
            setError(null);
        } catch (err) {
            setError("Error cargando métricas del sistema");
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    // ─── Loading / error ──────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="text-center">
                <div className="text-2xl mb-2 animate-pulse">⚙️</div>
                <p className="text-xs font-mono text-foreground-muted">Cargando métricas del sistema…</p>
            </div>
        </div>
    );

    if (error && !stats) return (
        <div className="flex items-center justify-center h-64">
            <div className="text-center">
                <p className="text-sm text-red-400 mb-3">{error}</p>
                <button onClick={fetchStats} className="text-xs px-4 py-2 rounded-lg"
                    style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)" }}>
                    Reintentar
                </button>
            </div>
        </div>
    );

    const s = stats!;
    const totalRankUsers = Object.values(s.by_rank).reduce((a, b) => a + b, 0) || 1;

    return (
        <div className="space-y-8">

            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#D4AF37" }}>
                        Sovereign Dashboard
                    </h1>
                    <p className="text-xs text-foreground-muted mt-1 font-mono">
                        Panel de control del Overlord — Sistema Beacon Protocol v1.0
                    </p>
                </div>
                <div className="text-right">
                    <button
                        onClick={fetchStats}
                        className="text-[9px] px-3 py-1.5 rounded-lg uppercase tracking-wider font-mono transition-all"
                        style={{ background: "rgba(212,175,55,0.08)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.15)" }}
                    >
                        ↻ Actualizar
                    </button>
                    {lastUpdated && (
                        <p className="text-[9px] text-foreground-muted mt-1 font-mono">
                            Última sync: {lastUpdated.toLocaleTimeString("es-CL")}
                        </p>
                    )}
                </div>
            </div>

            {/* ── KPIs principales (6 tarjetas) ──────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                    { label: "Entidades Activas",   value: s.active_entities,   color: "#00E5FF", icon: "⚖️",  sub: `${s.inactive_entities} inactivas` },
                    { label: "Usuarios Registrados",value: s.total_users,        color: "#D4AF37", icon: "👥",  sub: `${s.shadow_banned} shadow banned` },
                    { label: "Votos Procesados",     value: s.total_votes,        color: "#39FF14", icon: "🗳️",  sub: s.total_entities > 0 ? `~${(s.total_votes / s.total_entities).toFixed(1)} por entidad` : "" },
                    { label: "Shadow Banned",        value: s.shadow_banned,      color: "#FF073A", icon: "🚫",  sub: s.total_users > 0 ? `${((s.shadow_banned / s.total_users) * 100).toFixed(1)}% del total` : "" },
                    { label: "Total Entidades",      value: s.total_entities,     color: "#B9F2FF", icon: "🏛️",  sub: `${s.active_entities} activas` },
                    { label: "Categorías",           value: Object.keys(s.by_category).length, color: "#FF8C00", icon: "📂", sub: `tipos distintos` },
                ].map((stat) => (
                    <div
                        key={stat.label}
                        className="rounded-xl p-4"
                        style={{ background: "rgba(17,17,17,0.8)", border: `1px solid ${stat.color}18` }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-base">{stat.icon}</span>
                            <span className="text-xl font-mono font-bold" style={{ color: stat.color }}>
                                {stat.value.toLocaleString("es-CL")}
                            </span>
                        </div>
                        <p className="text-[9px] text-foreground-muted uppercase tracking-wider leading-tight">
                            {stat.label}
                        </p>
                        {stat.sub && (
                            <p className="text-[9px] mt-1 font-mono" style={{ color: stat.color, opacity: 0.6 }}>
                                {stat.sub}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {/* ── Fila central: Categorías + Rangos ──────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Desglose por categoría */}
                <div className="rounded-xl p-5" style={{ background: "rgba(17,17,17,0.8)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <h2 className="text-[10px] uppercase tracking-wider font-mono mb-4" style={{ color: "#D4AF37" }}>
                        📂 Entidades por Categoría
                    </h2>
                    <div className="space-y-3">
                        {Object.entries(s.by_category).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
                            const pct = Math.round((count / s.active_entities) * 100) || 0;
                            return (
                                <div key={cat}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[11px] text-foreground-muted">
                                            {CATEGORY_LABELS[cat] || cat}
                                        </span>
                                        <span className="text-[11px] font-mono text-foreground">
                                            {count} <span className="text-foreground-muted">({pct}%)</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                                        <div
                                            className="h-1.5 rounded-full transition-all duration-700"
                                            style={{ width: `${pct}%`, background: "linear-gradient(90deg, #D4AF37, #00E5FF)" }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        {Object.keys(s.by_category).length === 0 && (
                            <p className="text-[10px] text-foreground-muted font-mono">Sin datos de categoría</p>
                        )}
                    </div>
                </div>

                {/* Usuarios por rango */}
                <div className="rounded-xl p-5" style={{ background: "rgba(17,17,17,0.8)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <h2 className="text-[10px] uppercase tracking-wider font-mono mb-4" style={{ color: "#D4AF37" }}>
                        👥 Ciudadanos por Rango
                    </h2>
                    <div className="space-y-3">
                        {["VERIFIED", "BASIC", "DISPLACED"].map((rank) => {
                            const count = s.by_rank[rank] || 0;
                            const pct   = Math.round((count / totalRankUsers) * 100);
                            const meta  = RANK_META[rank];
                            return (
                                <div key={rank}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[11px]" style={{ color: meta.color }}>
                                            {meta.label}
                                        </span>
                                        <span className="text-[11px] font-mono text-foreground">
                                            {count} <span className="text-foreground-muted">({pct}%)</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                                        <div
                                            className="h-1.5 rounded-full transition-all duration-700"
                                            style={{ width: `${pct}%`, backgroundColor: meta.color, opacity: 0.7 }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        {s.total_users === 0 && (
                            <p className="text-[10px] text-foreground-muted font-mono">Sin usuarios registrados</p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Top Entidades ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Top 5 por Score */}
                <div className="rounded-xl p-5" style={{ background: "rgba(17,17,17,0.8)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <h2 className="text-[10px] uppercase tracking-wider font-mono mb-4" style={{ color: "#39FF14" }}>
                        🏆 Top 5 por Score de Integridad
                    </h2>
                    <div className="space-y-2">
                        {s.top_by_score.length === 0 ? (
                            <p className="text-[10px] text-foreground-muted font-mono">Sin datos</p>
                        ) : s.top_by_score.map((e, i) => (
                            <Link href={`/entities/${e.id}`} key={e.id}
                                className="flex items-center gap-3 p-2 rounded-lg transition-all duration-150 hover:bg-white/5"
                            >
                                <span className="text-[10px] font-mono w-4 text-foreground-muted">#{i + 1}</span>
                                <MiniAvatar photo={e.photo} name={e.name} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-foreground font-medium truncate">{e.name}</p>
                                    <p className="text-[9px] text-foreground-muted capitalize">{CATEGORY_LABELS[e.category || ""] || e.category}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[12px] font-mono font-bold" style={{ color: scoreColor(e.score) }}>
                                        {e.score.toFixed(2)}
                                    </p>
                                    <p className="text-[9px] text-foreground-muted">{e.reviews} votos</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Top 5 por Votos */}
                <div className="rounded-xl p-5" style={{ background: "rgba(17,17,17,0.8)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <h2 className="text-[10px] uppercase tracking-wider font-mono mb-4" style={{ color: "#00E5FF" }}>
                        🗳️ Top 5 por Votos Recibidos
                    </h2>
                    <div className="space-y-2">
                        {s.top_by_reviews.length === 0 ? (
                            <p className="text-[10px] text-foreground-muted font-mono">Sin datos</p>
                        ) : s.top_by_reviews.map((e, i) => (
                            <Link href={`/entities/${e.id}`} key={e.id}
                                className="flex items-center gap-3 p-2 rounded-lg transition-all duration-150 hover:bg-white/5"
                            >
                                <span className="text-[10px] font-mono w-4 text-foreground-muted">#{i + 1}</span>
                                <MiniAvatar photo={e.photo} name={e.name} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-foreground font-medium truncate">{e.name}</p>
                                    <p className="text-[9px] text-foreground-muted capitalize">{CATEGORY_LABELS[e.category || ""] || e.category}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[12px] font-mono font-bold" style={{ color: "#00E5FF" }}>
                                        {e.reviews.toLocaleString("es-CL")}
                                    </p>
                                    <p className="text-[9px] text-foreground-muted">score {e.score.toFixed(2)}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Terminal de Audit Logs ──────────────────────────────── */}
            <div className="rounded-xl p-5"
                style={{ background: "rgba(8,8,8,0.95)", border: "1px solid rgba(255,255,255,0.04)", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                <h2 className="text-[10px] uppercase tracking-wider mb-4" style={{ color: "#D4AF37" }}>
                    $ Últimas Acciones del Overlord (Audit Log)
                </h2>
                {s.recent_audit.length === 0 ? (
                    <p className="text-[10px] text-foreground-muted">
                        <span style={{ color: "#39FF14" }}>$</span> No hay acciones recientes. El Escriba espera registros.
                    </p>
                ) : (
                    <div className="space-y-1.5">
                        {s.recent_audit.map((log) => (
                            <div key={log.id} className="flex items-start gap-3 text-[10px]">
                                <span style={{ color: "#39FF14", flexShrink: 0 }}>›</span>
                                <span className="font-bold uppercase" style={{ color: ACTION_COLOR[log.action] || "#888", flexShrink: 0, minWidth: 42 }}>
                                    {log.action}
                                </span>
                                <span style={{ color: "#888", flexShrink: 0 }}>{log.table_name}</span>
                                <span className="text-foreground flex-1 truncate">{log.label || "—"}</span>
                                <span style={{ color: "#555", flexShrink: 0 }}>{formatDate(log.created_at)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Acciones rápidas ────────────────────────────────────── */}
            <div>
                <h2 className="text-[10px] uppercase tracking-wider text-foreground-muted font-mono mb-3">
                    Acciones Rápidas
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                        { href: "/admin/entities",   icon: "⚖️",  label: "Gestión de Entidades", desc: "Crear, editar y desactivar entidades",        active: true },
                        { href: "/admin/dimensions", icon: "🎚️", label: "Dimensiones",           desc: "Criterios de evaluación por categoría",       active: true },
                        { href: "/admin/versus",     icon: "⚔️",  label: "Arena VS",              desc: "Crear y gestionar enfrentamientos VS",        active: true },
                        { href: "/admin/polls",      icon: "📊",  label: "Encuestas",             desc: "Crear y gestionar encuestas ciudadanas",      active: true },
                        { href: "/admin/events",     icon: "📡",  label: "Eventos",               desc: "Crear eventos y gestionar participantes",     active: true },
                        { href: "/admin/audit",      icon: "📜",  label: "Audit Log",             desc: "Registro inmutable de acciones del sistema",  active: true },
                        { href: "#",                 icon: "🧬",  label: "DNA Scanner",           desc: "Próximamente — Monitor HUMAN/SUSPICIOUS",     active: false },
                    ].map((item) => (
                        item.active ? (
                            <Link
                                key={item.label}
                                href={item.href}
                                className="rounded-xl p-4 flex items-center gap-4 transition-all duration-200"
                                style={{ background: "rgba(17,17,17,0.6)", border: "1px solid rgba(212,175,55,0.1)" }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,55,0.35)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,55,0.1)";  e.currentTarget.style.transform = "translateY(0)"; }}
                            >
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{ background: "rgba(212,175,55,0.1)" }}>
                                    <span className="text-lg">{item.icon}</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                                    <p className="text-[10px] text-foreground-muted">{item.desc}</p>
                                </div>
                            </Link>
                        ) : (
                            <div
                                key={item.label}
                                className="rounded-xl p-4 flex items-center gap-4 opacity-40 cursor-not-allowed"
                                style={{ background: "rgba(17,17,17,0.6)", border: "1px solid rgba(255,255,255,0.03)" }}
                            >
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{ background: "rgba(255,255,255,0.03)" }}>
                                    <span className="text-lg">{item.icon}</span>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                                    <p className="text-[10px] text-foreground-muted">{item.desc}</p>
                                </div>
                            </div>
                        )
                    ))}
                </div>
            </div>

        </div>
    );
}
