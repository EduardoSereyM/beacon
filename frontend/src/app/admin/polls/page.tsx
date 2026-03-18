/**
 * BEACON PROTOCOL — Admin Polls (CRUD)
 * ======================================
 * Crear, listar, editar y desactivar encuestas ciudadanas.
 * Soporta imagen de cabecera y múltiples preguntas con tipo individual.
 * Tipos: "multiple_choice" (opciones) y "scale" (escala numérica 2-10 puntos).
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PollQuestion {
  text: string;
  type: "multiple_choice" | "scale";
  options?: string[];
  scale_points?: number;
}

interface PollItem {
  id: string;
  title: string;
  description: string | null;
  header_image: string | null;
  questions: PollQuestion[];
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  total_votes: number;
  category: string;
  requires_auth: boolean;
  access_code: string | null;
}

const POLL_CATEGORIES: { value: string; label: string }[] = [
  { value: "general",      label: "General" },
  { value: "politica",     label: "Política" },
  { value: "economia",     label: "Economía" },
  { value: "salud",        label: "Salud" },
  { value: "educacion",    label: "Educación" },
  { value: "espectaculos", label: "Espectáculos" },
  { value: "deporte",      label: "Deporte" },
  { value: "cultura",      label: "Cultura" },
];

const EMPTY_QUESTION = (): PollQuestion => ({
  text: "",
  type: "multiple_choice",
  options: ["", ""],
  scale_points: undefined,
});

const EMPTY_SCALE_QUESTION = (): PollQuestion => ({
  text: "",
  type: "scale",
  options: undefined,
  scale_points: 5,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string {
  return localStorage.getItem("beacon_token") || "";
}

function handle401(): void {
  localStorage.removeItem("beacon_token");
  localStorage.removeItem("beacon_user");
  window.dispatchEvent(new CustomEvent("beacon:session-expired"));
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function toLocalDatetimeInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toISOString(local: string): string {
  return local ? new Date(local).toISOString() : "";
}

// ─── Sub-componente: Editor de pregunta ───────────────────────────────────────

interface QuestionEditorProps {
  index: number;
  question: PollQuestion;
  total: number;
  onChange: (q: PollQuestion) => void;
  onRemove: () => void;
}

function QuestionEditor({ index, question, total, onChange, onRemove }: QuestionEditorProps) {
  const inputStyle = {
    width: "100%",
    padding: "8px 11px",
    borderRadius: 7,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    color: "#f5f5f5",
    fontSize: 12,
    outline: "none",
  };

  const handleTypeChange = (t: "multiple_choice" | "scale") => {
    if (t === "multiple_choice") {
      onChange({ ...question, type: t, options: question.options?.length ? question.options : ["", ""], scale_points: undefined });
    } else {
      onChange({ ...question, type: t, scale_points: question.scale_points ?? 5, options: undefined });
    }
  };

  const handleOptionChange = (i: number, val: string) => {
    const opts = [...(question.options || [])];
    opts[i] = val;
    onChange({ ...question, options: opts });
  };

  const addOption = () => {
    const opts = [...(question.options || [])];
    if (opts.length < 8) onChange({ ...question, options: [...opts, ""] });
  };

  const removeOption = (i: number) => {
    const opts = (question.options || []).filter((_, idx) => idx !== i);
    onChange({ ...question, options: opts });
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10,
      padding: "14px 16px",
    }}>
      {/* Header pregunta */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(0,229,255,0.6)", textTransform: "uppercase", letterSpacing: "0.1em", paddingTop: 4 }}>
          Pregunta {index + 1}
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {/* Selector tipo */}
          {(["multiple_choice", "scale"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTypeChange(t)}
              style={{
                padding: "3px 10px",
                borderRadius: 5,
                fontSize: 10,
                fontFamily: "monospace",
                border: `1px solid ${question.type === t ? "#00E5FF" : "rgba(255,255,255,0.1)"}`,
                background: question.type === t ? "rgba(0,229,255,0.1)" : "rgba(255,255,255,0.03)",
                color: question.type === t ? "#00E5FF" : "rgba(255,255,255,0.4)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t === "multiple_choice" ? "📝 Múltiple" : "📊 Escala"}
            </button>
          ))}
          {/* Eliminar (solo si hay más de 1) */}
          {total > 1 && (
            <button
              type="button"
              onClick={onRemove}
              style={{
                padding: "3px 8px",
                borderRadius: 5,
                fontSize: 11,
                background: "rgba(255,7,58,0.07)",
                color: "#FF073A",
                border: "1px solid rgba(255,7,58,0.15)",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Texto de la pregunta */}
      <input
        style={{ ...inputStyle, marginBottom: 10 }}
        value={question.text}
        onChange={(e) => onChange({ ...question, text: e.target.value })}
        placeholder={`ej: ¿Cómo evalúa la gestión del gobierno?`}
      />

      {/* Opciones múltiples */}
      {question.type === "multiple_choice" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Opciones (mín. 2)
          </span>
          {(question.options || []).map((opt, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={opt}
                onChange={(e) => handleOptionChange(i, e.target.value)}
                placeholder={`Opción ${i + 1}`}
              />
              {(question.options || []).length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  style={{
                    padding: "0 10px",
                    borderRadius: 6,
                    background: "rgba(255,7,58,0.07)",
                    color: "#FF073A",
                    border: "1px solid rgba(255,7,58,0.15)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {(question.options || []).length < 8 && (
            <button
              type="button"
              onClick={addOption}
              style={{
                alignSelf: "flex-start",
                padding: "5px 12px",
                borderRadius: 5,
                fontSize: 10,
                fontFamily: "monospace",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.35)",
                border: "1px solid rgba(255,255,255,0.07)",
                cursor: "pointer",
                marginTop: 2,
              }}
            >
              + Agregar opción
            </button>
          )}
        </div>
      )}

      {/* Escala numérica */}
      {question.type === "scale" && (
        <div>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Puntos de escala (2 – 10)
          </span>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((pts) => (
              <button
                key={pts}
                type="button"
                onClick={() => onChange({ ...question, scale_points: pts })}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  border: `1px solid ${question.scale_points === pts ? "#00E5FF" : "rgba(255,255,255,0.1)"}`,
                  background: question.scale_points === pts ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.03)",
                  color: question.scale_points === pts ? "#00E5FF" : "rgba(255,255,255,0.45)",
                  cursor: "pointer",
                }}
              >
                {pts}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "monospace", marginTop: 6 }}>
            Escala de 1 a {question.scale_points ?? 5} puntos
          </p>
        </div>
      )}
    </div>
  );
}

// ─── ResultsPanel: visualización de votos por encuesta ────────────────────────

interface PollResultData {
  total_votes: number;
  poll_type: "multiple_choice" | "scale";
  options: string[] | null;
  results: { option?: string; count?: number; pct?: number; average?: number }[];
  is_open: boolean;
  title: string;
}

function ResultsPanel({ pollId }: { pollId: string }) {
  const [data, setData] = useState<PollResultData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/polls/${pollId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [pollId]);

  if (loading) return (
    <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.2)" }}>Cargando resultados…</p>
    </div>
  );

  if (!data) return (
    <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <p style={{ fontSize: 10, fontFamily: "monospace", color: "#FF073A" }}>Sin datos de resultados.</p>
    </div>
  );

  return (
    <div style={{ padding: "16px 20px 18px", borderTop: "1px solid rgba(0,229,255,0.08)", background: "rgba(0,229,255,0.02)" }}>
      {/* Header resultados */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#00E5FF", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          📊 Resultados en vivo
        </span>
        <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "#f5f5f5" }}>
          {data.total_votes} {data.total_votes === 1 ? "voto" : "votos"}
        </span>
      </div>

      {data.total_votes === 0 ? (
        <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>
          Aún no hay votos registrados.
        </p>
      ) : data.poll_type === "scale" ? (
        /* Scale: promedio grande */
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 40, fontFamily: "monospace", fontWeight: 900, color: "#00E5FF", lineHeight: 1 }}>
              {data.results[0]?.average ?? "–"}
            </p>
            <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
              promedio
            </p>
          </div>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 18, fontFamily: "monospace", fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>
              {data.results[0]?.count ?? 0}
            </p>
            <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
              respuestas
            </p>
          </div>
        </div>
      ) : (
        /* Multiple choice: barras */
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.results.map((r) => {
            const pct = r.pct ?? 0;
            const isWinner = pct === Math.max(...data.results.map((x) => x.pct ?? 0));
            return (
              <div key={r.option}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: isWinner ? "#f5f5f5" : "rgba(255,255,255,0.5)", fontWeight: isWinner ? 600 : 400, display: "flex", alignItems: "center", gap: 6 }}>
                    {isWinner && data.total_votes > 0 && <span style={{ fontSize: 9, color: "#39FF14" }}>▲</span>}
                    {r.option}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: isWinner ? "#39FF14" : "rgba(255,255,255,0.3)", fontWeight: isWinner ? 700 : 400 }}>
                    {pct}% <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>({r.count})</span>
                  </span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: isWinner
                        ? "linear-gradient(90deg, #39FF14, #00E5FF)"
                        : "rgba(255,255,255,0.15)",
                      borderRadius: 4,
                      transition: "width 0.8s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminPollsPage() {
  const [items, setItems] = useState<PollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<PollItem | null>(null);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PollQuestion[]>([EMPTY_QUESTION()]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [category, setCategory] = useState("general");
  const [requiresAuth, setRequiresAuth] = useState(true);
  const [accessCode, setAccessCode] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  function generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O,0,I,1 para evitar confusión
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  function togglePrivate() {
    if (!isPrivate) {
      setAccessCode(generateCode());
      setIsPrivate(true);
    } else {
      setAccessCode("");
      setIsPrivate(false);
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPolls = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/polls`, { headers: authHeaders() });
      if (res.status === 401) { handle401(); return; }
      if (res.ok) {
        const d = await res.json();
        setItems(d.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolls(); }, [fetchPolls]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setHeaderImage(null);
    setQuestions([EMPTY_QUESTION()]); setStartsAt(""); setEndsAt("");
    setCategory("general"); setRequiresAuth(true); setAccessCode(""); setIsPrivate(false);
    setEditItem(null); setFormError(null);
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (p: PollItem) => {
    setTitle(p.title);
    setDescription(p.description || "");
    setHeaderImage(p.header_image || null);
    setQuestions(
      p.questions && p.questions.length > 0
        ? p.questions
        : [EMPTY_QUESTION()]
    );
    setStartsAt(toLocalDatetimeInput(p.starts_at));
    setEndsAt(toLocalDatetimeInput(p.ends_at));
    setCategory(p.category || "general");
    setRequiresAuth(p.requires_auth !== false);
    const existingCode = p.access_code || "";
    setAccessCode(existingCode);
    setIsPrivate(!!existingCode);
    setEditItem(p); setShowForm(true); setFormError(null);
  };

  // ─── Upload imagen ───
  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/v1/admin/polls/upload-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      if (res.status === 401) { handle401(); return; }
      if (!res.ok) throw new Error("Error subiendo imagen");
      const data = await res.json();
      setHeaderImage(data.url);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error al subir imagen");
    } finally {
      setUploading(false);
    }
  };

  // ─── Preguntas ───
  const updateQuestion = (i: number, q: PollQuestion) => {
    const updated = [...questions];
    updated[i] = q;
    setQuestions(updated);
  };

  const addQuestion = () => setQuestions([...questions, EMPTY_QUESTION()]);
  const addScaleQuestion = () => setQuestions([...questions, EMPTY_SCALE_QUESTION()]);
  const removeQuestion = (i: number) => setQuestions(questions.filter((_, idx) => idx !== i));

  // ─── Submit ───
  const handleSubmit = async () => {
    if (!title.trim()) { setFormError("El título es obligatorio"); return; }
    if (!startsAt || !endsAt) { setFormError("Las fechas son obligatorias"); return; }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) { setFormError(`Pregunta ${i + 1}: el texto es obligatorio`); return; }
      if (q.type === "multiple_choice") {
        const valid = (q.options || []).filter((o) => o.trim());
        if (valid.length < 2) { setFormError(`Pregunta ${i + 1}: se requieren al menos 2 opciones`); return; }
      }
      if (q.type === "scale" && (!q.scale_points || q.scale_points < 2 || q.scale_points > 10)) {
        setFormError(`Pregunta ${i + 1}: escala debe ser entre 2 y 10`); return;
      }
    }

    const cleanQuestions = questions.map((q) => ({
      text: q.text.trim(),
      type: q.type,
      ...(q.type === "multiple_choice" ? { options: (q.options || []).filter((o) => o.trim()) } : {}),
      ...(q.type === "scale" ? { scale_points: q.scale_points } : {}),
    }));

    setSaving(true); setFormError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        header_image: headerImage || null,
        questions: cleanQuestions,
        starts_at: toISOString(startsAt),
        ends_at: toISOString(endsAt),
        category,
        requires_auth: requiresAuth,
        ...(accessCode.trim() ? { access_code: accessCode.trim() } : {}),
      };

      const url = editItem
        ? `${API_URL}/api/v1/admin/polls/${editItem.id}`
        : `${API_URL}/api/v1/admin/polls`;
      const method = editItem ? "PATCH" : "POST";

      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
      if (res.status === 401) { handle401(); return; }
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Error al guardar");
      }

      setSuccessMsg(editItem ? "Encuesta actualizada ✓" : "Encuesta creada ✓");
      setTimeout(() => setSuccessMsg(null), 3000);
      setShowForm(false); resetForm(); fetchPolls();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: PollItem) => {
    try {
      await fetch(`${API_URL}/api/v1/admin/polls/${p.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ is_active: !p.is_active }),
      });
      fetchPolls();
    } catch {
      alert("Error al actualizar estado");
    }
  };

  // ─── Estilos compartidos ───
  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    color: "#f5f5f5", fontSize: 12, outline: "none",
  };
  const labelStyle = {
    fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const,
    letterSpacing: "0.1em", display: "block", marginBottom: 6,
  };

  // ─── Render ───
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#00E5FF" }}>Encuestas Ciudadanas</h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2, fontFamily: "monospace" }}>
            Multi-pregunta · Opción múltiple y escala numérica
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            padding: "8px 18px", borderRadius: 8, fontSize: 11, fontFamily: "monospace",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
            background: "rgba(0,229,255,0.1)", color: "#00E5FF",
            border: "1px solid rgba(0,229,255,0.22)", cursor: "pointer",
          }}
        >
          + Nueva Encuesta
        </button>
      </div>

      {successMsg && (
        <div style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(57,255,20,0.08)", border: "1px solid rgba(57,255,20,0.2)", color: "#39FF14", fontSize: 12, fontFamily: "monospace" }}>
          {successMsg}
        </div>
      )}

      {/* ═══ FORMULARIO ═══ */}
      {showForm && (
        <div style={{ background: "rgba(14,14,14,0.98)", border: "1px solid rgba(0,229,255,0.15)", borderRadius: 16, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#00E5FF" }}>
              {editItem ? "Editar encuesta" : "Crear encuesta"}
            </h2>
            <button onClick={() => { setShowForm(false); resetForm(); }} style={{ color: "rgba(255,255,255,0.3)", background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Título */}
            <div>
              <label style={labelStyle}>Título *</label>
              <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ej: ¿Aprueba la gestión del gobierno?" />
            </div>

            {/* Descripción */}
            <div>
              <label style={labelStyle}>Descripción (opcional)</label>
              <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contexto o aclaración de la encuesta" />
            </div>

            {/* Imagen de cabecera */}
            <div>
              <label style={labelStyle}>Imagen de cabecera (opcional)</label>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {/* Preview */}
                <div style={{
                  width: 80, height: 56, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {headerImage ? (
                    <img src={headerImage} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 20, opacity: 0.3 }}>🖼</span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      padding: "7px 14px", borderRadius: 7, fontSize: 11, fontFamily: "monospace",
                      background: "rgba(212,175,55,0.1)", color: "#D4AF37",
                      border: "1px solid rgba(212,175,55,0.25)", cursor: uploading ? "not-allowed" : "pointer",
                      opacity: uploading ? 0.7 : 1,
                    }}
                  >
                    {uploading ? "Subiendo…" : "📁 Seleccionar imagen"}
                  </button>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                    JPEG · PNG · WEBP · Máx 5 MB
                  </span>
                  {headerImage && (
                    <button
                      type="button"
                      onClick={() => setHeaderImage(null)}
                      style={{ fontSize: 10, color: "#FF073A", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontFamily: "monospace" }}
                    >
                      ✕ Quitar imagen
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Preguntas */}
            <div>
              <label style={labelStyle}>Preguntas *</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {questions.map((q, i) => (
                  <QuestionEditor
                    key={i}
                    index={i}
                    question={q}
                    total={questions.length}
                    onChange={(updated) => updateQuestion(i, updated)}
                    onRemove={() => removeQuestion(i)}
                  />
                ))}
                {/* Botones agregar pregunta */}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={addQuestion}
                    style={{
                      padding: "6px 14px", borderRadius: 6, fontSize: 11, fontFamily: "monospace",
                      background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)",
                      border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
                    }}
                  >
                    + Opción múltiple
                  </button>
                  <button
                    type="button"
                    onClick={addScaleQuestion}
                    style={{
                      padding: "6px 14px", borderRadius: 6, fontSize: 11, fontFamily: "monospace",
                      background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)",
                      border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
                    }}
                  >
                    + Escala numérica
                  </button>
                </div>
              </div>
            </div>

            {/* Fechas */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div>
                <label style={labelStyle}>Fecha de inicio *</label>
                <input type="datetime-local" style={inputStyle} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Fecha de cierre *</label>
                <input type="datetime-local" style={inputStyle} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>

            {/* Categoría + Modo acceso */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div>
                <label style={labelStyle}>Categoría</label>
                <select
                  style={{ ...inputStyle, cursor: "pointer" }}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {POLL_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value} style={{ background: "#111" }}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Modo de acceso</label>
                <button
                  type="button"
                  onClick={() => setRequiresAuth(!requiresAuth)}
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 11, fontFamily: "monospace",
                    background: requiresAuth ? "rgba(0,229,255,0.06)" : "rgba(57,255,20,0.06)",
                    color: requiresAuth ? "#00E5FF" : "#39FF14",
                    border: `1px solid ${requiresAuth ? "rgba(0,229,255,0.2)" : "rgba(57,255,20,0.2)"}`,
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  {requiresAuth ? "🔐 Requiere login" : "⚡ Flash — Sin login"}
                </button>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "monospace", display: "block", marginTop: 4 }}>
                  {requiresAuth ? "Solo usuarios registrados pueden votar" : "Cualquier persona puede votar (ideal para RRSS)"}
                </span>
              </div>
            </div>

            {/* Privacidad con código auto-generado */}
            <div>
              <label style={labelStyle}>Privacidad</label>
              <button
                type="button"
                onClick={togglePrivate}
                style={{
                  width: "100%", padding: "9px 14px", borderRadius: 8, fontSize: 11, fontFamily: "monospace",
                  background: isPrivate ? "rgba(212,175,55,0.08)" : "rgba(255,255,255,0.04)",
                  color: isPrivate ? "#D4AF37" : "rgba(255,255,255,0.4)",
                  border: `1px solid ${isPrivate ? "rgba(212,175,55,0.25)" : "rgba(255,255,255,0.09)"}`,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                {isPrivate ? "🔒 Encuesta privada — activada" : "🌐 Pública — clic para hacer privada"}
              </button>

              {isPrivate && accessCode && (
                <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 8, background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.2)" }}>
                  <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(212,175,55,0.6)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Código de acceso</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.2em", color: "#D4AF37", flex: 1 }}>
                      {accessCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(accessCode)}
                      style={{ padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "monospace", background: "rgba(212,175,55,0.1)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)", cursor: "pointer" }}
                    >
                      Copiar
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccessCode(generateCode())}
                      style={{ padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "monospace", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.09)", cursor: "pointer" }}
                    >
                      🔄 Nuevo
                    </button>
                  </div>
                  <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", marginTop: 6 }}>
                    Comparte este código con quienes quieras que participen
                  </p>
                </div>
              )}
            </div>
          </div>

          {formError && (
            <p style={{ fontSize: 11, color: "#FF073A", fontFamily: "monospace", marginTop: 14 }}>✗ {formError}</p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              style={{ padding: "8px 16px", borderRadius: 8, fontSize: 11, background: "transparent", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{
                padding: "8px 20px", borderRadius: 8, fontSize: 11, fontFamily: "monospace", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em",
                background: "rgba(0,229,255,0.1)", color: "#00E5FF",
                border: "1px solid rgba(0,229,255,0.25)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Guardando…" : editItem ? "Actualizar" : "Crear encuesta"}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div style={{ background: "rgba(14,14,14,0.9)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {items.length} encuesta{items.length !== 1 ? "s" : ""}
          </p>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>Cargando…</p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin encuestas. Crea la primera.</p>
          </div>
        ) : (
          <div>
            {items.map((p) => (
              <div
                key={p.id}
                style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: p.is_active ? 1 : 0.5 }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0 }}>
                    {/* Thumbnail */}
                    {p.header_image && (
                      <img
                        src={p.header_image}
                        alt=""
                        style={{ width: 44, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5" }}>{p.title}</span>
                        {p.is_active ? (
                          <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(57,255,20,0.1)", color: "#39FF14", border: "1px solid rgba(57,255,20,0.2)", fontFamily: "monospace" }}>ACTIVA</span>
                        ) : (
                          <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "monospace" }}>INACTIVA</span>
                        )}
                        <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(0,229,255,0.07)", color: "#00E5FF", border: "1px solid rgba(0,229,255,0.12)", fontFamily: "monospace" }}>
                          {p.questions?.length ?? 0} pregunta{(p.questions?.length ?? 0) !== 1 ? "s" : ""}
                        </span>
                        {p.category && p.category !== "general" && (
                          <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(212,175,55,0.07)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.15)", fontFamily: "monospace", textTransform: "capitalize" }}>
                            {POLL_CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category}
                          </span>
                        )}
                        {!p.requires_auth && (
                          <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(57,255,20,0.07)", color: "#39FF14", border: "1px solid rgba(57,255,20,0.15)", fontFamily: "monospace" }}>
                            ⚡ Flash
                          </span>
                        )}
                        {p.access_code && (
                          <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(212,175,55,0.07)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)", fontFamily: "monospace" }}>
                            🔒 {p.access_code}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
                        {formatDate(p.starts_at)} → {formatDate(p.ends_at)}
                        <span style={{ margin: "0 8px", color: "rgba(255,255,255,0.2)" }}>·</span>
                        <span style={{ color: "#00E5FF" }}>{p.total_votes} votos</span>
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => setExpandedResultId(expandedResultId === p.id ? null : p.id)}
                      style={{
                        padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "monospace",
                        background: expandedResultId === p.id ? "rgba(0,229,255,0.15)" : "rgba(0,229,255,0.05)",
                        color: "#00E5FF",
                        border: `1px solid ${expandedResultId === p.id ? "rgba(0,229,255,0.4)" : "rgba(0,229,255,0.12)"}`,
                        cursor: "pointer",
                      }}
                    >
                      📊 {p.total_votes}
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      style={{ padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "monospace", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggleActive(p)}
                      style={{
                        padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "monospace",
                        background: p.is_active ? "rgba(255,7,58,0.07)" : "rgba(57,255,20,0.07)",
                        color: p.is_active ? "#FF073A" : "#39FF14",
                        border: `1px solid ${p.is_active ? "rgba(255,7,58,0.15)" : "rgba(57,255,20,0.15)"}`,
                        cursor: "pointer",
                      }}
                    >
                      {p.is_active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>
                {/* Panel resultados expandible */}
                {expandedResultId === p.id && <ResultsPanel pollId={p.id} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
