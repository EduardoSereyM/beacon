/**
 * BEACON PROTOCOL — Admin Logs Viewer (El Escriba)
 * ==================================================
 * Visor paginado del audit_log del sistema.
 * Solo lectura. El Escriba no edita, solo muestra.
 *
 * "Lo que entró al log, nunca sale."
 */

"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface LogEntry {
    id: string;
    [key: string]: unknown;
}

const ACTION_COLOR: Record<string, string> = {
    // Acciones de entidades
    OVERLORD_ACTION_CREATE_ENTITY:   "#39FF14",
    OVERLORD_ACTION_UPDATE_ENTITY:   "#00E5FF",
    OVERLORD_ACTION_DELETE_ENTITY:   "#FF073A",
    // Usuarios
    USER_REGISTERED:                 "#D4AF37",
    USER_RANK_CHANGED:               "#B9F2FF",
    // Seguridad
    BRIGADE_DETECTED:                "#FF073A",
    SHADOW_BAN:                      "#FF073A",
    // Default
    DEFAULT:                         "#888",
};

function colorFor(action: string): string {
    return ACTION_COLOR[action] || ACTION_COLOR.DEFAULT;
}

function formatDate(iso: string): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-CL", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
}

export default function AdminLogs() {
    const [logs, setLogs]           = useState<LogEntry[]>([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);
    const [search, setSearch]       = useState("");
    const [expanded, setExpanded]   = useState<string | null>(null);
    const [page, setPage]           = useState(0);
    const PAGE_SIZE = 50;

    const token = () => localStorage.getItem("beacon_token") || "";

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Reutilizamos el stats endpoint para obtener los últimos logs
            // En futuro: crear endpoint dedicado GET /admin/audit-logs con paginación
            const res = await fetch(`${API_URL}/api/v1/admin/stats`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            // _raw viene del stats endpoint con todos los campos
            const rawLogs = (data.recent_audit || []).map((e: { _raw?: LogEntry; [key: string]: unknown }) => e._raw || e);
            setLogs(rawLogs);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error cargando logs");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const filtered = logs.filter(log => {
        if (!search) return true;
        const s = search.toLowerCase();
        return JSON.stringify(log).toLowerCase().includes(s);
    });

    const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold" style={{ color: "#D4AF37" }}>
                        📜 Audit Log — El Escriba
                    </h1>
                    <p className="text-xs text-foreground-muted mt-1 font-mono">
                        Registro inmutable de todas las acciones del sistema
                    </p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="text-[10px] px-3 py-1.5 rounded-lg uppercase tracking-wider font-mono"
                    style={{ background: "rgba(212,175,55,0.08)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.15)" }}
                >
                    ↻ Refrescar
                </button>
            </div>

            {/* Buscador */}
            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Buscar en logs (acción, id, email…)"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(0); }}
                    style={{
                        width: "100%", backgroundColor: "rgba(255,255,255,0.03)",
                        color: "#e0e0e0", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "8px", padding: "8px 12px", fontSize: "12px", outline: "none",
                    }}
                />
            </div>

            {/* Count */}
            <p className="text-[10px] text-foreground-muted font-mono mb-3">
                {filtered.length} entrada{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
                {search && ` · filtro: "${search}"`}
            </p>

            {/* Contenido */}
            {loading ? (
                <div className="text-center py-16 text-foreground-muted text-xs font-mono animate-pulse">Cargando registros…</div>
            ) : error ? (
                <div className="text-center py-16">
                    <p className="text-sm text-red-400 mb-3">{error}</p>
                    <button onClick={fetchLogs} className="text-xs px-4 py-2 rounded-lg"
                        style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)" }}>
                        Reintentar
                    </button>
                </div>
            ) : paginated.length === 0 ? (
                <div className="rounded-xl p-8 text-center font-mono text-[10px] text-foreground-muted"
                    style={{ background: "rgba(10,10,10,0.9)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ color: "#39FF14" }}>$</span> Sin registros.{" "}
                    {search ? "Intenta otra búsqueda." : "El Escriba espera las primeras acciones."}
                </div>
            ) : (
                <div className="rounded-xl overflow-hidden" style={{ background: "rgba(8,8,8,0.95)", border: "1px solid rgba(255,255,255,0.04)", fontFamily: "monospace" }}>
                    {paginated.map((log, idx) => {
                        const action     = String(log.action || log.event_type || log.type || "UNKNOWN");
                        const entityType = String(log.entity_type || log.table_name || log.resource || "");
                        const createdAt  = String(log.created_at || "");
                        const actorId    = String(log.actor_id   || log.user_id || "SYSTEM");
                        const details    = (log.details as Record<string, unknown>) || {};
                        const isOpen     = expanded === log.id;

                        return (
                            <div
                                key={log.id || idx}
                                style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                            >
                                {/* Fila principal */}
                                <div
                                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                                    onClick={() => setExpanded(isOpen ? null : String(log.id))}
                                >
                                    <span style={{ color: "#39FF14", flexShrink: 0, fontSize: 10 }}>›</span>

                                    {/* Timestamp */}
                                    <span className="text-[9px] w-36 flex-shrink-0" style={{ color: "#555" }}>
                                        {formatDate(createdAt)}
                                    </span>

                                    {/* Acción */}
                                    <span
                                        className="text-[9px] font-bold px-2 py-0.5 rounded flex-shrink-0"
                                        style={{
                                            color: colorFor(action),
                                            background: `${colorFor(action)}12`,
                                            border: `1px solid ${colorFor(action)}25`,
                                            maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                        }}
                                    >
                                        {action}
                                    </span>

                                    {/* Tipo de entidad */}
                                    <span className="text-[9px] flex-shrink-0" style={{ color: "#666" }}>
                                        {entityType}
                                    </span>

                                    {/* Actor */}
                                    <span className="text-[9px] text-foreground-muted flex-1 truncate font-mono">
                                        actor: {actorId.slice(0, 8)}…
                                    </span>

                                    {/* Expander */}
                                    <span className="text-[9px]" style={{ color: "#444" }}>{isOpen ? "▲" : "▼"}</span>
                                </div>

                                {/* Detalles expandidos */}
                                {isOpen && (
                                    <div className="px-8 py-3 text-[10px]"
                                        style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                        <p className="text-foreground-muted mb-2">
                                            <b style={{ color: "#D4AF37" }}>ID:</b> {String(log.id || "—")}
                                        </p>
                                        <p className="text-foreground-muted mb-2">
                                            <b style={{ color: "#D4AF37" }}>Actor:</b> {actorId}
                                        </p>
                                        <p className="text-foreground-muted mb-2">
                                            <b style={{ color: "#D4AF37" }}>Entidad:</b> {String(log.entity_id || "—")}
                                        </p>
                                        {Object.keys(details).length > 0 && (
                                            <div>
                                                <p className="mb-1" style={{ color: "#D4AF37" }}>Details:</p>
                                                <pre className="text-[9px] rounded p-2 overflow-auto max-h-48"
                                                    style={{ background: "rgba(0,0,0,0.4)", color: "#aaa" }}>
                                                    {JSON.stringify(details, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Paginación */}
            {filtered.length > PAGE_SIZE && (
                <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                        disabled={page === 0}
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        className="text-[10px] px-3 py-1.5 rounded font-mono disabled:opacity-30"
                        style={{ background: "rgba(255,255,255,0.05)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}
                    >← Anterior</button>
                    <span className="text-[10px] font-mono text-foreground-muted">
                        Pág {page + 1} / {Math.ceil(filtered.length / PAGE_SIZE)}
                    </span>
                    <button
                        disabled={(page + 1) * PAGE_SIZE >= filtered.length}
                        onClick={() => setPage(p => p + 1)}
                        className="text-[10px] px-3 py-1.5 rounded font-mono disabled:opacity-30"
                        style={{ background: "rgba(255,255,255,0.05)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}
                    >Siguiente →</button>
                </div>
            )}
        </div>
    );
}
