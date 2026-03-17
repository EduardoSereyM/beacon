/**
 * BEACON PROTOCOL — Admin / Gestión de Encuestas
 * ================================================
 * CRUD completo de polls con preguntas múltiples,
 * tipos MC / escala numérica, imagen de cabecera y fechas.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Tipos ─────────────────────────────────────────────────────

interface Question {
    id?: string;
    question_text: string;
    question_type: "multiple_choice" | "numeric_scale";
    options: string[];
    scale_min: number;
    scale_max: number;
    order_index: number;
}

interface Poll {
    id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    start_at: string | null;
    end_at: string | null;
    is_active: boolean;
    created_at: string;
    poll_questions?: Question[];
}

type MessageState = { type: "success" | "error"; text: string } | null;

// ── Helpers ────────────────────────────────────────────────────

function emptyQuestion(index: number): Question {
    return {
        question_text: "",
        question_type: "multiple_choice",
        options: ["", ""],
        scale_min: 1,
        scale_max: 10,
        order_index: index,
    };
}

// ── Componente Principal ────────────────────────────────────────

export default function AdminEncuestasPage() {
    const [polls, setPolls] = useState<Poll[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingPoll, setEditingPoll] = useState<Poll | null>(null);
    const [message, setMessage] = useState<MessageState>(null);
    const [uploading, setUploading] = useState(false);

    // Form state
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [coverUrl, setCoverUrl] = useState("");
    const [startAt, setStartAt] = useState("");
    const [endAt, setEndAt] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [questions, setQuestions] = useState<Question[]>([emptyQuestion(0)]);

    const fileRef = useRef<HTMLInputElement>(null);

    // ── Carga ─────────────────────────────────────────────────

    async function fetchPolls() {
        setLoading(true);
        const token = localStorage.getItem("beacon_token");
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/polls`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setPolls(data.polls || []);
        } catch {
            setMessage({ type: "error", text: "Error cargando encuestas." });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { fetchPolls(); }, []);

    // ── Upload imagen ─────────────────────────────────────────

    async function handleImageUpload(file: File) {
        const token = localStorage.getItem("beacon_token");
        setUploading(true);
        const form = new FormData();
        form.append("file", file);
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/polls/upload-image`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error subiendo imagen");
            setCoverUrl(data.url);
        } catch (e) {
            setMessage({ type: "error", text: e instanceof Error ? e.message : "Error subiendo imagen" });
        } finally {
            setUploading(false);
        }
    }

    // ── Preguntas helpers ─────────────────────────────────────

    function updateQuestion(idx: number, patch: Partial<Question>) {
        setQuestions((prev) => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
    }

    function addOption(qIdx: number) {
        setQuestions((prev) =>
            prev.map((q, i) => i === qIdx ? { ...q, options: [...q.options, ""] } : q)
        );
    }

    function removeOption(qIdx: number, optIdx: number) {
        setQuestions((prev) =>
            prev.map((q, i) =>
                i === qIdx ? { ...q, options: q.options.filter((_, j) => j !== optIdx) } : q
            )
        );
    }

    function updateOption(qIdx: number, optIdx: number, val: string) {
        setQuestions((prev) =>
            prev.map((q, i) =>
                i === qIdx
                    ? { ...q, options: q.options.map((o, j) => j === optIdx ? val : o) }
                    : q
            )
        );
    }

    // ── Abrir formulario ──────────────────────────────────────

    function openCreate() {
        setEditingPoll(null);
        setTitle(""); setDescription(""); setCoverUrl(""); setStartAt(""); setEndAt("");
        setIsActive(true); setQuestions([emptyQuestion(0)]);
        setMessage(null); setShowForm(true);
    }

    function openEdit(poll: Poll) {
        setEditingPoll(poll);
        setTitle(poll.title);
        setDescription(poll.description || "");
        setCoverUrl(poll.cover_image_url || "");
        setStartAt(poll.start_at ? poll.start_at.slice(0, 16) : "");
        setEndAt(poll.end_at ? poll.end_at.slice(0, 16) : "");
        setIsActive(poll.is_active);
        setQuestions(poll.poll_questions?.length
            ? poll.poll_questions.map((q) => ({
                ...q, options: q.options || [],
                scale_min: q.scale_min ?? 1, scale_max: q.scale_max ?? 10,
              }))
            : [emptyQuestion(0)]
        );
        setMessage(null); setShowForm(true);
    }

    // ── Submit ────────────────────────────────────────────────

    async function handleSubmit() {
        if (!title.trim()) { setMessage({ type: "error", text: "El título es obligatorio." }); return; }

        const token = localStorage.getItem("beacon_token");
        const body = {
            title: title.trim(),
            description: description.trim() || null,
            cover_image_url: coverUrl || null,
            start_at: startAt ? new Date(startAt).toISOString() : null,
            end_at: endAt ? new Date(endAt).toISOString() : null,
            is_active: isActive,
            questions: questions.map((q, i) => ({
                question_text: q.question_text,
                question_type: q.question_type,
                options: q.question_type === "multiple_choice" ? q.options.filter(Boolean) : null,
                scale_min: q.scale_min,
                scale_max: q.scale_max,
                order_index: i,
            })),
        };

        const url = editingPoll
            ? `${API_URL}/api/v1/admin/polls/${editingPoll.id}`
            : `${API_URL}/api/v1/admin/polls`;
        const method = editingPoll ? "PATCH" : "POST";

        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error guardando encuesta");
            setMessage({ type: "success", text: editingPoll ? "Encuesta actualizada." : "Encuesta creada." });
            setShowForm(false);
            fetchPolls();
        } catch (e) {
            setMessage({ type: "error", text: e instanceof Error ? e.message : "Error de conexión" });
        }
    }

    // ── Eliminar ──────────────────────────────────────────────

    async function handleDelete(poll: Poll) {
        if (!confirm(`¿Eliminar "${poll.title}"? Esta acción no se puede deshacer.`)) return;
        const token = localStorage.getItem("beacon_token");
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/polls/${poll.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Error eliminando encuesta");
            fetchPolls();
        } catch (e) {
            setMessage({ type: "error", text: e instanceof Error ? e.message : "Error eliminando" });
        }
    }

    // ── Render ────────────────────────────────────────────────

    return (
        <div className="min-h-screen" style={{ background: "#080808" }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold" style={{ color: "#D4AF37" }}>Gestión de Encuestas</h1>
                    <p className="text-[11px] text-foreground-muted mt-0.5 font-mono">
                        {polls.length} encuesta{polls.length !== 1 ? "s" : ""} · Opinión ciudadana ponderada
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:scale-105"
                    style={{ background: "linear-gradient(135deg, #D4AF37, #B8860B)", color: "#0A0A0A" }}
                >
                    + Nueva Encuesta
                </button>
            </div>

            {/* Mensaje global */}
            {message && !showForm && (
                <div
                    className="rounded-lg p-3 mb-4 text-xs font-mono"
                    style={{
                        backgroundColor: message.type === "success" ? "rgba(57,255,20,0.08)" : "rgba(255,7,58,0.08)",
                        border: `1px solid ${message.type === "success" ? "rgba(57,255,20,0.3)" : "rgba(255,7,58,0.2)"}`,
                        color: message.type === "success" ? "#39FF14" : "#FF073A",
                    }}
                >
                    {message.text}
                </div>
            )}

            {/* Lista */}
            {loading ? (
                <p className="text-foreground-muted text-xs font-mono text-center py-12">Cargando encuestas...</p>
            ) : polls.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-3xl mb-3">📊</p>
                    <p className="text-sm text-foreground-muted">No hay encuestas. Crea la primera.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {polls.map((poll) => (
                        <div
                            key={poll.id}
                            className="rounded-xl p-5 flex items-start gap-4"
                            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,175,55,0.1)" }}
                        >
                            {/* Imagen de cabecera */}
                            {poll.cover_image_url && (
                                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                                    <Image src={poll.cover_image_url} alt="" width={64} height={64} className="object-cover w-full h-full" />
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-bold text-sm text-foreground truncate">{poll.title}</h3>
                                    <span
                                        className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                                        style={{
                                            background: poll.is_active ? "rgba(57,255,20,0.1)" : "rgba(255,255,255,0.05)",
                                            color: poll.is_active ? "#39FF14" : "#666",
                                        }}
                                    >
                                        {poll.is_active ? "ACTIVA" : "INACTIVA"}
                                    </span>
                                </div>
                                {poll.description && (
                                    <p className="text-[11px] text-foreground-muted mb-1 truncate">{poll.description}</p>
                                )}
                                <p className="text-[10px] text-foreground-muted font-mono">
                                    {poll.poll_questions?.length ?? 0} preguntas ·{" "}
                                    {poll.end_at
                                        ? `Cierra: ${new Date(poll.end_at).toLocaleDateString("es-CL")}`
                                        : "Sin fecha de cierre"}
                                </p>
                            </div>

                            <div className="flex gap-2 flex-shrink-0">
                                <button
                                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/encuestas/${poll.id}`); }}
                                    className="px-2 py-1 rounded text-[10px] font-mono transition-all"
                                    style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)", color: "#00E5FF" }}
                                    title="Copiar enlace"
                                >
                                    🔗
                                </button>
                                <button
                                    onClick={() => openEdit(poll)}
                                    className="px-2 py-1 rounded text-[10px] font-mono transition-all"
                                    style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)", color: "#D4AF37" }}
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleDelete(poll)}
                                    className="px-2 py-1 rounded text-[10px] font-mono transition-all"
                                    style={{ background: "rgba(255,7,58,0.08)", border: "1px solid rgba(255,7,58,0.2)", color: "#FF073A" }}
                                >
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal formulario */}
            {showForm && (
                <div
                    className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
                    style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
                >
                    <div
                        className="w-full max-w-2xl rounded-2xl p-6 my-auto"
                        style={{ background: "#0F0F0F", border: "1px solid rgba(212,175,55,0.2)" }}
                    >
                        <h2 className="text-lg font-bold mb-4" style={{ color: "#D4AF37" }}>
                            {editingPoll ? "Editar Encuesta" : "Nueva Encuesta"}
                        </h2>

                        {/* Título */}
                        <div className="mb-4">
                            <label className="block text-[10px] font-mono uppercase tracking-wider text-foreground-muted mb-1">Título *</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="¿Aprueba la gestión del gobierno?"
                                className="w-full px-3 py-2 rounded-lg text-sm bg-transparent text-foreground"
                                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                            />
                        </div>

                        {/* Descripción */}
                        <div className="mb-4">
                            <label className="block text-[10px] font-mono uppercase tracking-wider text-foreground-muted mb-1">Descripción (opcional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                                placeholder="Contexto o aclaración de la pregunta"
                                className="w-full px-3 py-2 rounded-lg text-sm bg-transparent text-foreground resize-none"
                                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                            />
                        </div>

                        {/* Imagen cabecera */}
                        <div className="mb-4">
                            <label className="block text-[10px] font-mono uppercase tracking-wider text-foreground-muted mb-1">Imagen de Cabecera</label>
                            <div className="flex items-center gap-3">
                                {coverUrl && (
                                    <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0">
                                        <Image src={coverUrl} alt="" width={80} height={56} className="object-cover w-full h-full" />
                                    </div>
                                )}
                                <button
                                    onClick={() => fileRef.current?.click()}
                                    disabled={uploading}
                                    className="px-3 py-2 rounded-lg text-[11px] font-mono transition-all"
                                    style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.3)", color: "#D4AF37", opacity: uploading ? 0.6 : 1 }}
                                >
                                    {uploading ? "⏳ Subiendo..." : "📁 Seleccionar imagen"}
                                </button>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }}
                                />
                                {coverUrl && (
                                    <button onClick={() => setCoverUrl("")} className="text-[10px] text-foreground-muted hover:text-red-400">✕ Quitar</button>
                                )}
                            </div>
                            <p className="text-[9px] text-foreground-muted mt-1 font-mono">JPEG · PNG · WEBP · Máx 5 MB</p>
                        </div>

                        {/* Fechas */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label className="block text-[10px] font-mono uppercase tracking-wider text-foreground-muted mb-1">Fecha de Inicio</label>
                                <input
                                    type="datetime-local"
                                    value={startAt}
                                    onChange={(e) => setStartAt(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent text-foreground"
                                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono uppercase tracking-wider text-foreground-muted mb-1">Fecha de Cierre</label>
                                <input
                                    type="datetime-local"
                                    value={endAt}
                                    onChange={(e) => setEndAt(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent text-foreground"
                                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                                />
                            </div>
                        </div>

                        {/* Activa */}
                        <div className="flex items-center gap-3 mb-6">
                            <button
                                onClick={() => setIsActive(!isActive)}
                                className="w-10 h-5 rounded-full transition-all relative"
                                style={{ background: isActive ? "#39FF14" : "rgba(255,255,255,0.1)" }}
                            >
                                <span
                                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                                    style={{ left: isActive ? "calc(100% - 18px)" : "2px" }}
                                />
                            </button>
                            <span className="text-xs text-foreground-muted">Encuesta activa (visible al público)</span>
                        </div>

                        {/* ── Preguntas ── */}
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-[10px] font-mono uppercase tracking-wider text-foreground-muted">
                                    Preguntas ({questions.length})
                                </label>
                                <button
                                    onClick={() => setQuestions((prev) => [...prev, emptyQuestion(prev.length)])}
                                    className="text-[10px] font-mono px-2 py-1 rounded"
                                    style={{ background: "rgba(57,255,20,0.08)", border: "1px solid rgba(57,255,20,0.2)", color: "#39FF14" }}
                                >
                                    + Agregar pregunta
                                </button>
                            </div>

                            <div className="space-y-4">
                                {questions.map((q, qIdx) => (
                                    <div
                                        key={qIdx}
                                        className="rounded-xl p-4"
                                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[10px] font-mono text-foreground-muted uppercase">Pregunta {qIdx + 1}</span>
                                            {questions.length > 1 && (
                                                <button
                                                    onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== qIdx))}
                                                    className="text-[10px] text-foreground-muted hover:text-red-400"
                                                >
                                                    ✕ Eliminar
                                                </button>
                                            )}
                                        </div>

                                        {/* Texto pregunta */}
                                        <input
                                            value={q.question_text}
                                            onChange={(e) => updateQuestion(qIdx, { question_text: e.target.value })}
                                            placeholder="Escribe la pregunta..."
                                            className="w-full px-3 py-2 rounded-lg text-sm bg-transparent text-foreground mb-3"
                                            style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                                        />

                                        {/* Tipo */}
                                        <div className="flex gap-2 mb-3">
                                            {(["multiple_choice", "numeric_scale"] as const).map((t) => (
                                                <button
                                                    key={t}
                                                    onClick={() => updateQuestion(qIdx, { question_type: t })}
                                                    className="flex-1 py-1.5 rounded-lg text-[10px] font-mono transition-all"
                                                    style={{
                                                        background: q.question_type === t ? "rgba(212,175,55,0.15)" : "transparent",
                                                        border: `1px solid ${q.question_type === t ? "rgba(212,175,55,0.5)" : "rgba(255,255,255,0.08)"}`,
                                                        color: q.question_type === t ? "#D4AF37" : "rgba(255,255,255,0.4)",
                                                    }}
                                                >
                                                    {t === "multiple_choice" ? "📋 Opción múltiple" : "🔢 Escala numérica"}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Opciones múltiples */}
                                        {q.question_type === "multiple_choice" && (
                                            <div className="space-y-2">
                                                {q.options.map((opt, oIdx) => (
                                                    <div key={oIdx} className="flex gap-2">
                                                        <input
                                                            value={opt}
                                                            onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                                                            placeholder={`Opción ${oIdx + 1}`}
                                                            className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-transparent text-foreground"
                                                            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                                                        />
                                                        {q.options.length > 2 && (
                                                            <button onClick={() => removeOption(qIdx, oIdx)} className="text-[10px] text-foreground-muted hover:text-red-400">✕</button>
                                                        )}
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => addOption(qIdx)}
                                                    className="text-[10px] font-mono text-foreground-muted hover:text-foreground"
                                                >
                                                    + Agregar opción
                                                </button>
                                            </div>
                                        )}

                                        {/* Escala numérica */}
                                        {q.question_type === "numeric_scale" && (
                                            <div className="flex items-center gap-4">
                                                <div>
                                                    <label className="block text-[9px] font-mono text-foreground-muted mb-1">Mín</label>
                                                    <select
                                                        value={q.scale_min}
                                                        onChange={(e) => updateQuestion(qIdx, { scale_min: Number(e.target.value) })}
                                                        className="px-2 py-1 rounded text-xs bg-transparent text-foreground"
                                                        style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                                                    >
                                                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                                                    </select>
                                                </div>
                                                <span className="text-foreground-muted text-xs mt-4">→</span>
                                                <div>
                                                    <label className="block text-[9px] font-mono text-foreground-muted mb-1">Máx (2–10)</label>
                                                    <select
                                                        value={q.scale_max}
                                                        onChange={(e) => updateQuestion(qIdx, { scale_max: Number(e.target.value) })}
                                                        className="px-2 py-1 rounded text-xs bg-transparent text-foreground"
                                                        style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                                                    >
                                                        {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                                                    </select>
                                                </div>
                                                <p className="text-[10px] text-foreground-muted mt-4 font-mono">
                                                    Escala: {q.scale_min}–{q.scale_max} puntos
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Error dentro del modal */}
                        {message && message.type === "error" && (
                            <div
                                className="rounded-lg p-3 mb-4 text-xs font-mono"
                                style={{ backgroundColor: "rgba(255,7,58,0.08)", border: "1px solid rgba(255,7,58,0.2)", color: "#FF073A" }}
                            >
                                {message.text}
                            </div>
                        )}

                        {/* Botones */}
                        <div className="flex justify-end gap-3 mt-2">
                            <button
                                onClick={() => setShowForm(false)}
                                className="px-4 py-2 rounded-lg text-xs font-mono text-foreground-muted hover:text-foreground transition-colors"
                                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:scale-105"
                                style={{ background: "linear-gradient(135deg, #D4AF37, #B8860B)", color: "#0A0A0A" }}
                            >
                                {editingPoll ? "Actualizar" : "Crear Encuesta"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
