/**
 * BEACON PROTOCOL — Admin Entity Management (Gestión del Overlord)
 * =================================================================
 * CRUD visual de entidades con formulario Premium Dark.
 * Cada cambio requiere 'Razón de Cambio' para audit_logs.
 *
 * "El Overlord edita la realidad. El Escriba registra cada cambio."
 */

"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Entity {
    id: string;
    first_name: string;
    last_name: string;
    second_last_name?: string;
    category: string;
    position?: string;
    region?: string;
    district?: string;
    bio?: string;
    photo_path?: string;
    party?: string;
    official_links?: Record<string, string>;
    is_active?: boolean;
}

const CATEGORIES = [
    { value: "politico",   label: "Político/a" },
    { value: "periodista", label: "Periodista / Persona Pública" },
    { value: "empresario", label: "Empresario/a" },
    { value: "empresa",    label: "Empresa / Organización" },
    { value: "evento",     label: "Evento" },
];

const REGIONES_CHILE = [
    "Arica y Parinacota",
    "Tarapacá",
    "Antofagasta",
    "Atacama",
    "Coquimbo",
    "Valparaíso",
    "Metropolitana",
    "O'Higgins",
    "Maule",
    "Ñuble",
    "Biobío",
    "La Araucanía",
    "Los Ríos",
    "Los Lagos",
    "Aysén",
    "Magallanes",
    "Nacional",
];

const EMPTY_FORM: Omit<Entity, "id"> = {
    first_name: "",
    last_name: "",
    second_last_name: "",
    category: "politico",
    position: "",
    region: "",
    district: "",
    bio: "",
    photo_path: "",
    party: "",
    official_links: {},
};

/** Estilo base para inputs */
const inputStyle: React.CSSProperties = {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    color: "#e0e0e0",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
};

export default function AdminEntities() {
    const [entities, setEntities] = useState<Entity[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [changeReason, setChangeReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [searchFilter, setSearchFilter] = useState("");

    const token = typeof window !== "undefined" ? localStorage.getItem("beacon_token") : null;

    /** Headers con JWT */
    const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };

    /** Cargar entidades */
    const loadEntities = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/api/v1/admin/entities?limit=300`, {
                headers: authHeaders,
            });
            if (res.ok) {
                const data = await res.json();
                setEntities(data.entities || []);
            }
        } catch (err) {
            console.error("Error cargando entidades:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadEntities();
    }, [loadEntities]);

    /** Abrir formulario de creación */
    const openCreateForm = () => {
        setEditingId(null);
        setFormData(EMPTY_FORM);
        setChangeReason("");
        setShowForm(true);
    };

    /** Abrir formulario de edición */
    const openEditForm = (entity: Entity) => {
        setEditingId(entity.id);
        setFormData({
            first_name: entity.first_name,
            last_name: entity.last_name,
            second_last_name: entity.second_last_name || "",
            category: entity.category,
            position: entity.position || "",
            region: entity.region || "",
            district: entity.district || "",
            bio: entity.bio || "",
            photo_path: entity.photo_path || "",
            party: entity.party || "",
            official_links: entity.official_links || {},
        });
        setChangeReason("");
        setShowForm(true);
    };

    /** Guardar (crear o editar) */
    const handleSave = async () => {
        const needsLastName = !["empresa", "evento"].includes(formData.category);
        if (!formData.first_name || (needsLastName && !formData.last_name)) {
            setMessage({ type: "error", text: needsLastName ? "Nombre y Apellido son obligatorios" : "Nombre es obligatorio" });
            return;
        }

        if (editingId && !changeReason) {
            setMessage({ type: "error", text: "Razón de cambio es obligatoria para edición" });
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            const url = editingId
                ? `${API_URL}/api/v1/admin/entities/${editingId}`
                : `${API_URL}/api/v1/admin/entities`;

            const method = editingId ? "PATCH" : "POST";
            const body = editingId
                ? { ...formData, change_reason: changeReason }
                : { ...formData, change_reason: changeReason || "Creación desde panel admin" };

            const res = await fetch(url, {
                method,
                headers: authHeaders,
                body: JSON.stringify(body),
            });

            if (res.ok) {
                setMessage({
                    type: "success",
                    text: editingId ? "Entidad actualizada con éxito" : "Entidad creada con éxito",
                });
                setShowForm(false);
                loadEntities();
            } else {
                const err = await res.json();
                setMessage({ type: "error", text: err.detail || "Error al guardar" });
            }
        } catch {
            setMessage({ type: "error", text: "Error de conexión" });
        } finally {
            setSaving(false);
        }
    };

    /** Soft delete */
    const handleDelete = async (entityId: string, name: string) => {
        if (!confirm(`¿Desactivar la entidad "${name}"? (Soft Delete)`)) return;

        try {
            const res = await fetch(`${API_URL}/api/v1/admin/entities/${entityId}`, {
                method: "DELETE",
                headers: authHeaders,
            });

            if (res.ok) {
                setMessage({ type: "success", text: `"${name}" desactivada` });
                loadEntities();
            } else {
                const err = await res.json();
                setMessage({ type: "error", text: err.detail || "Error al desactivar" });
            }
        } catch {
            setMessage({ type: "error", text: "Error de conexión" });
        }
    };

    /** Upload de foto al bucket de Supabase Storage */
    const handlePhotoUpload = async (file: File) => {
        setUploading(true);
        setMessage(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch(`${API_URL}/api/v1/admin/entities/upload-photo`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
            });
            if (!res.ok) {
                const err = await res.json();
                setMessage({ type: "error", text: err.detail || "Error subiendo imagen" });
                return;
            }
            const data = await res.json();
            setFormData((prev) => ({ ...prev, photo_path: data.url }));
            setMessage({ type: "success", text: "Imagen subida correctamente" });
        } catch {
            setMessage({ type: "error", text: "Error de conexión al subir imagen" });
        } finally {
            setUploading(false);
        }
    };

    /** Filtrar entidades en la lista */
    const filtered = entities.filter((e) => {
        if (!searchFilter) return true;
        const q = searchFilter.toLowerCase();
        return (
            e.first_name.toLowerCase().includes(q) ||
            e.last_name.toLowerCase().includes(q) ||
            (e.region || "").toLowerCase().includes(q) ||
            (e.position || "").toLowerCase().includes(q)
        );
    });

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold" style={{ color: "#D4AF37" }}>
                        Gestión de Entidades
                    </h1>
                    <p className="text-[10px] text-foreground-muted font-mono mt-1">
                        {entities.length} entidades en la BBDD · Cada cambio queda en audit_logs
                    </p>
                </div>
                <button
                    onClick={openCreateForm}
                    className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all"
                    style={{
                        background: "linear-gradient(135deg, #D4AF37, #B8941F)",
                        color: "#0A0A0A",
                    }}
                >
                    + Añadir Entidad
                </button>
            </div>

            {/* Mensajes */}
            {message && (
                <div
                    className="rounded-lg p-3 mb-4 text-xs font-mono"
                    style={{
                        backgroundColor: message.type === "success"
                            ? "rgba(57, 255, 20, 0.08)"
                            : "rgba(255, 7, 58, 0.08)",
                        border: `1px solid ${message.type === "success" ? "rgba(57, 255, 20, 0.2)" : "rgba(255, 7, 58, 0.2)"}`,
                        color: message.type === "success" ? "#39FF14" : "#FF073A",
                    }}
                >
                    {message.text}
                </div>
            )}

            {/* ═══ FORMULARIO MODAL ═══ */}
            {showForm && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.85)" }}
                    onClick={() => setShowForm(false)}
                >
                    <div
                        className="rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                        style={{
                            background: "#111111",
                            border: "1px solid rgba(212, 175, 55, 0.15)",
                            boxShadow: "0 0 40px rgba(212, 175, 55, 0.1)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-bold mb-4" style={{ color: "#D4AF37" }}>
                            {editingId ? "Editar Entidad" : "Nueva Entidad"}
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Categoría — primero para que el resto de campos se adapten */}
                            <div className="sm:col-span-2">
                                <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">
                                    Categoría *
                                </label>
                                <select
                                    style={{ ...inputStyle, cursor: "pointer" }}
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                >
                                    {CATEGORIES.map((c) => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Nombre */}
                            <div>
                                <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">
                                    {["empresa", "evento"].includes(formData.category) ? "Nombre *" : "Nombre *"}
                                </label>
                                <input
                                    style={inputStyle}
                                    value={formData.first_name}
                                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                    placeholder={["empresa", "evento"].includes(formData.category) ? "Ej: LATAM Airlines" : "Carmen Gloria"}
                                />
                            </div>

                            {/* Apellido — oculto para empresa/evento */}
                            {!["empresa", "evento"].includes(formData.category) ? (
                                <div>
                                    <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">
                                        Apellido *
                                    </label>
                                    <input
                                        style={inputStyle}
                                        value={formData.last_name}
                                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                        placeholder="Aravena"
                                    />
                                </div>
                            ) : (
                                /* Placeholder invisible para mantener grid 2 col */
                                <div />
                            )}

                            {/* Segundo Apellido — solo personas */}
                            {!["empresa", "evento"].includes(formData.category) && (
                                <div>
                                    <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">
                                        Segundo Apellido
                                    </label>
                                    <input
                                        style={inputStyle}
                                        value={formData.second_last_name}
                                        onChange={(e) => setFormData({ ...formData, second_last_name: e.target.value })}
                                    />
                                </div>
                            )}

                            {/* Cargo / Posición */}
                            <div>
                                <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">
                                    {formData.category === "empresa" ? "Sector / Rubro"
                                        : formData.category === "evento" ? "Tipo de Evento"
                                        : "Cargo / Posición"}
                                </label>
                                <input
                                    style={inputStyle}
                                    value={formData.position}
                                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                    placeholder={
                                        formData.category === "empresa" ? "Aerolínea, Retail, Banca..."
                                        : formData.category === "evento" ? "Elección, Escándalo, Hito..."
                                        : "Senador, Diputado, CEO..."
                                    }
                                />
                            </div>

                            {/* Partido — solo políticos */}
                            {formData.category === "politico" && (
                                <div>
                                    <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">
                                        Partido Político
                                    </label>
                                    <input
                                        style={inputStyle}
                                        value={formData.party}
                                        onChange={(e) => setFormData({ ...formData, party: e.target.value })}
                                        placeholder="RN, UDI, PS, Independiente..."
                                    />
                                </div>
                            )}

                            {/* Región */}
                            <div>
                                <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">
                                    Región
                                </label>
                                <select
                                    style={{ ...inputStyle, cursor: "pointer" }}
                                    value={formData.region}
                                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                                >
                                    <option value="">— Sin región —</option>
                                    {REGIONES_CHILE.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Distrito — solo políticos */}
                            {formData.category === "politico" && (
                                <div>
                                    <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">
                                        Distrito / Circunscripción
                                    </label>
                                    <input
                                        style={inputStyle}
                                        value={formData.district}
                                        onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                                        placeholder="Distrito 7"
                                    />
                                </div>
                            )}

                            {/* Foto — Upload al bucket Supabase Storage */}
                            <div className="sm:col-span-2">
                                <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">
                                    Fotografía
                                </label>
                                <div className="flex items-start gap-4">
                                    {/* Preview */}
                                    <div
                                        className="w-20 h-20 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center"
                                        style={{ border: "1px solid rgba(212,175,55,0.2)", background: "rgba(255,255,255,0.02)" }}
                                    >
                                        {formData.photo_path ? (
                                            <img
                                                src={formData.photo_path}
                                                alt="preview"
                                                className="w-full h-full object-cover"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                            />
                                        ) : (
                                            <span className="text-2xl opacity-30">📷</span>
                                        )}
                                    </div>

                                    {/* Controles */}
                                    <div className="flex-1 space-y-2">
                                        <label
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-mono uppercase tracking-wider cursor-pointer transition-all hover:scale-105"
                                            style={{
                                                background: uploading ? "rgba(212,175,55,0.1)" : "rgba(212,175,55,0.15)",
                                                border: "1px solid rgba(212,175,55,0.3)",
                                                color: "#D4AF37",
                                                opacity: uploading ? 0.7 : 1,
                                            }}
                                        >
                                            {uploading ? "⏳ Subiendo..." : "📁 Seleccionar imagen"}
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp"
                                                className="hidden"
                                                disabled={uploading}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handlePhotoUpload(file);
                                                    e.target.value = "";
                                                }}
                                            />
                                        </label>
                                        <p className="text-[9px] text-foreground-muted font-mono">
                                            JPEG · PNG · WEBP · Máx 5 MB
                                        </p>
                                        {formData.photo_path && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-foreground-muted font-mono truncate max-w-[200px]">
                                                    {formData.photo_path.split("/").pop()}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData((prev) => ({ ...prev, photo_path: "" }))}
                                                    className="text-[9px] font-mono"
                                                    style={{ color: "#FF073A" }}
                                                >
                                                    ✕ quitar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bio */}
                        <div className="mt-4">
                            <label className="text-[9px] text-foreground-muted uppercase tracking-wider block mb-1">
                                Biografía / Descripción
                            </label>
                            <textarea
                                style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                                value={formData.bio}
                                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                placeholder={
                                    formData.category === "empresa"
                                        ? "Descripción de la empresa, historia, sector..."
                                        : "Trayectoria, cargos previos, contexto relevante..."
                                }
                            />
                        </div>

                        {/* Razón de Cambio (obligatoria para edición) */}
                        {editingId && (
                            <div className="mt-4">
                                <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: "#FF073A" }}>
                                    Razón de Cambio * (Registrada en audit_logs)
                                </label>
                                <input
                                    style={{
                                        ...inputStyle,
                                        borderColor: changeReason ? "rgba(57, 255, 20, 0.2)" : "rgba(255, 7, 58, 0.3)",
                                    }}
                                    value={changeReason}
                                    onChange={(e) => setChangeReason(e.target.value)}
                                    placeholder="Ej: Actualización de cargo post-elecciones 2026"
                                />
                            </div>
                        )}

                        {/* Botones */}
                        <div className="flex items-center justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowForm(false)}
                                className="px-4 py-2 rounded-lg text-xs transition-all"
                                style={{
                                    backgroundColor: "rgba(255,255,255,0.05)",
                                    color: "#888",
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                                style={{
                                    background: saving
                                        ? "rgba(212, 175, 55, 0.3)"
                                        : "linear-gradient(135deg, #D4AF37, #B8941F)",
                                    color: "#0A0A0A",
                                    opacity: saving ? 0.7 : 1,
                                }}
                            >
                                {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear Entidad"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ BUSCADOR ADMIN ═══ */}
            <div className="mb-4">
                <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Buscar entidades por nombre, región o cargo..."
                    style={{ ...inputStyle, maxWidth: "400px" }}
                />
            </div>

            {/* ═══ TABLA DE ENTIDADES ═══ */}
            {loading ? (
                <div className="text-center py-12">
                    <p className="text-xs font-mono" style={{ color: "#00E5FF" }}>
                        Cargando entidades del Búnker...
                    </p>
                </div>
            ) : (
                <div
                    className="rounded-xl overflow-hidden"
                    style={{
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                >
                    <div className="overflow-x-auto">
                        <table className="w-full" style={{ fontSize: "12px" }}>
                            <thead>
                                <tr
                                    style={{
                                        background: "rgba(212, 175, 55, 0.05)",
                                        borderBottom: "1px solid rgba(212, 175, 55, 0.1)",
                                    }}
                                >
                                    <th className="text-left p-3 text-[9px] uppercase tracking-wider font-mono" style={{ color: "#D4AF37" }}>
                                        Nombre
                                    </th>
                                    <th className="text-left p-3 text-[9px] uppercase tracking-wider font-mono" style={{ color: "#D4AF37" }}>
                                        Cargo
                                    </th>
                                    <th className="text-left p-3 text-[9px] uppercase tracking-wider font-mono" style={{ color: "#D4AF37" }}>
                                        Región
                                    </th>
                                    <th className="text-left p-3 text-[9px] uppercase tracking-wider font-mono" style={{ color: "#D4AF37" }}>
                                        Partido
                                    </th>
                                    <th className="text-left p-3 text-[9px] uppercase tracking-wider font-mono" style={{ color: "#D4AF37" }}>
                                        Estado
                                    </th>
                                    <th className="text-right p-3 text-[9px] uppercase tracking-wider font-mono" style={{ color: "#D4AF37" }}>
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((entity, idx) => (
                                    <tr
                                        key={entity.id}
                                        style={{
                                            background: idx % 2 === 0 ? "rgba(17,17,17,0.6)" : "rgba(17,17,17,0.3)",
                                            borderBottom: "1px solid rgba(255,255,255,0.02)",
                                        }}
                                    >
                                        <td className="p-3 text-foreground font-medium">
                                            {entity.first_name} {entity.last_name}
                                        </td>
                                        <td className="p-3 text-foreground-muted">
                                            {entity.position || "—"}
                                        </td>
                                        <td className="p-3 text-foreground-muted text-[11px]">
                                            {entity.region ? entity.region.replace("Región de ", "").replace("Región del ", "") : "—"}
                                        </td>
                                        <td className="p-3">
                                            {entity.party ? (
                                                <span
                                                    className="text-[9px] px-2 py-0.5 rounded uppercase"
                                                    style={{
                                                        backgroundColor: "rgba(138, 43, 226, 0.1)",
                                                        color: "#B388FF",
                                                    }}
                                                >
                                                    {entity.party}
                                                </span>
                                            ) : "—"}
                                        </td>
                                        <td className="p-3">
                                            <span
                                                className="text-[9px] px-2 py-0.5 rounded uppercase font-mono"
                                                style={{
                                                    backgroundColor: entity.is_active
                                                        ? "rgba(57,255,20,0.08)"
                                                        : "rgba(255,7,58,0.08)",
                                                    color: entity.is_active ? "#39FF14" : "#FF073A",
                                                }}
                                            >
                                                {entity.is_active ? "Activo" : "Inactivo"}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => openEditForm(entity)}
                                                    className="text-[9px] px-2 py-1 rounded uppercase tracking-wider transition-all"
                                                    style={{
                                                        backgroundColor: "rgba(0, 229, 255, 0.08)",
                                                        color: "#00E5FF",
                                                        border: "1px solid rgba(0, 229, 255, 0.15)",
                                                    }}
                                                >
                                                    Editar
                                                </button>
                                                {entity.is_active && (
                                                    <button
                                                        onClick={() => handleDelete(entity.id, `${entity.first_name} ${entity.last_name}`)}
                                                        className="text-[9px] px-2 py-1 rounded uppercase tracking-wider transition-all"
                                                        style={{
                                                            backgroundColor: "rgba(255, 7, 58, 0.08)",
                                                            color: "#FF073A",
                                                            border: "1px solid rgba(255, 7, 58, 0.15)",
                                                        }}
                                                    >
                                                        Desactivar
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length === 0 && (
                        <div className="text-center py-8 text-xs text-foreground-muted font-mono">
                            No se encontraron entidades
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
