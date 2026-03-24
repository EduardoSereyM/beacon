/**
 * BEACON PROTOCOL — /encuestas (Lista de Encuestas Ciudadanas)
 * =============================================================
 * Server Component con lista de encuestas activas.
 * Cada card muestra imagen + título + estado y linkea a /encuestas/[id].
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuthStore } from "@/store";
import usePermissions from "@/hooks/usePermissions";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PollItem {
  id: string;
  title: string;
  description: string | null;
  header_image: string | null;
  poll_type: "multiple_choice" | "scale";
  options: string[] | null;
  scale_min: number;
  scale_max: number;
  starts_at: string;
  ends_at: string;
  total_votes: number;
  is_open: boolean;
  category: string;
  requires_auth: boolean;
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: "",             label: "Todas" },
  { value: "politica",     label: "Política" },
  { value: "economia",     label: "Economía" },
  { value: "salud",        label: "Salud" },
  { value: "educacion",    label: "Educación" },
  { value: "espectaculos", label: "Espectáculos" },
  { value: "deporte",      label: "Deporte" },
  { value: "cultura",      label: "Cultura" },
  { value: "general",      label: "General" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── PollCard ─────────────────────────────────────────────────────────────────

function PollCard({ poll }: { poll: PollItem }) {
  const typeLabel =
    poll.poll_type === "multiple_choice"
      ? "Opción múltiple"
      : `Escala ${poll.scale_min}–${poll.scale_max}`;

  return (
    <Link href={`/encuestas/${poll.id}`} style={{ textDecoration: "none" }}>
      <div
        style={{
          background: "rgba(17,17,17,0.9)",
          border: `1px solid ${poll.is_open ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 16,
          overflow: "hidden",
          cursor: "pointer",
          transition: "border-color 0.2s, transform 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = poll.is_open
            ? "rgba(57,255,20,0.4)"
            : "rgba(255,255,255,0.15)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = poll.is_open
            ? "rgba(57,255,20,0.15)"
            : "rgba(255,255,255,0.07)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        }}
      >
        {/* Imagen de cabecera */}
        {poll.header_image ? (
          <div className="relative w-full" style={{ height: 160 }}>
            <Image
              src={poll.header_image}
              alt={poll.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 560px"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, transparent 50%, rgba(10,10,10,0.85))",
              }}
            />
            {/* Badge abierta/cerrada sobre imagen */}
            <div className="absolute top-3 left-3">
              {poll.is_open ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "#39FF14",
                    background: "rgba(0,0,0,0.65)",
                    padding: "3px 10px",
                    borderRadius: 20,
                    border: "1px solid rgba(57,255,20,0.3)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#39FF14",
                      display: "inline-block",
                    }}
                  />
                  ABIERTA
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.5)",
                    background: "rgba(0,0,0,0.65)",
                    padding: "3px 10px",
                    borderRadius: 20,
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  CERRADA
                </span>
              )}
            </div>
          </div>
        ) : (
          /* Placeholder sin imagen */
          <div
            style={{
              height: 80,
              background: poll.is_open
                ? "linear-gradient(135deg, rgba(57,255,20,0.06), rgba(0,229,255,0.04))"
                : "rgba(255,255,255,0.02)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 20px",
            }}
          >
            <span style={{ fontSize: 28 }}>📊</span>
            {poll.is_open ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "#39FF14",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#39FF14",
                    display: "inline-block",
                  }}
                />
                ABIERTA
              </span>
            ) : (
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.3)",
                }}
              >
                CERRADA
              </span>
            )}
          </div>
        )}

        {/* Contenido */}
        <div style={{ padding: "16px 20px 18px" }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#f5f5f5",
              marginBottom: 6,
              lineHeight: 1.4,
            }}
          >
            {poll.title}
          </h3>
          {poll.description && (
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.4)",
                marginBottom: 10,
                lineHeight: 1.5,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {poll.description}
            </p>
          )}

          {/* Meta row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: "#00E5FF",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: "rgba(0,229,255,0.07)",
                  border: "1px solid rgba(0,229,255,0.15)",
                }}
              >
                {typeLabel}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.3)",
                }}
              >
                {poll.total_votes} {poll.total_votes === 1 ? "voto" : "votos"}
              </span>
            </div>
            <span
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                color: poll.is_open ? "rgba(57,255,20,0.6)" : "rgba(255,255,255,0.2)",
              }}
            >
              {poll.is_open
                ? `Cierra ${formatDate(poll.ends_at)}`
                : `Cerró ${formatDate(poll.ends_at)}`}
            </span>
          </div>

          {/* CTA */}
          {poll.is_open && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 0",
                borderTop: "1px solid rgba(57,255,20,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "#39FF14",
                  fontWeight: 600,
                }}
              >
                Participar →
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EncuestasPage() {
  const { token } = useAuthStore();
  const { isVerified } = usePermissions();
  const [items, setItems] = useState<PollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPolls = useCallback(async (cat: string, search: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cat) params.set("category", cat);
      if (search.trim()) params.set("search", search.trim());
      const url = `${API_URL}/api/v1/polls${params.toString() ? "?" + params.toString() : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError("Error al cargar las encuestas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolls(activeCategory, searchQuery);
  }, [fetchPolls, activeCategory]);

  // Búsqueda con debounce 400ms
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchPolls(activeCategory, val), 400);
  };

  return (
    <div className="min-h-screen pt-20 pb-12 px-6">
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ paddingTop: 32, paddingBottom: 24, textAlign: "center" }}>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            <span className="text-foreground">Encuestas </span>
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #00E5FF, #39FF14)" }}
            >
              Ciudadanas
            </span>
          </h1>
          <p className="text-sm text-foreground-muted max-w-sm mx-auto">
            Opina sobre los temas que definen el futuro del país. Tu voz, ponderada por tu nivel de integridad.
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {token && (
              <Link
                href="/encuestas/mis"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 11, fontFamily: "monospace", color: "#00E5FF",
                  padding: "5px 14px", borderRadius: 20,
                  border: "1px solid rgba(0,229,255,0.25)",
                  background: "rgba(0,229,255,0.06)", textDecoration: "none",
                }}
              >
                🗂 Mis Encuestas
              </Link>
            )}
            {isVerified && (
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 11, fontFamily: "monospace", color: "#39FF14",
                  padding: "5px 14px", borderRadius: 20,
                  border: "1px solid rgba(57,255,20,0.25)",
                  background: "rgba(57,255,20,0.06)", cursor: "pointer",
                }}
              >
                + Crear Encuesta
              </button>
            )}
          </div>
        </div>

        {/* Búsqueda */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar encuesta…"
            style={{
              width: "100%", padding: "9px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "#f5f5f5", fontSize: 12, outline: "none",
              fontFamily: "monospace", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Filtro categorías */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 28 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setActiveCategory(c.value)}
              style={{
                padding: "5px 14px",
                borderRadius: 20,
                fontSize: 10,
                fontFamily: "monospace",
                letterSpacing: "0.05em",
                border: `1px solid ${activeCategory === c.value ? "rgba(0,229,255,0.4)" : "rgba(255,255,255,0.1)"}`,
                background: activeCategory === c.value ? "rgba(0,229,255,0.1)" : "transparent",
                color: activeCategory === c.value ? "#00E5FF" : "rgba(255,255,255,0.4)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
              Cargando encuestas…
            </p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ fontSize: 13, color: "#ff5050", marginBottom: 12 }}>{error}</p>
            <button
              onClick={() => fetchPolls(activeCategory, searchQuery)}
              style={{
                fontSize: 11,
                padding: "8px 16px",
                borderRadius: 8,
                background: "rgba(0,229,255,0.08)",
                color: "#00E5FF",
                border: "1px solid rgba(0,229,255,0.2)",
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Vacío */}
        {!loading && !error && items.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "48px 24px",
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(0,229,255,0.04), rgba(57,255,20,0.04))",
              border: "1px solid rgba(0,229,255,0.1)",
            }}
          >
            <p style={{ fontSize: 40, marginBottom: 12 }}>📡</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f5f5f5", marginBottom: 6 }}>
              Sin encuestas activas
            </p>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
              El Protocolo prepara nuevas consultas ciudadanas. Vuelve pronto.
            </p>
          </div>
        )}

        {/* Grid */}
        {!loading && !error && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {items.map((poll) => (
              <PollCard key={poll.id} poll={poll} />
            ))}
          </div>
        )}
      </div>

      {/* Modal crear encuesta */}
      {showCreate && (
        <CreatePollModal
          token={token!}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchPolls(activeCategory, searchQuery); }}
        />
      )}
    </div>
  );
}

// ─── CreatePollModal ──────────────────────────────────────────────────────────

interface QuestionForm {
  text: string;
  type: "multiple_choice" | "scale";
  allow_multiple: boolean;   // true = checkboxes, false = radio
  options: string[];
  scale_points: number;
  scale_min_label: string;
  scale_max_label: string;
}

function emptyQuestion(): QuestionForm {
  return { text: "", type: "multiple_choice", allow_multiple: false, options: ["", ""], scale_points: 5, scale_min_label: "", scale_max_label: "" };
}

function CreatePollModal({ token, onClose, onCreated }: { token: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [endsInDays, setEndsInDays] = useState(7);
  const [questions, setQuestions] = useState<QuestionForm[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = {
    width: "100%", padding: "8px 11px", borderRadius: 7,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
    color: "#f5f5f5", fontSize: 12, outline: "none", boxSizing: "border-box" as const,
  };
  const labelStyle = {
    fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const,
    letterSpacing: "0.1em", display: "block", marginBottom: 5,
  };

  const updateQ = (i: number, patch: Partial<QuestionForm>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const handleSubmit = async () => {
    if (!title.trim()) { setError("El título es obligatorio"); return; }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) { setError(`Pregunta ${i + 1}: texto obligatorio`); return; }
      if (q.type === "multiple_choice") {
        const valid = q.options.filter((o) => o.trim());
        if (valid.length < 2) { setError(`Pregunta ${i + 1}: mínimo 2 opciones`); return; }
      }
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        category,
        ends_in_days: endsInDays,
        questions: questions.map((q) => ({
          text: q.text.trim(),
          type: q.type,
          ...(q.type === "multiple_choice" ? { options: q.options.filter((o) => o.trim()), allow_multiple: q.allow_multiple } : {}),
          ...(q.type === "scale" ? {
            scale_points:    q.scale_points,
            scale_min_label: q.scale_min_label.trim() || undefined,
            scale_max_label: q.scale_max_label.trim() || undefined,
          } : {}),
        })),
      };
      const res = await fetch(`${API_URL}/api/v1/polls`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Error al crear");
      }
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "20px 16px", overflowY: "auto",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: "100%", maxWidth: 520,
        background: "rgba(14,14,14,0.99)", border: "1px solid rgba(57,255,20,0.2)",
        borderRadius: 16, padding: 24, marginTop: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#39FF14" }}>Crear Encuesta</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Título */}
          <div>
            <label style={labelStyle}>Título *</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ej: ¿Apruebas la nueva ley X?" />
          </div>

          {/* Descripción */}
          <div>
            <label style={labelStyle}>Descripción (opcional)</label>
            <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contexto breve" />
          </div>

          {/* Categoría + Duración */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Categoría</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.slice(1).map((c) => (
                  <option key={c.value} value={c.value} style={{ background: "#111" }}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Duración (días)</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[1, 3, 7, 14].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEndsInDays(d)}
                    style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 11, fontFamily: "monospace",
                      border: `1px solid ${endsInDays === d ? "#39FF14" : "rgba(255,255,255,0.1)"}`,
                      background: endsInDays === d ? "rgba(57,255,20,0.1)" : "rgba(255,255,255,0.03)",
                      color: endsInDays === d ? "#39FF14" : "rgba(255,255,255,0.4)", cursor: "pointer",
                    }}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preguntas */}
          <div>
            <label style={labelStyle}>Preguntas (máx. 2) *</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {questions.map((q, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(57,255,20,0.6)", textTransform: "uppercase" }}>Pregunta {i + 1}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {/* ◉ Única */}
                      {(() => {
                        const active = q.type === "multiple_choice" && !q.allow_multiple;
                        return (
                          <button key="unica" type="button"
                            onClick={() => updateQ(i, { type: "multiple_choice", allow_multiple: false })}
                            style={{ padding: "2px 8px", borderRadius: 5, fontSize: 9, fontFamily: "monospace", cursor: "pointer",
                              border: `1px solid ${active ? "#39FF14" : "rgba(255,255,255,0.1)"}`,
                              background: active ? "rgba(57,255,20,0.1)" : "rgba(255,255,255,0.02)",
                              color: active ? "#39FF14" : "rgba(255,255,255,0.35)",
                            }}>
                            ◉ Única
                          </button>
                        );
                      })()}
                      {/* ☑ Múltiple */}
                      {(() => {
                        const active = q.type === "multiple_choice" && q.allow_multiple;
                        return (
                          <button key="multiple" type="button"
                            onClick={() => updateQ(i, { type: "multiple_choice", allow_multiple: true })}
                            style={{ padding: "2px 8px", borderRadius: 5, fontSize: 9, fontFamily: "monospace", cursor: "pointer",
                              border: `1px solid ${active ? "#39FF14" : "rgba(255,255,255,0.1)"}`,
                              background: active ? "rgba(57,255,20,0.1)" : "rgba(255,255,255,0.02)",
                              color: active ? "#39FF14" : "rgba(255,255,255,0.35)",
                            }}>
                            ☑ Múltiple
                          </button>
                        );
                      })()}
                      {/* 📊 Escala */}
                      {(() => {
                        const active = q.type === "scale";
                        return (
                          <button key="scale" type="button"
                            onClick={() => updateQ(i, { type: "scale", allow_multiple: false })}
                            style={{ padding: "2px 8px", borderRadius: 5, fontSize: 9, fontFamily: "monospace", cursor: "pointer",
                              border: `1px solid ${active ? "#39FF14" : "rgba(255,255,255,0.1)"}`,
                              background: active ? "rgba(57,255,20,0.1)" : "rgba(255,255,255,0.02)",
                              color: active ? "#39FF14" : "rgba(255,255,255,0.35)",
                            }}>
                            📊 Escala
                          </button>
                        );
                      })()}
                      {questions.length > 1 && (
                        <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))}
                          style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, background: "rgba(255,7,58,0.07)", color: "#FF073A", border: "1px solid rgba(255,7,58,0.15)", cursor: "pointer" }}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <input style={{ ...inputStyle, marginBottom: 8 }} value={q.text} onChange={(e) => updateQ(i, { text: e.target.value })} placeholder="Texto de la pregunta" />
                  {q.type === "multiple_choice" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {q.options.map((opt, oi) => (
                        <div key={oi} style={{ display: "flex", gap: 5 }}>
                          <input style={{ ...inputStyle, flex: 1 }} value={opt} onChange={(e) => { const opts = [...q.options]; opts[oi] = e.target.value; updateQ(i, { options: opts }); }} placeholder={`Opción ${oi + 1}`} />
                          {q.options.length > 2 && (
                            <button type="button" onClick={() => updateQ(i, { options: q.options.filter((_, j) => j !== oi) })}
                              style={{ padding: "0 8px", borderRadius: 5, background: "rgba(255,7,58,0.07)", color: "#FF073A", border: "1px solid rgba(255,7,58,0.15)", cursor: "pointer", fontSize: 11 }}>✕</button>
                          )}
                        </div>
                      ))}
                      {q.options.length < 6 && (
                        <button type="button" onClick={() => updateQ(i, { options: [...q.options, ""] })}
                          style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: 5, fontSize: 10, fontFamily: "monospace", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer" }}>
                          + Opción
                        </button>
                      )}
                    </div>
                  )}
                  {q.type === "scale" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {/* Selector de puntos */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {[2, 3, 4, 5, 7, 10].map((pts) => (
                          <button key={pts} type="button" onClick={() => updateQ(i, { scale_points: pts })}
                            style={{ width: 34, height: 34, borderRadius: 7, fontSize: 12, fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
                              border: `1px solid ${q.scale_points === pts ? "#39FF14" : "rgba(255,255,255,0.1)"}`,
                              background: q.scale_points === pts ? "rgba(57,255,20,0.12)" : "rgba(255,255,255,0.02)",
                              color: q.scale_points === pts ? "#39FF14" : "rgba(255,255,255,0.4)",
                            }}>
                            {pts}
                          </button>
                        ))}
                      </div>
                      <p style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", marginTop: -4 }}>
                        Escala de 1 a {q.scale_points} puntos
                      </p>
                      {/* Etiquetas semánticas */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
                            1 = etiqueta mínimo
                          </label>
                          <input
                            style={{ ...inputStyle, fontSize: 11 }}
                            value={q.scale_min_label}
                            onChange={(e) => updateQ(i, { scale_min_label: e.target.value })}
                            placeholder="ej: Muy confusa"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
                            {q.scale_points} = etiqueta máximo
                          </label>
                          <input
                            style={{ ...inputStyle, fontSize: 11 }}
                            value={q.scale_max_label}
                            onChange={(e) => updateQ(i, { scale_max_label: e.target.value })}
                            placeholder="ej: Muy clara"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {questions.length < 2 && (
                <button type="button" onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
                  style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: 7, fontSize: 11, fontFamily: "monospace", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer" }}>
                  + Agregar pregunta ({questions.length}/2)
                </button>
              )}
            </div>
          </div>
        </div>

        {error && <p style={{ fontSize: 11, color: "#FF073A", fontFamily: "monospace", marginTop: 14 }}>✗ {error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 11, background: "transparent", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            style={{ padding: "8px 20px", borderRadius: 8, fontSize: 11, fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", background: "rgba(57,255,20,0.1)", color: "#39FF14", border: "1px solid rgba(57,255,20,0.25)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Creando…" : "Publicar Encuesta"}
          </button>
        </div>
      </div>
    </div>
  );
}
