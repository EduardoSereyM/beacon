/**
 * BEACON PROTOCOL — Admin Audit Log Viewer (El Escriba)
 * =======================================================
 * Visor paginado con filtros del registro inmutable del sistema.
 * "Lo que entró al log, nunca sale."
 */

"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PAGE_SIZE = 50;

interface LogEntry {
    id: string;
    actor_id?: string;
    action?: string;
    entity_type?: string;
    entity_id?: string;
    details?: Record<string, unknown>;
    created_at?: string;
    _label?: string;
}

// ─── Color por tipo de acción ─────────────────────────────────────────────────
const ACTION_META: Record<string, { color: string; bg: string }> = {
    OVERLORD_ACTION_CREATE_ENTITY:  { color: "#39FF14", bg: "rgba(57,255,20,0.08)"   },
    OVERLORD_ACTION_UPDATE_ENTITY:  { color: "#00E5FF", bg: "rgba(0,229,255,0.08)"   },
    OVERLORD_ACTION_DELETE_ENTITY:  { color: "#FF073A", bg: "rgba(255,7,58,0.08)"    },
    OVERLORD_ACTION_UPLOAD_PHOTO:   { color: "#D4AF37", bg: "rgba(212,175,55,0.08)"  },
    USER_REGISTERED:                { color: "#B9F2FF", bg: "rgba(185,242,255,0.08)" },
    IDENTITY_REGISTRATION_ATTEMPT:  { color: "#888",    bg: "rgba(128,128,128,0.06)" },
    SHADOW_BAN_APPLIED:             { color: "#FF073A", bg: "rgba(255,7,58,0.08)"    },
    SHADOW_BAN_LIFTED:              { color: "#39FF14", bg: "rgba(57,255,20,0.08)"   },
    VOTE_SUBMITTED:                 { color: "#8A2BE2", bg: "rgba(138,43,226,0.08)"  },
    VOTE_SHADOW_FILTERED:           { color: "#FF8C00", bg: "rgba(255,140,0,0.08)"   },
    BRIGADE_DETECTED:               { color: "#FF073A", bg: "rgba(255,7,58,0.08)"    },
    RUT_VALIDATION_FAILED:          { color: "#FF8C00", bg: "rgba(255,140,0,0.08)"   },
    USER_RANK_CHANGED:              { color: "#D4AF37", bg: "rgba(212,175,55,0.08)"  },
    SECURITY_AUTH_DENIED:           { color: "#FF073A", bg: "rgba(255,7,58,0.08)"    },
};

function getActionMeta(action: string) {
    return ACTION_META[action] || { color: "#666", bg: "rgba(255,255,255,0.04)" };
}

function formatDate(iso: string): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-CL", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
}

function shortId(id: string): string {
    if (!id) return "—";
    if (["SYSTEM", "ANONYMOUS", "PANIC_GATE"].includes(id)) return id;
    return id.slice(0, 8) + "…";
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function AdminAuditLog() {
    const [logs, setLogs]           = useState<LogEntry[]>([]);
    const [total, setTotal]         = useState(0);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);
    const [page, setPage]           = useState(0);
    const [search, setSearch]       = useState("");
    const [filterAction, setFilter] = useState("");
    const [actions, setActions]     = useState<string[]>([]);
    const [expanded, setExpanded]   = useState<string | null>(null);

    const token = () => localStorage.getItem("beacon_token") || "";

    const fetchLogs = useCallback(async (p = 0, action = filterAction) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                limit:  String(PAGE_SIZE),
                offset: String(p * PAGE_SIZE),
            });
            if (action) params.set("action", action);

            const res = await fetch(`${API_URL}/api/v1/admin/audit-logs?${params}`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setLogs(data.logs  || []);
            setTotal(data.total || 0);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error cargando logs");
        } finally {
            setLoading(false);
        }
    }, [filterAction]);

    const fetchActions = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/audit-logs/actions`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            if (res.ok) {
                const data = await res.json();
                setActions(data.actions || []);
            }
        } catch { /* silencioso */ }
    }, []);

    useEffect(() => { fetchLogs(0); fetchActions(); }, [fetchLogs, fetchActions]);

    function applyFilter(action: string) {
        setFilter(action);
        setPage(0);
        fetchLogs(0, action);
    }

    function changePage(p: number) {
        setPage(p);
        fetchLogs(p);
        setExpanded(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    const filtered = search
        ? logs.filter(l => JSON.stringify(l).toLowerCase().includes(search.toLowerCase()))
        : logs;

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <div>
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: "#D4AF37" }}>
                        📜 Audit Log — El Escriba
                    </h1>
                    <p className="text-sm text-foreground-muted mt-1 font-mono">
                        Registro inmutable · {total.toLocaleString("es-CL")} entradas totales
                    </p>
                </div>
                <button
                    onClick={() => { setPage(0); fetchLogs(0); fetchActions(); }}
                    className="text-sm px-4 py-2 rounded-lg uppercase tracking-wider font-mono"
                    style={{ background: "rgba(212,175,55,0.08)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)" }}
                >
                    ↻ Refrescar
                </button>
            </div>

            {/* ── Filtros ─────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 mb-4">
                <input
                    type="text"
                    placeholder="Buscar en resultados actuales…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 min-w-48 text-sm rounded-lg px-4 py-2 outline-none"
                    style={{
                        backgroundColor: "rgba(255,255,255,0.03)",
                        color: "#e0e0e0",
                        border: "1px solid rgba(255,255,255,0.08)",
                    }}
                />
                <select
                    value={filterAction}
                    onChange={e => applyFilter(e.target.value)}
                    className="text-sm rounded-lg px-3 py-2 outline-none"
                    style={{
                        backgroundColor: "rgba(255,255,255,0.03)",
                        color: filterAction ? "#D4AF37" : "#888",
                        border: `1px solid ${filterAction ? "rgba(212,175,55,0.3)" : "rgba(255,255,255,0.08)"}`,
                    }}
                >
                    <option value="">Todas las acciones</option>
                    {actions.map(a => (
                        <option key={a} value={a}>{a}</option>
                    ))}
                </select>
            </div>

            {/* ── Contador ────────────────────────────────────────── */}
            <p className="text-xs text-foreground-muted font-mono mb-4">
                Pág {page + 1}/{totalPages || 1} · {filtered.length} de {total} registros
                {filterAction && <span style={{ color: "#D4AF37" }}> · filtro: {filterAction}</span>}
                {search      && <span style={{ color: "#00E5FF" }}> · búsqueda: &ldquo;{search}&rdquo;</span>}
            </p>

            {/* ── Contenido ───────────────────────────────────────── */}
            {loading ? (
                <div className="text-center py-20 text-foreground-muted animate-pulse text-sm font-mono">
                    Cargando registros…
                </div>
            ) : error ? (
                <div className="text-center py-20">
                    <p className="text-red-400 mb-4">{error}</p>
                    <button onClick={() => fetchLogs(0)} className="text-sm px-4 py-2 rounded-lg"
                        style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)" }}>
                        Reintentar
                    </button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl p-12 text-center"
                    style={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <p className="text-sm text-foreground-muted font-mono">
                        <span style={{ color: "#39FF14" }}>$ </span>
                        {search ? `Sin coincidencias para "${search}"` : "El Escriba espera las primeras acciones."}
                    </p>
                    {!search && (
                        <p className="text-xs text-foreground-muted mt-3">
                            Edita una entidad desde el panel admin para generar el primer registro.
                        </p>
                    )}
                </div>
            ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                    {/* Cabecera */}
                    <div className="grid gap-4 px-5 py-3"
                        style={{
                            gridTemplateColumns: "180px 1fr 120px 1fr 24px",
                            background: "rgba(212,175,55,0.06)",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}>
                        {["Fecha / Hora", "Acción", "Tipo entidad", "Actor / Entidad", ""].map(h => (
                            <span key={h} className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color: "#D4AF37" }}>
                                {h}
                            </span>
                        ))}
                    </div>

                    {filtered.map((log, idx) => {
                        const meta       = getActionMeta(log.action || "");
                        const isOpen     = expanded === log.id;
                        const details    = log.details || {};
                        const hasDetails = Object.keys(details).length > 0;

                        return (
                            <div key={log.id || idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                {/* Fila */}
                                <div
                                    className={`grid gap-4 px-5 py-3 transition-colors ${hasDetails ? "cursor-pointer hover:bg-white/[0.03]" : ""}`}
                                    style={{
                                        gridTemplateColumns: "180px 1fr 120px 1fr 24px",
                                        background: idx % 2 === 0 ? "rgba(17,17,17,0.7)" : "rgba(17,17,17,0.4)",
                                    }}
                                    onClick={() => hasDetails && setExpanded(isOpen ? null : log.id)}
                                >
                                    {/* Fecha */}
                                    <span className="text-sm font-mono text-foreground-muted self-center leading-tight">
                                        {formatDate(log.created_at || "")}
                                    </span>

                                    {/* Acción */}
                                    <div className="self-center">
                                        <span
                                            className="text-xs font-bold px-2 py-1 rounded font-mono"
                                            style={{
                                                color:      meta.color,
                                                background: meta.bg,
                                                border:     `1px solid ${meta.color}30`,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {log.action || "SIN ACCIÓN"}
                                        </span>
                                    </div>

                                    {/* Tipo de entidad */}
                                    <div className="self-center">
                                        <p className="text-sm font-mono text-foreground-muted">{log.entity_type || "—"}</p>
                                        {log._label && log._label !== "—" && (
                                            <p className="text-xs text-foreground truncate" title={log._label}>
                                                {log._label}
                                            </p>
                                        )}
                                    </div>

                                    {/* Actor / Entidad */}
                                    <div className="self-center">
                                        <p className="text-sm font-mono">
                                            <span style={{ color: "#555" }}>actor: </span>
                                            <span style={{ color: "#bbb" }}>{shortId(log.actor_id || "")}</span>
                                        </p>
                                        {log.entity_id && (
                                            <p className="text-xs font-mono text-foreground-muted">
                                                <span style={{ color: "#444" }}>id: </span>{shortId(log.entity_id)}
                                            </p>
                                        )}
                                    </div>

                                    {/* Expander */}
                                    <div className="self-center text-center">
                                        {hasDetails && (
                                            <span className="text-sm" style={{ color: "#555" }}>
                                                {isOpen ? "▲" : "▼"}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Detalle expandido */}
                                {isOpen && (
                                    <div className="px-6 py-4"
                                        style={{ background: "rgba(0,0,0,0.45)", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                        <p className="text-xs font-mono mb-2" style={{ color: "#D4AF37" }}>Details</p>
                                        <pre
                                            className="text-xs rounded-lg p-4 overflow-auto max-h-64 leading-relaxed"
                                            style={{ background: "rgba(0,0,0,0.5)", color: "#ccc", border: "1px solid rgba(255,255,255,0.06)" }}
                                        >
                                            {JSON.stringify(details, null, 2)}
                                        </pre>
                                        <div className="flex flex-wrap gap-6 mt-3 text-xs font-mono text-foreground-muted">
                                            <span><span style={{ color: "#555" }}>ID log: </span>{log.id}</span>
                                            <span><span style={{ color: "#555" }}>Actor: </span>{log.actor_id}</span>
                                            <span><span style={{ color: "#555" }}>Entity ID: </span>{log.entity_id}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Paginación ──────────────────────────────────────── */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-6">
                    <button
                        disabled={page === 0}
                        onClick={() => changePage(page - 1)}
                        className="text-sm px-4 py-2 rounded-lg font-mono disabled:opacity-30"
                        style={{ background: "rgba(255,255,255,0.05)", color: "#aaa", border: "1px solid rgba(255,255,255,0.08)" }}
                    >← Anterior</button>

                    <span className="text-sm font-mono text-foreground-muted">
                        {page + 1} / {totalPages}
                    </span>

                    <button
                        disabled={page >= totalPages - 1}
                        onClick={() => changePage(page + 1)}
                        className="text-sm px-4 py-2 rounded-lg font-mono disabled:opacity-30"
                        style={{ background: "rgba(255,255,255,0.05)", color: "#aaa", border: "1px solid rgba(255,255,255,0.08)" }}
                    >Siguiente →</button>
                </div>
            )}
        </div>
    );
}
