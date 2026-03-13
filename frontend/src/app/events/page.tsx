/**
 * BEACON PROTOCOL — /events (Encuestas Ciudadanas)
 * =================================================
 * Client Component: fetches encuestas activas, permite votar.
 * Soporta poll_type "multiple_choice" (opciones) y "scale" (escala numérica).
 * Muestra resultados en tiempo real con barras de porcentaje.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PollResult {
  option?: string;
  count?: number;
  pct?: number;
  average?: number;
}

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
  total_votes: number;
  results: PollResult[];
  is_open: boolean;
}

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

function PollCard({ poll, token }: { poll: PollItem; token: string | null }) {
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [scaleValue, setScaleValue] = useState<number>(poll.scale_min);
  const [results, setResults] = useState<PollResult[]>(poll.results);
  const [totalVotes, setTotalVotes] = useState(poll.total_votes);
  const [error, setError] = useState<string | null>(null);

  const handleVote = async (optionValue: string) => {
    if (voted || voting) return;
    if (!token) {
      setError("Debes iniciar sesión para votar");
      return;
    }
    setVoting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/polls/${poll.id}/vote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ option_value: optionValue }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Error al votar");
      }
      // Optimistic update for MC
      if (poll.poll_type === "multiple_choice") {
        const newTotal = totalVotes + 1;
        const updated = (results as { option: string; count: number; pct: number }[]).map((r) => {
          if (r.option === optionValue) {
            const newCount = (r.count || 0) + 1;
            return { ...r, count: newCount, pct: Math.round((newCount / newTotal) * 1000) / 10 };
          }
          return { ...r, pct: Math.round(((r.count || 0) / newTotal) * 1000) / 10 };
        });
        setResults(updated);
        setTotalVotes(newTotal);
      }
      setSelectedOption(optionValue);
      setVoted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al votar");
    } finally {
      setVoting(false);
    }
  };

  return (
    <div
      style={{
        background: "rgba(17,17,17,0.9)",
        border: "1px solid rgba(0,229,255,0.1)",
        borderRadius: 16,
        padding: 24,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f5f5", marginBottom: 4 }}>
          {poll.title}
        </h3>
        {poll.description && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>
            {poll.description}
          </p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              Abierta · cierra {formatDate(poll.ends_at)}
            </span>
          ) : (
            <span
              style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}
            >
              Cerrada · {formatDate(poll.ends_at)}
            </span>
          )}
          <span
            style={{
              fontSize: 9,
              fontFamily: "monospace",
              color: "#00E5FF",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              padding: "2px 7px",
              borderRadius: 20,
              background: "rgba(0,229,255,0.07)",
              border: "1px solid rgba(0,229,255,0.15)",
            }}
          >
            {poll.poll_type === "multiple_choice" ? "Opción múltiple" : `Escala ${poll.scale_min}–${poll.scale_max}`}
          </span>
        </div>
      </div>

      {/* Multiple Choice */}
      {poll.poll_type === "multiple_choice" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(poll.options || []).map((opt) => {
            const result = (results as { option: string; count: number; pct: number }[]).find(
              (r) => r.option === opt
            );
            const pct = result?.pct ?? 0;
            const isSelected = selectedOption === opt;

            return (
              <button
                key={opt}
                onClick={() => !voted && poll.is_open && handleVote(opt)}
                disabled={voted || voting || !poll.is_open}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  textAlign: "left",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: `1px solid ${isSelected ? "#00E5FF" : "rgba(255,255,255,0.07)"}`,
                  background: "rgba(255,255,255,0.02)",
                  cursor: voted || !poll.is_open ? "default" : "pointer",
                  transition: "border-color 0.2s",
                }}
              >
                {/* Progress fill */}
                {voted && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: "100%",
                      width: `${pct}%`,
                      background: isSelected
                        ? "rgba(0,229,255,0.12)"
                        : "rgba(255,255,255,0.04)",
                      transition: "width 0.5s ease",
                      borderRadius: 10,
                    }}
                  />
                )}
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
                      color: isSelected ? "#00E5FF" : "#f5f5f5",
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {opt}
                  </span>
                  {voted && (
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: isSelected ? "#00E5FF" : "rgba(255,255,255,0.3)",
                        fontWeight: isSelected ? 700 : 400,
                      }}
                    >
                      {pct}%
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Scale */}
      {poll.poll_type === "scale" && (
        <div style={{ marginTop: 8 }}>
          {!voted ? (
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                {Array.from(
                  { length: poll.scale_max - poll.scale_min + 1 },
                  (_, i) => poll.scale_min + i
                ).map((val) => (
                  <button
                    key={val}
                    onClick={() => setScaleValue(val)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      border: `1px solid ${
                        scaleValue === val ? "#00E5FF" : "rgba(255,255,255,0.08)"
                      }`,
                      background:
                        scaleValue === val ? "rgba(0,229,255,0.15)" : "rgba(255,255,255,0.02)",
                      color: scaleValue === val ? "#00E5FF" : "rgba(255,255,255,0.5)",
                      fontSize: 13,
                      fontFamily: "monospace",
                      fontWeight: scaleValue === val ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {val}
                  </button>
                ))}
              </div>
              {poll.is_open && (
                <button
                  onClick={() => handleVote(String(scaleValue))}
                  disabled={voting}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    border: "1px solid #00E5FF",
                    backgroundColor: "transparent",
                    color: "#00E5FF",
                    cursor: voting ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {voting ? "…" : `Votar ${scaleValue}`}
                </button>
              )}
            </div>
          ) : (
            <div>
              {results[0] && "average" in results[0] && (
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <p
                    style={{
                      fontSize: 36,
                      fontFamily: "monospace",
                      fontWeight: 900,
                      color: "#00E5FF",
                    }}
                  >
                    {results[0].average}
                  </p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
                    promedio · {results[0].count} votos
                  </p>
                  <p style={{ fontSize: 11, fontFamily: "monospace", color: "#39FF14", marginTop: 8 }}>
                    Tu voto: {selectedOption} ✓
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Total votes (MC) */}
      {poll.poll_type === "multiple_choice" && (
        <p
          style={{
            fontSize: 10,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.25)",
            marginTop: 12,
            textAlign: "right",
          }}
        >
          {totalVotes} {totalVotes === 1 ? "voto" : "votos"}
        </p>
      )}

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
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EventsPage() {
  const { token } = useAuthStore();
  const [items, setItems] = useState<PollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPolls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/polls`);
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
    fetchPolls();
  }, [fetchPolls]);

  return (
    <div className="min-h-screen pt-20 pb-12 px-6">
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ paddingTop: 32, paddingBottom: 24, textAlign: "center" }}>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            <span className="text-foreground">Encuestas </span>
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(135deg, #00E5FF, #39FF14)",
              }}
            >
              Ciudadanas
            </span>
          </h1>
          <p className="text-sm text-foreground-muted max-w-sm mx-auto">
            Opina sobre los temas que definen el futuro del país. Tu voz, ponderada por tu nivel de integridad.
          </p>
        </div>

        {/* Auth hint */}
        {!token && (
          <div
            style={{
              marginBottom: 20,
              borderRadius: 10,
              padding: "10px 16px",
              textAlign: "center",
              fontSize: 11,
              fontFamily: "monospace",
              color: "#00E5FF",
              background: "rgba(0,229,255,0.05)",
              border: "1px solid rgba(0,229,255,0.15)",
            }}
          >
            ⚠️ Inicia sesión para participar en las encuestas
          </div>
        )}

        {/* States */}
        {loading && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.3)",
              }}
            >
              Cargando encuestas…
            </p>
          </div>
        )}

        {!loading && error && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ fontSize: 13, color: "#ff5050", marginBottom: 12 }}>{error}</p>
            <button
              onClick={fetchPolls}
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

        {!loading && !error && items.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "48px 24px",
              borderRadius: 16,
              background:
                "linear-gradient(135deg, rgba(0,229,255,0.04), rgba(57,255,20,0.04))",
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

        {!loading && !error && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {items.map((poll) => (
              <PollCard key={poll.id} poll={poll} token={token} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
