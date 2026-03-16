/**
 * BEACON PROTOCOL — /versus (Arena de Enfrentamientos)
 * =====================================================
 * Client Component: fetches VS activos, permite votar A o B.
 * Maneja resultados en tiempo real con barras de porcentaje.
 * Requiere JWT para votar.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store";
import { useBeaconPulse } from "@/hooks/useBeaconPulse";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SUPABASE_STORAGE =
  "https://xvuqhhpzxiqbepbokncv.supabase.co/storage/v1/object/public/entity-photos/";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Entity {
  id: string;
  first_name: string;
  last_name: string;
  photo_path: string | null;
  category: string;
  reputation_score: number;
}

interface VersusItem {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  affects_reputation: boolean;
  entity_a: Entity;
  entity_b: Entity;
  votes_a: number;
  votes_b: number;
  total_votes: number;
  pct_a: number;
  pct_b: number;
  is_open: boolean;
  user_vote?: string | null;
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

function photoUrl(path: string | null): string | null {
  return path ? `${SUPABASE_STORAGE}${path}` : null;
}

// ─── EntitySide ───────────────────────────────────────────────────────────────

function EntitySide({
  entity,
  side,
  pct,
  onVote,
  voted,
  voting,
  userVote,
  isOpen,
}: {
  entity: Entity;
  side: "A" | "B";
  pct: number;
  onVote: (side: "A" | "B") => void;
  voted: boolean;
  voting: boolean;
  userVote: string | null;
  isOpen: boolean;
}) {
  const COLOR = side === "A" ? "#D4AF37" : "#8A2BE2";
  const isMyVote = userVote === side;
  const url = photoUrl(entity.photo_path);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {/* Avatar */}
      <div style={{ position: "relative" }}>
        {url ? (
          <img
            src={url}
            alt={`${entity.first_name} ${entity.last_name}`}
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              objectFit: "cover",
              border: `2px solid ${isMyVote ? COLOR : "rgba(255,255,255,0.1)"}`,
              transition: "border-color 0.3s",
            }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.04)",
              border: `2px solid ${isMyVote ? COLOR : "rgba(255,255,255,0.1)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
          >
            👤
          </div>
        )}
        {isMyVote && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              background: COLOR,
              borderRadius: "50%",
              width: 22,
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              border: "2px solid #0d0d0d",
            }}
          >
            ✓
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#f5f5f5", lineHeight: 1.2 }}>
          {entity.first_name} {entity.last_name}
        </p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 3, textTransform: "capitalize" }}>
          {entity.category}
        </p>
        <p style={{ fontSize: 11, fontFamily: "monospace", color: COLOR, marginTop: 4 }}>
          {entity.reputation_score.toFixed(2)} ★
        </p>
      </div>

      {/* Vote button */}
      {isOpen && (
        <button
          onClick={() => onVote(side)}
          disabled={voted || voting}
          style={{
            padding: "6px 18px",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "monospace",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            border: `1px solid ${COLOR}`,
            backgroundColor: isMyVote ? COLOR : "transparent",
            color: isMyVote ? "#0d0d0d" : COLOR,
            cursor: voted || voting ? "not-allowed" : "pointer",
            opacity: voted && !isMyVote ? 0.35 : 1,
            transition: "all 0.2s",
          }}
        >
          {voting ? "…" : isMyVote ? `✓ Votado` : `Votar ${side}`}
        </button>
      )}
    </div>
  );
}

// ─── VersusCard ───────────────────────────────────────────────────────────────

function VersusCard({
  vs,
  token,
}: {
  vs: VersusItem;
  token: string | null;
}) {
  const [voting, setVoting] = useState(false);
  const [userVote, setUserVote] = useState<string | null>(vs.user_vote ?? null);
  const [pctA, setPctA] = useState(vs.pct_a);
  const [pctB, setPctB] = useState(vs.pct_b);
  const [totalVotes, setTotalVotes] = useState(vs.total_votes);
  const [error, setError] = useState<string | null>(null);

  // Efecto Kahoot — recibir votos de otros usuarios en tiempo real
  useBeaconPulse(`versus:${vs.id}`, (data) => {
    if (data.type === "VERSUS_PULSE") {
      setPctA(data.pct_a as number);
      setPctB(data.pct_b as number);
      setTotalVotes(data.total_votes as number);
    }
  });

  const handleVote = async (side: "A" | "B") => {
    if (userVote || voting) return;
    if (!token) {
      setError("Debes iniciar sesión para votar");
      return;
    }
    setVoting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/versus/${vs.id}/vote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ voted_for: side }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Error al votar");
      }
      // Optimistic update
      const oldVotesA = Math.round((pctA / 100) * totalVotes);
      const oldVotesB = Math.round((pctB / 100) * totalVotes);
      const newVotesA = side === "A" ? oldVotesA + 1 : oldVotesA;
      const newVotesB = side === "B" ? oldVotesB + 1 : oldVotesB;
      const newTotal = totalVotes + 1;
      setPctA(Math.round((newVotesA / newTotal) * 1000) / 10);
      setPctB(Math.round((newVotesB / newTotal) * 1000) / 10);
      setTotalVotes(newTotal);
      setUserVote(side);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al votar");
    } finally {
      setVoting(false);
    }
  };

  const voted = !!userVote;

  return (
    <div
      style={{
        background: "rgba(17,17,17,0.9)",
        border: "1px solid rgba(212,175,55,0.12)",
        borderRadius: 16,
        padding: 24,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f5f5f5" }}>{vs.title}</h3>
        {vs.description && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {vs.description}
          </p>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginTop: 8,
          }}
        >
          {vs.is_open ? (
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
                  animation: "pulse 2s infinite",
                  display: "inline-block",
                }}
              />
              Votación abierta · cierra {formatDate(vs.ends_at)}
            </span>
          ) : (
            <span
              style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}
            >
              Cerrado · {formatDate(vs.ends_at)}
            </span>
          )}
          {vs.affects_reputation && (
            <span
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                padding: "2px 8px",
                borderRadius: 20,
                background: "rgba(212,175,55,0.08)",
                color: "#D4AF37",
                border: "1px solid rgba(212,175,55,0.18)",
              }}
            >
              ⚖️ Afecta reputación
            </span>
          )}
        </div>
      </div>

      {/* Combatants */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, justifyContent: "center" }}>
        <EntitySide
          entity={vs.entity_a}
          side="A"
          pct={pctA}
          onVote={handleVote}
          voted={voted}
          voting={voting}
          userVote={userVote}
          isOpen={vs.is_open}
        />

        {/* VS divider */}
        <div
          style={{
            paddingTop: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 900,
              background: "linear-gradient(135deg, #D4AF37, #8A2BE2)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              lineHeight: 1,
            }}
          >
            VS
          </span>
        </div>

        <EntitySide
          entity={vs.entity_b}
          side="B"
          pct={pctB}
          onVote={handleVote}
          voted={voted}
          voting={voting}
          userVote={userVote}
          isOpen={vs.is_open}
        />
      </div>

      {/* Vote bars */}
      <div style={{ marginTop: 20 }}>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            overflow: "hidden",
            background: "rgba(255,255,255,0.05)",
            display: "flex",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pctA}%`,
              background: "#D4AF37",
              transition: "width 0.5s ease",
            }}
          />
          <div
            style={{
              height: "100%",
              width: `${pctB}%`,
              background: "#8A2BE2",
              transition: "width 0.5s ease",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            fontSize: 10,
            fontFamily: "monospace",
          }}
        >
          <span style={{ color: "#D4AF37" }}>{pctA}%</span>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>{totalVotes} votos</span>
          <span style={{ color: "#8A2BE2" }}>{pctB}%</span>
        </div>
      </div>

      {error && (
        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            marginTop: 12,
            fontFamily: "monospace",
            color: "#FF073A",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function VersusPage() {
  const { token } = useAuthStore();
  const [items, setItems] = useState<VersusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVersus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/versus`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError("Error al cargar los enfrentamientos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVersus();
  }, [fetchVersus]);

  return (
    <div className="min-h-screen pt-20 pb-12 px-6">
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ paddingTop: 32, paddingBottom: 24, textAlign: "center" }}>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            <span className="text-foreground">Arena </span>
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(135deg, #D4AF37, #e22b43)",
              }}
            >
              Versus
            </span>
          </h1>
          <p className="text-sm text-foreground-muted max-w-sm mx-auto">
            Enfrentamientos directos entre figuras públicas. Tu voto pondera por tu rango verificado.
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
              color: "#D4AF37",
              background: "rgba(212,175,55,0.06)",
              border: "1px solid rgba(212,175,55,0.15)",
            }}
          >
            ⚠️ Inicia sesión para emitir tu voto en los enfrentamientos
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
                animation: "pulse 2s infinite",
              }}
            >
              Cargando arena…
            </p>
          </div>
        )}

        {!loading && error && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ fontSize: 13, color: "#ff5050", marginBottom: 12 }}>{error}</p>
            <button
              onClick={fetchVersus}
              style={{
                fontSize: 11,
                padding: "8px 16px",
                borderRadius: 8,
                background: "rgba(212,175,55,0.1)",
                color: "#D4AF37",
                border: "1px solid rgba(212,175,55,0.2)",
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
                "linear-gradient(135deg, rgba(212,175,55,0.04), rgba(138,43,226,0.04))",
              border: "1px solid rgba(212,175,55,0.1)",
            }}
          >
            <p style={{ fontSize: 40, marginBottom: 12 }}>⚔️</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f5f5f5", marginBottom: 6 }}>
              Sin enfrentamientos activos
            </p>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
              El Protocolo prepara nuevos duelos. Vuelve pronto.
            </p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {items.map((vs) => (
              <VersusCard key={vs.id} vs={vs} token={token} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
