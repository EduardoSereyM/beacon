/**
 * BEACON PROTOCOL — Admin Polls (CRUD)
 * ======================================
 * Crear, listar, editar y desactivar encuestas ciudadanas.
 * Soporta poll_type: "multiple_choice" (opciones) y "scale" (escala numérica).
 */

"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PollItem {
  id: string;
  title: string;
  description: string | null;
  poll_type: "multiple_choice" | "scale";
  options: string[] | null;
  scale_min: number;
  scale_max: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  total_votes: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string {
  return localStorage.getItem("beacon_token") || "";
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function toLocalDatetimeInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toISOString(localDatetime: string): string {
  if (!localDatetime) return "";
  return new Date(localDatetime).toISOString();
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminPollsPage() {
  const [items, setItems] = useState<PollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<PollItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pollType, setPollType] = useState<"multiple_choice" | "scale">("multiple_choice");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [scaleMin, setScaleMin] = useState(1);
  const [scaleMax, setScaleMax] = useState(5);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const fetchPolls = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/polls`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setItems(d.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPollType("multiple_choice");
    setOptions(["", ""]);
    setScaleMin(1);
    setScaleMax(5);
    setStartsAt("");
    setEndsAt("");
    setEditItem(null);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (p: PollItem) => {
    setTitle(p.title);
    setDescription(p.description || "");
    setPollType(p.poll_type);
    setOptions(p.options && p.options.length > 0 ? p.options : ["", ""]);
    setScaleMin(p.scale_min);
    setScaleMax(p.scale_max);
    setStartsAt(toLocalDatetimeInput(p.starts_at));
    setEndsAt(toLocalDatetimeInput(p.ends_at));
    setEditItem(p);
    setShowForm(true);
    setFormError(null);
  };

  const handleAddOption = () => setOptions([...options, ""]);
  const handleRemoveOption = (i: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, idx) => idx !== i));
  };
  const handleOptionChange = (i: number, val: string) => {
    const updated = [...options];
    updated[i] = val;
    setOptions(updated);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setFormError("El título es obligatorio"); return; }
    if (!startsAt || !endsAt) { setFormError("Las fechas son obligatorias"); return; }
    if (pollType === "multiple_choice") {
      const valid = options.filter((o) => o.trim().length > 0);
      if (valid.length < 2) { setFormError("Se requieren al menos 2 opciones válidas"); return; }
    }
    if (pollType === "scale" && scaleMin >= scaleMax) {
      setFormError("scale_max debe ser mayor que scale_min");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const validOptions =
        pollType === "multiple_choice" ? options.filter((o) => o.trim().length > 0) : null;

      if (editItem) {
        const res = await fetch(`${API_URL}/api/v1/admin/polls/${editItem.id}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            options: pollType === "multiple_choice" ? validOptions : editItem.options,
            starts_at: toISOString(startsAt),
            ends_at: toISOString(endsAt),
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.detail || "Error al actualizar");
        }
      } else {
        const res = await fetch(`${API_URL}/api/v1/admin/polls`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            poll_type: pollType,
            options: validOptions,
            scale_min: scaleMin,
            scale_max: scaleMax,
            starts_at: toISOString(startsAt),
            ends_at: toISOString(endsAt),
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.detail || "Error al crear");
        }
      }

      setSuccessMsg(editItem ? "Encuesta actualizada ✓" : "Encuesta creada ✓");
      setTimeout(() => setSuccessMsg(null), 3000);
      setShowForm(false);
      resetForm();
      fetchPolls();
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

  const inputStyle = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#f5f5f5",
    fontSize: 12,
    outline: "none",
  };

  const labelStyle = {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    display: "block",
    marginBottom: 6,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#00E5FF" }}>Encuestas Ciudadanas</h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2, fontFamily: "monospace" }}>
            Gestión de encuestas de opción múltiple y escala
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "monospace",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            background: "rgba(0,229,255,0.1)",
            color: "#00E5FF",
            border: "1px solid rgba(0,229,255,0.22)",
            cursor: "pointer",
          }}
        >
          + Nueva Encuesta
        </button>
      </div>

      {successMsg && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "rgba(57,255,20,0.08)",
            border: "1px solid rgba(57,255,20,0.2)",
            color: "#39FF14",
            fontSize: 12,
            fontFamily: "monospace",
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div
          style={{
            background: "rgba(14,14,14,0.98)",
            border: "1px solid rgba(0,229,255,0.15)",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#00E5FF" }}>
              {editItem ? "Editar encuesta" : "Crear encuesta"}
            </h2>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              style={{ color: "rgba(255,255,255,0.3)", background: "none", border: "none", fontSize: 18, cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Title */}
            <div>
              <label style={labelStyle}>Título *</label>
              <input
                style={inputStyle}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ej: ¿Aprueba la gestión del gobierno?"
              />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Descripción (opcional)</label>
              <input
                style={inputStyle}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contexto o aclaración de la pregunta"
              />
            </div>

            {/* Poll type (only for create) */}
            {!editItem && (
              <div>
                <label style={labelStyle}>Tipo de encuesta *</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {(["multiple_choice", "scale"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPollType(t)}
                      style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontFamily: "monospace",
                        border: `1px solid ${pollType === t ? "#00E5FF" : "rgba(255,255,255,0.1)"}`,
                        background: pollType === t ? "rgba(0,229,255,0.1)" : "rgba(255,255,255,0.03)",
                        color: pollType === t ? "#00E5FF" : "rgba(255,255,255,0.5)",
                        cursor: "pointer",
                      }}
                    >
                      {t === "multiple_choice" ? "📝 Opción múltiple" : "📊 Escala numérica"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Options for MC */}
            {pollType === "multiple_choice" && (
              <div>
                <label style={labelStyle}>Opciones (mín. 2) *</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {options.map((opt, i) => (
                    <div key={i} style={{ display: "flex", gap: 8 }}>
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        value={opt}
                        onChange={(e) => handleOptionChange(i, e.target.value)}
                        placeholder={`Opción ${i + 1}`}
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(i)}
                          style={{
                            padding: "0 12px",
                            borderRadius: 8,
                            background: "rgba(255,7,58,0.07)",
                            color: "#FF073A",
                            border: "1px solid rgba(255,7,58,0.15)",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {options.length < 8 && (
                    <button
                      type="button"
                      onClick={handleAddOption}
                      style={{
                        alignSelf: "flex-start",
                        padding: "6px 14px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontFamily: "monospace",
                        background: "rgba(255,255,255,0.04)",
                        color: "rgba(255,255,255,0.4)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        cursor: "pointer",
                      }}
                    >
                      + Agregar opción
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Scale config */}
            {pollType === "scale" && !editItem && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Valor mínimo</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={scaleMin}
                    min={0}
                    max={scaleMax - 1}
                    onChange={(e) => setScaleMin(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Valor máximo</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={scaleMax}
                    min={scaleMin + 1}
                    max={10}
                    onChange={(e) => setScaleMax(Number(e.target.value))}
                  />
                </div>
              </div>
            )}

            {/* Dates */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Fecha de inicio *</label>
                <input
                  type="datetime-local"
                  style={inputStyle}
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>Fecha de cierre *</label>
                <input
                  type="datetime-local"
                  style={inputStyle}
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>
          </div>

          {formError && (
            <p style={{ fontSize: 11, color: "#FF073A", fontFamily: "monospace", marginTop: 14 }}>
              ✗ {formError}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 11,
                background: "transparent",
                color: "rgba(255,255,255,0.4)",
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: "monospace",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: "rgba(0,229,255,0.1)",
                color: "#00E5FF",
                border: "1px solid rgba(0,229,255,0.25)",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Guardando…" : editItem ? "Actualizar" : "Crear encuesta"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div
        style={{
          background: "rgba(14,14,14,0.9)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
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
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  opacity: p.is_active ? 1 : 0.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5" }}>{p.title}</span>
                      {p.is_active ? (
                        <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(57,255,20,0.1)", color: "#39FF14", border: "1px solid rgba(57,255,20,0.2)", fontFamily: "monospace" }}>
                          ACTIVA
                        </span>
                      ) : (
                        <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "monospace" }}>
                          INACTIVA
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 9,
                          padding: "1px 7px",
                          borderRadius: 20,
                          background: "rgba(0,229,255,0.07)",
                          color: "#00E5FF",
                          border: "1px solid rgba(0,229,255,0.12)",
                          fontFamily: "monospace",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {p.poll_type === "multiple_choice" ? "MC" : `Escala ${p.scale_min}–${p.scale_max}`}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
                      {formatDate(p.starts_at)} → {formatDate(p.ends_at)}
                      <span style={{ margin: "0 8px", color: "rgba(255,255,255,0.2)" }}>·</span>
                      <span style={{ color: "#00E5FF" }}>{p.total_votes} votos</span>
                      {p.poll_type === "multiple_choice" && p.options && (
                        <>
                          <span style={{ margin: "0 8px", color: "rgba(255,255,255,0.2)" }}>·</span>
                          <span style={{ color: "rgba(255,255,255,0.3)" }}>{p.options.length} opciones</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => openEdit(p)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontFamily: "monospace",
                        background: "rgba(0,229,255,0.07)",
                        color: "#00E5FF",
                        border: "1px solid rgba(0,229,255,0.15)",
                        cursor: "pointer",
                      }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggleActive(p)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontFamily: "monospace",
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
