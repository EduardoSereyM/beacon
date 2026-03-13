/**
 * BEACON PROTOCOL — /events (Eventos con Participantes)
 * ======================================================
 * Client Component: fetches eventos activos con sus participantes.
 * Permite puntuar a cada entidad participante (score 1–5 estrellas).
 * 1 voto por usuario por entidad por evento. No afecta reputation_score.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/store";
import { useBeaconPulse } from "@/hooks/useBeaconPulse";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SUPABASE_STORAGE =
  "https://xvuqhhpzxiqbepbokncv.supabase.co/storage/v1/object/public/entity-photos/";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  first_name: string;
  last_name: string;
  photo_path: string | null;
  category: string;
  reputation_score: number;
  event_score_avg: number | null;
  event_vote_count: number;
  user_score: number | null;
}

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  participants: Participant[];
  participant_count: number;
  is_open: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  politico:   "Político",
  periodista: "Periodista",
  empresario: "Empresario",
  empresa:    "Empresa",
  evento:     "Evento",
  artista:    "Artista",
};

function photoUrl(path: string | null): string | null {
  return path ? `${SUPABASE_STORAGE}${path}` : null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function scoreColor(score: number | null): string {
  if (!score) return "rgba(255,255,255,0.25)";
  if (score >= 4.5) return "#39FF14";
  if (score >= 3.5) return "#D4AF37";
  if (score >= 2.5) return "#FF8C00";
  return "#FF073A";
}

// ─── StarRating ───────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  disabled,
  size = 18,
}: {
  value: number;
  onChange?: (v: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = (hover || value) >= star;
        return (
          <span
            key={star}
            onMouseEnter={() => !disabled && setHover(star)}
            onMouseLeave={() => !disabled && setHover(0)}
            onClick={() => !disabled && onChange?.(star)}
            style={{
              fontSize: size,
              color: filled ? "#D4AF37" : "rgba(255,255,255,0.15)",
              cursor: disabled ? "default" : "pointer",
              transition: "color 0.1s",
              lineHeight: 1,
            }}
          >
            ★
          </span>
        );
      })}
    </div>
  );
}

// ─── ParticipantCard ──────────────────────────────────────────────────────────

function ParticipantCard({
  participant,
  eventId,
  isOpen,
  token,
  onVoted,
  liveScore,
}: {
  participant: Participant;
  eventId: string;
  isOpen: boolean;
  token: string | null;
  onVoted: (entityId: string, score: number) => void;
  liveScore?: { avg: number | null; count: number };
}) {
  const [hoveredScore, setHoveredScore] = useState(0);
  const [userScore, setUserScore] = useState<number>(participant.user_score ?? 0);
  const [avgScore, setAvgScore] = useState<number | null>(participant.event_score_avg);
  const [voteCount, setVoteCount] = useState(participant.event_vote_count);

  // Aplicar actualización en tiempo real (otros usuarios)
  useEffect(() => {
    if (liveScore) {
      setAvgScore(liveScore.avg);
      setVoteCount(liveScore.count);
    }
  }, [liveScore]);
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState(!!participant.user_score);
  const [error, setError] = useState<string | null>(null);

  const url = photoUrl(participant.photo_path);

  const handleVote = async (score: number) => {
    if (voted || voting || !isOpen) return;
    if (!token) { setError("Inicia sesión para votar"); return; }
    setVoting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/events/${eventId}/vote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: participant.id, score }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Error al votar");
      }
      // Optimistic update
      const newCount = voteCount + 1;
      const prevSum = (avgScore ?? 0) * voteCount;
      setAvgScore(Math.round((prevSum + score) / newCount * 100) / 100);
      setVoteCount(newCount);
      setUserScore(score);
      setVoted(true);
      onVoted(participant.id, score);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al votar");
    } finally {
      setVoting(false);
    }
  };

  const displayScore = hoveredScore || userScore;

  return (
    <div
      style={{
        background: voted
          ? "rgba(212,175,55,0.04)"
          : "rgba(255,255,255,0.02)",
        border: `1px solid ${voted ? "rgba(212,175,55,0.2)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        transition: "border-color 0.2s",
      }}
    >
      {/* Avatar */}
      <div style={{ flexShrink: 0 }}>
        {url ? (
          <img
            src={url}
            alt={`${participant.first_name} ${participant.last_name}`}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              objectFit: "cover",
              border: `2px solid ${voted ? "#D4AF37" : "rgba(255,255,255,0.08)"}`,
            }}
          />
        ) : (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.04)",
              border: "2px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            👤
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5", margin: 0 }}>
          {participant.first_name} {participant.last_name}
        </p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, textTransform: "capitalize" }}>
          {CATEGORY_LABELS[participant.category] || participant.category}
        </p>

        {/* Vote stars */}
        {isOpen && !voted && (
          <div style={{ marginTop: 6 }}>
            <div
              style={{ display: "inline-flex", gap: 2 }}
              onMouseLeave={() => setHoveredScore(0)}
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  onMouseEnter={() => !voting && setHoveredScore(star)}
                  onClick={() => !voting && handleVote(star)}
                  style={{
                    fontSize: 20,
                    color: (hoveredScore || userScore) >= star ? "#D4AF37" : "rgba(255,255,255,0.15)",
                    cursor: voting ? "not-allowed" : "pointer",
                    transition: "color 0.1s",
                    lineHeight: 1,
                  }}
                >
                  ★
                </span>
              ))}
            </div>
            {hoveredScore > 0 && (
              <span style={{ fontSize: 10, color: "#D4AF37", fontFamily: "monospace", marginLeft: 6 }}>
                {["", "Regular", "Aceptable", "Bueno", "Muy bueno", "Excelente"][hoveredScore]}
              </span>
            )}
            {!token && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                Inicia sesión para votar
              </p>
            )}
          </div>
        )}

        {/* Voted state */}
        {voted && (
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <StarRating value={userScore} disabled size={14} />
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "#D4AF37" }}>
              Tu voto ✓
            </span>
          </div>
        )}

        {error && (
          <p style={{ fontSize: 10, color: "#FF073A", marginTop: 3, fontFamily: "monospace" }}>
            {error}
          </p>
        )}
      </div>

      {/* Score display */}
      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 52 }}>
        <p
          style={{
            fontSize: 20,
            fontFamily: "monospace",
            fontWeight: 900,
            color: scoreColor(avgScore),
            lineHeight: 1,
            margin: 0,
          }}
        >
          {avgScore !== null ? avgScore.toFixed(1) : "—"}
        </p>
        <p style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>
          {voteCount} {voteCount === 1 ? "voto" : "votos"}
        </p>
      </div>
    </div>
  );
}

// ─── EventCard ────────────────────────────────────────────────────────────────

interface LiveScore { avg: number | null; count: number }

function EventCard({ event, token }: { event: EventItem; token: string | null }) {
  const [votedMap, setVotedMap] = useState<Record<string, number>>({});
  // Efecto Kahoot — scores actualizados en tiempo real para todos los participantes
  const [liveScores, setLiveScores] = useState<Record<string, LiveScore>>({});

  useBeaconPulse(`event:${event.id}`, (data) => {
    if (data.type === "EVENT_PULSE") {
      const eid = data.entity_id as string;
      setLiveScores((prev) => ({
        ...prev,
        [eid]: { avg: data.new_avg as number | null, count: data.vote_count as number },
      }));
    }
  });

  const handleVoted = (entityId: string, score: number) => {
    setVotedMap((prev) => ({ ...prev, [entityId]: score }));
  };

  return (
    <div
      style={{
        background: "rgba(17,17,17,0.9)",
        border: "1px solid rgba(0,229,255,0.1)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "linear-gradient(135deg, rgba(0,229,255,0.04), rgba(57,255,20,0.03))",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f5f5f5", margin: 0 }}>
              {event.title}
            </h3>
            {event.description && (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4, marginBottom: 0 }}>
                {event.description}
              </p>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {event.is_open ? (
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
                EN VIVO
              </span>
            ) : (
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
                CERRADO
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          {event.location && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              📍 {event.location}
            </span>
          )}
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
            {formatDate(event.starts_at)} → {formatDate(event.ends_at)}
          </span>
          <span style={{ fontSize: 11, color: "#00E5FF", fontFamily: "monospace" }}>
            {event.participant_count} participante{event.participant_count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Participants */}
      {event.participants.length === 0 ? (
        <div style={{ padding: "24px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
            Sin participantes aún
          </p>
        </div>
      ) : (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {event.participants.map((p) => (
            <ParticipantCard
              key={p.id}
              participant={p}
              eventId={event.id}
              isOpen={event.is_open}
              token={token}
              onVoted={handleVoted}
              liveScore={liveScores[p.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function EventsPage() {
  const { token } = useAuthStore();
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/events`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError("Error al cargar los eventos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return (
    <div className="min-h-screen pt-20 pb-12 px-6">
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ paddingTop: 32, paddingBottom: 24, textAlign: "center" }}>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            <span className="text-foreground">Eventos </span>
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #00E5FF, #39FF14)" }}
            >
              en Vivo
            </span>
          </h1>
          <p className="text-sm text-foreground-muted max-w-sm mx-auto">
            Evalúa a los participantes de cada evento. Tu puntuación queda registrada sin afectar el ranking histórico.
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
            ⚠️ Inicia sesión para puntuar a los participantes
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
              Cargando eventos…
            </p>
          </div>
        )}

        {!loading && error && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ fontSize: 13, color: "#ff5050", marginBottom: 12 }}>{error}</p>
            <button
              onClick={fetchEvents}
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
              background: "linear-gradient(135deg, rgba(0,229,255,0.04), rgba(57,255,20,0.04))",
              border: "1px solid rgba(0,229,255,0.1)",
            }}
          >
            <p style={{ fontSize: 40, marginBottom: 12 }}>📡</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f5f5f5", marginBottom: 6 }}>
              Sin eventos activos
            </p>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
              El Protocolo monitorea los próximos eventos. Vuelve pronto.
            </p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {items.map((ev) => (
              <EventCard key={ev.id} event={ev} token={token} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
