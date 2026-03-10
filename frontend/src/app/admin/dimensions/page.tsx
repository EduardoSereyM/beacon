/**
 * BEACON PROTOCOL — Admin Dimensions Manager
 * ===========================================
 * CRUD de dimensiones de evaluación por categoría.
 * El Overlord define los criterios con los que la República juzga.
 *
 * "Cambiar una dimensión es cambiar la forma de medir la integridad."
 */

"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORIES = [
    { value: "politico",   label: "🏛️ Político" },
    { value: "periodista", label: "📰 Periodista" },
    { value: "empresario", label: "💼 Empresario" },
    { value: "empresa",    label: "🏢 Empresa" },
    { value: "evento",     label: "📅 Evento" },
];

interface Dimension {
    id: string;
    category: string;
    key: string;
    label: string;
    icon: string;
    display_order: number;
    is_active: boolean;
}

const EMPTY_FORM = { category: "politico", key: "", label: "", icon: "📊", display_order: 99 };

const inputStyle: React.CSSProperties = {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.03)",
    color: "#e0e0e0",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "13px",
    outline: "none",
};

export default function AdminDimensions() {
    const [activeTab, setActiveTab]   = useState("politico");
    const [dimensions, setDimensions] = useState<Dimension[]>([]);
    const [loading, setLoading]       = useState(true);
    const [message, setMessage]       = useState<{ type: "ok" | "err"; text: string } | null>(null);
    const [showForm, setShowForm]     = useState(false);
    const [editingId, setEditingId]   = useState<string | null>(null);
    const [form, setForm]             = useState({ ...EMPTY_FORM });

    const token = () => localStorage.getItem("beacon_token") || "";

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/dimensions`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            if (!res.ok) throw new Error("Sin acceso");
            const data = await res.json();
            setDimensions(data.dimensions || []);
        } catch {
            setMessage({ type: "err", text: "Error cargando dimensiones" });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const byCategory = dimensions.filter(d => d.category === activeTab)
        .sort((a, b) => a.display_order - b.display_order);

    function openNew() {
        setEditingId(null);
        setForm({ ...EMPTY_FORM, category: activeTab });
        setShowForm(true);
    }

    function openEdit(d: Dimension) {
        setEditingId(d.id);
        setForm({ category: d.category, key: d.key, label: d.label, icon: d.icon, display_order: d.display_order });
        setShowForm(true);
    }

    async function handleSave() {
        if (!form.key || !form.label) {
            setMessage({ type: "err", text: "Key y Label son obligatorios" });
            return;
        }
        try {
            const url    = editingId
                ? `${API_URL}/api/v1/admin/dimensions/${editingId}`
                : `${API_URL}/api/v1/admin/dimensions`;
            const method = editingId ? "PATCH" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
                body: JSON.stringify(form),
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Error"); }
            setMessage({ type: "ok", text: editingId ? "Dimensión actualizada" : "Dimensión creada" });
            setShowForm(false);
            fetchAll();
        } catch (e) {
            setMessage({ type: "err", text: e instanceof Error ? e.message : "Error" });
        }
    }

    async function toggleActive(d: Dimension) {
        try {
            await fetch(`${API_URL}/api/v1/admin/dimensions/${d.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ is_active: !d.is_active }),
            });
            fetchAll();
        } catch {
            setMessage({ type: "err", text: "Error al cambiar estado" });
        }
    }

    async function handleDelete(d: Dimension) {
        if (!confirm(`¿Eliminar "${d.label}" de forma permanente?`)) return;
        try {
            await fetch(`${API_URL}/api/v1/admin/dimensions/${d.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token()}` },
            });
            setMessage({ type: "ok", text: "Dimensión eliminada" });
            fetchAll();
        } catch {
            setMessage({ type: "err", text: "Error al eliminar" });
        }
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold" style={{ color: "#D4AF37" }}>
                        🎚️ Dimensiones de Evaluación
                    </h1>
                    <p className="text-xs text-foreground-muted mt-1 font-mono">
                        Define los criterios con los que el ciudadano evalúa cada categoría
                    </p>
                </div>
                <button
                    onClick={openNew}
                    className="text-xs px-4 py-2 rounded-lg uppercase tracking-wider font-mono transition-all"
                    style={{ background: "rgba(57,255,20,0.08)", color: "#39FF14", border: "1px solid rgba(57,255,20,0.2)" }}
                >
                    + Nueva dimensión
                </button>
            </div>

            {/* Mensaje */}
            {message && (
                <div className="mb-4 p-3 rounded-lg text-xs font-mono"
                    style={{
                        background: message.type === "ok" ? "rgba(57,255,20,0.08)" : "rgba(255,7,58,0.08)",
                        color:      message.type === "ok" ? "#39FF14"              : "#FF073A",
                        border:     `1px solid ${message.type === "ok" ? "rgba(57,255,20,0.2)" : "rgba(255,7,58,0.2)"}`,
                    }}
                >
                    {message.type === "ok" ? "✓" : "✕"} {message.text}
                    <button onClick={() => setMessage(null)} className="ml-3 opacity-60">×</button>
                </div>
            )}

            {/* Tabs de categoría */}
            <div className="flex gap-1 mb-6 overflow-x-auto">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.value}
                        onClick={() => setActiveTab(cat.value)}
                        className="text-[10px] px-3 py-1.5 rounded-lg uppercase tracking-wider font-mono whitespace-nowrap transition-all"
                        style={{
                            background: activeTab === cat.value ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.03)",
                            color:      activeTab === cat.value ? "#D4AF37"                : "#888",
                            border:     `1px solid ${activeTab === cat.value ? "rgba(212,175,55,0.3)" : "rgba(255,255,255,0.06)"}`,
                        }}
                    >
                        {cat.label}
                        <span className="ml-1.5 opacity-60">
                            ({dimensions.filter(d => d.category === cat.value).length})
                        </span>
                    </button>
                ))}
            </div>

            {/* Formulario modal inline */}
            {showForm && (
                <div className="mb-6 p-5 rounded-xl" style={{ background: "rgba(17,17,17,0.95)", border: "1px solid rgba(212,175,55,0.2)" }}>
                    <h3 className="text-xs uppercase tracking-wider mb-4 font-mono" style={{ color: "#D4AF37" }}>
                        {editingId ? "✏️ Editar dimensión" : "➕ Nueva dimensión"}
                    </h3>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                            <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">Categoría</label>
                            <select
                                value={form.category}
                                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                style={inputStyle}
                                disabled={!!editingId}
                            >
                                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">Key (slug único) *</label>
                            <input
                                type="text"
                                placeholder="ej: transparencia"
                                value={form.key}
                                onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s/g, "_") }))}
                                style={inputStyle}
                                disabled={!!editingId}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">Label (visible al ciudadano) *</label>
                            <input
                                type="text"
                                placeholder="ej: Transparencia"
                                value={form.label}
                                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">Icono (emoji)</label>
                            <input
                                type="text"
                                placeholder="ej: ⚖️"
                                value={form.icon}
                                onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                                style={{ ...inputStyle, width: 80 }}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">Orden</label>
                            <input
                                type="number"
                                min={1}
                                max={99}
                                value={form.display_order}
                                onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 99 }))}
                                style={{ ...inputStyle, width: 80 }}
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={handleSave}
                            className="text-xs px-4 py-2 rounded-lg uppercase tracking-wider font-mono"
                            style={{ background: "rgba(212,175,55,0.15)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.3)" }}
                        >
                            {editingId ? "Guardar cambios" : "Crear"}
                        </button>
                        <button
                            onClick={() => setShowForm(false)}
                            className="text-xs px-4 py-2 rounded-lg uppercase tracking-wider font-mono"
                            style={{ background: "rgba(255,255,255,0.04)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Tabla de dimensiones */}
            {loading ? (
                <div className="text-center py-12 text-foreground-muted text-xs font-mono">Cargando…</div>
            ) : byCategory.length === 0 ? (
                <div className="text-center py-12 text-foreground-muted text-xs font-mono">
                    Sin dimensiones para esta categoría.<br />
                    <button onClick={openNew} className="mt-2 underline" style={{ color: "#D4AF37" }}>Crear la primera</button>
                </div>
            ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                    <table className="w-full border-collapse text-xs">
                        <thead>
                            <tr style={{ background: "rgba(212,175,55,0.05)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                {["Orden", "Icono", "Label", "Key", "Estado", "Acciones"].map(h => (
                                    <th key={h} className="text-left p-3 text-[9px] uppercase tracking-wider font-mono" style={{ color: "#D4AF37" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {byCategory.map((d, idx) => (
                                <tr key={d.id} style={{
                                    background: idx % 2 === 0 ? "rgba(17,17,17,0.6)" : "rgba(17,17,17,0.3)",
                                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                                    opacity: d.is_active ? 1 : 0.45,
                                }}>
                                    <td className="p-3 font-mono text-foreground-muted text-center">{d.display_order}</td>
                                    <td className="p-3 text-center text-base">{d.icon}</td>
                                    <td className="p-3 text-foreground font-medium">{d.label}</td>
                                    <td className="p-3 font-mono text-foreground-muted text-[10px]">{d.key}</td>
                                    <td className="p-3">
                                        <button
                                            onClick={() => toggleActive(d)}
                                            className="text-[9px] px-2 py-0.5 rounded uppercase font-mono"
                                            style={{
                                                background: d.is_active ? "rgba(57,255,20,0.08)" : "rgba(255,7,58,0.08)",
                                                color:      d.is_active ? "#39FF14"               : "#FF073A",
                                                border:     `1px solid ${d.is_active ? "rgba(57,255,20,0.2)" : "rgba(255,7,58,0.2)"}`,
                                            }}
                                        >
                                            {d.is_active ? "Activa" : "Inactiva"}
                                        </button>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => openEdit(d)}
                                                className="text-[9px] px-2 py-1 rounded uppercase tracking-wider"
                                                style={{ background: "rgba(0,229,255,0.08)", color: "#00E5FF", border: "1px solid rgba(0,229,255,0.15)" }}
                                            >Editar</button>
                                            <button
                                                onClick={() => handleDelete(d)}
                                                className="text-[9px] px-2 py-1 rounded uppercase tracking-wider"
                                                style={{ background: "rgba(255,7,58,0.08)", color: "#FF073A", border: "1px solid rgba(255,7,58,0.15)" }}
                                            >Eliminar</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Info votos */}
            <div className="mt-8 p-4 rounded-xl text-[10px] font-mono"
                style={{ background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.1)", color: "#00E5FF" }}>
                <p className="font-bold mb-1">ℹ️ Cómo se cuentan los votos</p>
                <p className="text-foreground-muted leading-relaxed">
                    Cada ciudadano emite un <b className="text-foreground">veredicto multidimensional</b>: un valor 0–5 por cada dimensión activa.<br/>
                    El backend promedia todas las dimensiones → <code>vote_avg</code> → se aplica fórmula <b className="text-foreground">Bayesiana</b> con m=30, C=3.0.<br/>
                    El resultado actualiza <code>reputation_score</code> en la tabla <code>entities</code> y agrega 1 registro en <code>entity_reviews</code> (anti-brigada: 1 voto por usuario por entidad).<br/>
                    El <code>total_reviews</code> del dashboard = COUNT(*) de la tabla <code>entity_reviews</code>.
                </p>
            </div>
        </div>
    );
}
