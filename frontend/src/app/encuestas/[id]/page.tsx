/**
 * BEACON PROTOCOL — /encuestas/[id]
 * ====================================
 * Detalle de encuesta: imagen, preguntas (multi-pregunta desde JSONB),
 * votación y QR compartible.
 *
 * Endpoints reales:
 *   GET  /api/v1/polls/{id}       → detalle + resultados
 *   POST /api/v1/polls/{id}/vote  → votar con { option_value: string }
 */

"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import ShareQR from "@/components/shared/ShareQR";
import { useAuthStore } from "@/store";
import { useBeaconPulse } from "@/hooks/useBeaconPulse";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface QuestionDef {
  id: string;
  text: string;
  type: "multiple_choice" | "scale";
  options: string[] | null;
  scale_min?: number;
  scale_max?: number;
  order_index?: number;
}

interface PollResult {
  option?: string;
  count?: number;
  pct?: number;
  average?: number;
}

interface Poll {
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
  is_open: boolean;
  total_votes: number;
  results: PollResult[];
  questions: QuestionDef[] | null; // JSONB con multi-pregunta
}

interface EncuestaPageProps {
  params: Promise<{ id: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ─── Componente votación multi-pregunta ───────────────────────────────────────

function MultiQuestionForm({
  questions,
  onSubmit,
  submitting,
}: {
  questions: QuestionDef[];
  onSubmit: (answers: Record<string, string>) => void;
  submitting: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const setOption = (qid: string, val: string) =>
    setAnswers((p) => ({ ...p, [qid]: val }));

  function handleSubmit() {
    const missing = questions.find((q) => !answers[q.id]);
    if (missing) {
      setLocalError(`Responde: "${missing.text}"`);
      return;
    }
    setLocalError(null);
    onSubmit(answers);
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 20 }}>
        {questions.map((q, idx) => (
          <div
            key={q.id}
            style={{
              borderRadius: 12,
              padding: "16px 18px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Pregunta {idx + 1}
            </p>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5", marginBottom: 14 }}>
              {q.text}
            </p>

            {/* Opciones múltiple */}
            {q.type === "multiple_choice" && q.options && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {q.options.map((opt) => {
                  const sel = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setOption(q.id, opt)}
                      style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        borderRadius: 10,
                        fontSize: 12,
                        border: `1px solid ${sel ? "rgba(212,175,55,0.5)" : "rgba(255,255,255,0.07)"}`,
                        background: sel ? "rgba(212,175,55,0.1)" : "rgba(255,255,255,0.02)",
                        color: sel ? "#D4AF37" : "#f5f5f5",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {sel && <span style={{ fontSize: 10, color: "#D4AF37" }}>✓</span>}
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Escala numérica */}
            {q.type === "scale" && (
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Array.from(
                    { length: (q.scale_max ?? 5) - (q.scale_min ?? 1) + 1 },
                    (_, i) => (q.scale_min ?? 1) + i
                  ).map((n) => {
                    const sel = answers[q.id] === String(n);
                    return (
                      <button
                        key={n}
                        onClick={() => setOption(q.id, String(n))}
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 8,
                          border: `1px solid ${sel ? "rgba(57,255,20,0.5)" : "rgba(255,255,255,0.08)"}`,
                          background: sel ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.02)",
                          color: sel ? "#39FF14" : "rgba(255,255,255,0.5)",
                          fontSize: 13,
                          fontFamily: "monospace",
                          fontWeight: sel ? 700 : 400,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "monospace",
                      color: "rgba(255,255,255,0.3)",
                    }}
                  >
                    {q.scale_min ?? 1} — Mínimo
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "monospace",
                      color: "rgba(255,255,255,0.3)",
                    }}
                  >
                    Máximo — {q.scale_max ?? 5}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {localError && (
        <div
          style={{
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 11,
            fontFamily: "monospace",
            color: "#FF073A",
            background: "rgba(255,7,58,0.07)",
            border: "1px solid rgba(255,7,58,0.2)",
            marginBottom: 14,
          }}
        >
          {localError}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: "100%",
          padding: "12px 0",
          borderRadius: 12,
          fontSize: 12,
          fontFamily: "monospace",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          border: "none",
          background: submitting
            ? "rgba(212,175,55,0.3)"
            : "linear-gradient(135deg, #D4AF37, #B8860B)",
          color: "#0A0A0A",
          cursor: submitting ? "not-allowed" : "pointer",
          transition: "all 0.2s",
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? "Enviando…" : "Enviar respuesta"}
      </button>
    </div>
  );
}

// ─── Componente votación simple (legacy single-question) ──────────────────────

function SingleQuestionVote({
  poll,
  onVote,
  voting,
}: {
  poll: Poll;
  onVote: (val: string) => void;
  voting: boolean;
}) {
  const [scaleVal, setScaleVal] = useState(poll.scale_min ?? 1);

  if (poll.poll_type === "multiple_choice") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(poll.options || []).map((opt) => (
          <button
            key={opt}
            onClick={() => onVote(opt)}
            disabled={voting}
            style={{
              textAlign: "left",
              padding: "11px 14px",
              borderRadius: 10,
              fontSize: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
              color: "#f5f5f5",
              cursor: voting ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!voting)
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(212,175,55,0.4)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "rgba(255,255,255,0.08)";
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {Array.from(
          { length: (poll.scale_max ?? 5) - (poll.scale_min ?? 1) + 1 },
          (_, i) => (poll.scale_min ?? 1) + i
        ).map((n) => (
          <button
            key={n}
            onClick={() => setScaleVal(n)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              border: `1px solid ${scaleVal === n ? "rgba(57,255,20,0.5)" : "rgba(255,255,255,0.08)"}`,
              background:
                scaleVal === n ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.02)",
              color: scaleVal === n ? "#39FF14" : "rgba(255,255,255,0.5)",
              fontSize: 13,
              fontFamily: "monospace",
              fontWeight: scaleVal === n ? 700 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <button
        onClick={() => onVote(String(scaleVal))}
        disabled={voting}
        style={{
          padding: "10px 24px",
          borderRadius: 10,
          fontSize: 11,
          fontFamily: "monospace",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          border: "1px solid rgba(57,255,20,0.4)",
          background: "rgba(57,255,20,0.08)",
          color: "#39FF14",
          cursor: voting ? "not-allowed" : "pointer",
        }}
      >
        {voting ? "…" : `Votar ${scaleVal}`}
      </button>
    </div>
  );
}

// ─── Resultados ───────────────────────────────────────────────────────────────

function PollResults({
  poll,
  userVote,
}: {
  poll: Poll;
  userVote: string | null;
}) {
  if (poll.poll_type === "scale") {
    const r = poll.results[0];
    return (
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <p
          style={{
            fontSize: 48,
            fontFamily: "monospace",
            fontWeight: 900,
            color: "#00E5FF",
            lineHeight: 1,
          }}
        >
          {r?.average ?? "–"}
        </p>
        <p
          style={{
            fontSize: 10,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.3)",
            marginTop: 6,
          }}
        >
          promedio · {r?.count ?? 0} votos
        </p>
        {userVote && (
          <p
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: "#39FF14",
              marginTop: 10,
            }}
          >
            Tu voto: {userVote} ✓
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {poll.results.map((r) => {
        const pct = r.pct ?? 0;
        const isUser = userVote === r.option;
        return (
          <div
            key={r.option}
            style={{
              position: "relative",
              overflow: "hidden",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${isUser ? "rgba(0,229,255,0.4)" : "rgba(255,255,255,0.07)"}`,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                width: `${pct}%`,
                background: isUser
                  ? "rgba(0,229,255,0.1)"
                  : "rgba(255,255,255,0.04)",
                transition: "width 0.6s ease",
              }}
            />
            <div
              style={{
                position: "relative",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: isUser ? "#00E5FF" : "#f5f5f5",
                  fontWeight: isUser ? 600 : 400,
                }}
              >
                {isUser && "✓ "}
                {r.option}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: isUser ? "#00E5FF" : "rgba(255,255,255,0.3)",
                  fontWeight: isUser ? 700 : 400,
                }}
              >
                {pct}%
              </span>
            </div>
          </div>
        );
      })}
      <p
        style={{
          fontSize: 9,
          fontFamily: "monospace",
          color: "rgba(255,255,255,0.2)",
          textAlign: "right",
          marginTop: 4,
        }}
      >
        {poll.total_votes} {poll.total_votes === 1 ? "voto" : "votos"}
      </p>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EncuestaDetailPage({ params }: EncuestaPageProps) {
  const { id } = use(params);
  const { token } = useAuthStore();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [voted, setVoted] = useState(false);
  const [userVote, setUserVote] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState(false);

  // Efecto Kahoot — actualizar resultados en tiempo real post-voto
  useBeaconPulse(`poll:${id}`, (data) => {
    if (data.type === "POLL_PULSE" && poll && voted) {
      setPoll((p) =>
        p
          ? {
              ...p,
              results: data.results as PollResult[],
              total_votes: data.total_votes as number,
            }
          : p
      );
    }
  });

  const fetchPoll = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(`${API_URL}/api/v1/polls/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPoll(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPoll();
  }, [fetchPoll]);

  // ── Voto único (single-question) ──────────────────────────────
  async function handleSingleVote(optionValue: string) {
    if (!token) {
      setError("Debes iniciar sesión para votar.");
      return;
    }
    setVoting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/polls/${id}/vote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ option_value: optionValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al votar");
      setUserVote(optionValue);
      setVoted(true);
      setSuccessMsg(true);
      await fetchPoll(); // refrescar resultados
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al votar");
    } finally {
      setVoting(false);
    }
  }

  // ── Voto multi-pregunta ────────────────────────────────────────
  // Para multi-pregunta, se vota solo la primera pregunta (backend actual).
  async function handleMultiVote(answers: Record<string, string>) {
    if (!token) {
      setError("Debes iniciar sesión para votar.");
      return;
    }
    if (!poll?.questions?.length) return;

    // Votar con la respuesta de la primera pregunta
    const firstQ = poll.questions.sort(
      (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
    )[0];
    const optionValue = answers[firstQ.id];
    if (!optionValue) return;

    setVoting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/polls/${id}/vote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ option_value: optionValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al votar");
      setUserVote(optionValue);
      setVoted(true);
      setSuccessMsg(true);
      await fetchPoll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al votar");
    } finally {
      setVoting(false);
    }
  }

  // ─── Render states ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.3)",
          }}
          className="animate-pulse"
        >
          Cargando encuesta…
        </p>
      </div>
    );
  }

  if (notFound || !poll) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-4">📊</p>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
            Encuesta no encontrada o inactiva.
          </p>
          <Link
            href="/encuestas"
            style={{ fontSize: 11, fontFamily: "monospace", color: "#00E5FF" }}
          >
            ← Volver a encuestas
          </Link>
        </div>
      </div>
    );
  }

  const hasMultiQ = (poll.questions?.length ?? 0) > 1;
  const pageUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/encuestas/${id}`
      : `https://www.beaconchile.cl/encuestas/${id}`;

  return (
    <div className="min-h-screen pt-20 pb-16 px-6">
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <Link
            href="/encuestas"
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: "rgba(255,255,255,0.4)",
              textDecoration: "none",
            }}
          >
            ← Encuestas
          </Link>
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>/</span>
          <span
            style={{
              fontSize: 10,
              fontFamily: "monospace",
              color: "#39FF14",
              letterSpacing: "0.08em",
            }}
          >
            POLL:{id.slice(0, 8).toUpperCase()}
          </span>
          <div style={{ marginLeft: "auto" }}>
            <ShareQR url={pageUrl} title={poll.title} label="Compartir" />
          </div>
        </div>

        {/* Card principal */}
        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            border: `1px solid ${poll.is_open ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.08)"}`,
            background: "rgba(17,17,17,0.9)",
          }}
        >
          {/* Imagen cabecera */}
          {poll.header_image && (
            <div className="relative w-full" style={{ height: 220 }}>
              <Image
                src={poll.header_image}
                alt={poll.title}
                fill
                className="object-cover"
                sizes="640px"
                priority
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 30%, rgba(10,10,10,0.92))",
                }}
              />
              {/* Estado sobre imagen */}
              <div className="absolute bottom-4 left-5">
                {poll.is_open ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "#39FF14",
                      background: "rgba(0,0,0,0.7)",
                      padding: "3px 12px",
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
                    ABIERTA · cierra {formatDate(poll.ends_at)}
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "rgba(255,255,255,0.5)",
                      background: "rgba(0,0,0,0.7)",
                      padding: "3px 12px",
                      borderRadius: 20,
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    CERRADA
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{ padding: "24px 28px 28px" }}>
            {/* Título + descripción */}
            <h1
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#f5f5f5",
                marginBottom: 8,
                lineHeight: 1.3,
              }}
            >
              {poll.title}
            </h1>
            {poll.description && (
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.45)",
                  marginBottom: 8,
                  lineHeight: 1.6,
                }}
              >
                {poll.description}
              </p>
            )}
            {!poll.header_image && (
              <div style={{ marginBottom: 12 }}>
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
                    ABIERTA · cierra {formatDate(poll.ends_at)}
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "rgba(255,255,255,0.3)",
                    }}
                  >
                    Cerrada · {formatDate(poll.ends_at)}
                  </span>
                )}
              </div>
            )}

            {/* Divisor */}
            <div
              style={{
                height: 1,
                background: "rgba(255,255,255,0.06)",
                margin: "16px 0",
              }}
            />

            {/* ── Estado: ya votó ── */}
            {voted && successMsg ? (
              <div>
                <div
                  style={{
                    borderRadius: 14,
                    padding: "20px 24px",
                    textAlign: "center",
                    background: "rgba(57,255,20,0.05)",
                    border: "1px solid rgba(57,255,20,0.2)",
                    marginBottom: 20,
                  }}
                >
                  <p style={{ fontSize: 28, marginBottom: 8 }}>✅</p>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#39FF14",
                      marginBottom: 4,
                    }}
                  >
                    ¡Gracias por participar!
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "rgba(255,255,255,0.3)",
                    }}
                  >
                    Tu respuesta fue registrada con ponderación por integridad.
                  </p>
                </div>
                {/* Mostrar resultados post-voto */}
                <PollResults poll={poll} userVote={userVote} />
              </div>
            ) : !poll.is_open ? (
              /* ── Cerrada: solo resultados ── */
              <div>
                <p
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.3)",
                    marginBottom: 16,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Resultados finales
                </p>
                <PollResults poll={poll} userVote={null} />
              </div>
            ) : !token ? (
              /* ── Sin sesión ── */
              <div
                style={{
                  borderRadius: 12,
                  padding: "16px 20px",
                  background: "rgba(0,229,255,0.04)",
                  border: "1px solid rgba(0,229,255,0.12)",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "#00E5FF",
                    fontFamily: "monospace",
                    marginBottom: 4,
                  }}
                >
                  Inicia sesión para participar
                </p>
                <p
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    fontFamily: "monospace",
                  }}
                >
                  Tu voto se pondera por tu rango BASIC (0.5×) o VERIFIED (1.0×)
                </p>
              </div>
            ) : hasMultiQ ? (
              /* ── Multi-pregunta ── */
              <div>
                <p
                  style={{
                    fontSize: 9,
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 14,
                  }}
                >
                  {poll.questions!.length} preguntas
                </p>
                <MultiQuestionForm
                  questions={poll.questions!.sort(
                    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
                  )}
                  onSubmit={handleMultiVote}
                  submitting={voting}
                />
                {error && (
                  <p
                    style={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: "#FF073A",
                      marginTop: 10,
                      textAlign: "center",
                    }}
                  >
                    {error}
                  </p>
                )}
              </div>
            ) : (
              /* ── Single-question ── */
              <div>
                {/* Texto de la pregunta */}
                {poll.questions?.[0]?.text ? (
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#f5f5f5",
                      marginBottom: 16,
                      lineHeight: 1.5,
                    }}
                  >
                    {poll.questions[0].text}
                  </p>
                ) : null}
                <SingleQuestionVote
                  poll={poll}
                  onVote={handleSingleVote}
                  voting={voting}
                />
                {error && (
                  <p
                    style={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: "#FF073A",
                      marginTop: 12,
                      textAlign: "center",
                    }}
                  >
                    {error}
                  </p>
                )}
              </div>
            )}

            {/* Footer info */}
            <p
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.15)",
                textAlign: "center",
                marginTop: 20,
              }}
            >
              {poll.total_votes} {poll.total_votes === 1 ? "voto" : "votos"} ·
              Ponderación BASIC 0.5× · VERIFIED 1.0×
            </p>
          </div>
        </div>

        {/* QR compartir — bloque inferior */}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <ShareQR
            url={pageUrl}
            title={poll.title}
            label="Compartir encuesta"
            size={160}
          />
        </div>
      </div>
    </div>
  );
}
