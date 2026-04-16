/**
 * PollCommentsSection
 * ────────────────────
 * Sección de reacciones ciudadanas en la página de encuesta.
 * Conectada a POST/GET /api/v1/polls/{pollId}/comments
 */

"use client";

import React, { useState, useEffect } from "react";
import { MessageCircle, ThumbsUp, ThumbsDown, HelpCircle, CheckCircle2, Send } from "lucide-react";
import usePermissions from "@/hooks/usePermissions";
import { useAuthStore } from "@/store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Comment {
  id: string;
  poll_id: string;
  user_id: string;
  reaction: "👍" | "👎" | "🤔" | null;
  text: string;
  rank: string;
  created_at: string;
}

const REACTIONS: { emoji: "👍" | "👎" | "🤔"; label: string; Icon: React.ElementType; color: string; activeBg: string; activeBorder: string }[] = [
  { emoji: "👍", label: "De acuerdo",    Icon: ThumbsUp,   color: "#4DFF83", activeBg: "rgba(77,255,131,0.12)",  activeBorder: "rgba(77,255,131,0.45)"  },
  { emoji: "👎", label: "En desacuerdo", Icon: ThumbsDown,  color: "#FF6B6B", activeBg: "rgba(255,107,107,0.12)", activeBorder: "rgba(255,107,107,0.45)" },
  { emoji: "🤔", label: "Con dudas",     Icon: HelpCircle,  color: "#FFD166", activeBg: "rgba(255,209,102,0.12)", activeBorder: "rgba(255,209,102,0.45)" },
];

const REACTION_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  "👍": { Icon: ThumbsUp,  color: "#4DFF83" },
  "👎": { Icon: ThumbsDown, color: "#FF6B6B" },
  "🤔": { Icon: HelpCircle, color: "#FFD166" },
};

const RANK_COLORS: Record<string, string> = {
  VERIFIED: "#4DFF83",
  BASIC:    "#FF8C00",
};

function rankColor(rank: string): string {
  return RANK_COLORS[rank] || "#888";
}

interface PollCommentsSectionProps {
  pollId: string;
  pollSlug: string;
  isOpen: boolean;
}

export default function PollCommentsSection({ pollId, isOpen }: PollCommentsSectionProps) {
  const { isAuthenticated } = usePermissions();
  const { token, user } = useAuthStore();

  const [comments, setComments]     = useState<Comment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [text, setText]             = useState("");
  const [reaction, setReaction]     = useState<"👍" | "👎" | "🤔" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [submitted, setSubmitted]   = useState(false);

  // ─── Cargar comentarios al montar ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/api/v1/polls/${pollId}/comments?limit=50&offset=0`
        );
        if (!res.ok) throw new Error("fetch failed");
        const data: Comment[] = await res.json();
        if (!cancelled) setComments(data);
      } catch {
        // silencioso — la sección sigue funcional para nuevos comentarios
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [pollId]);

  // ─── Detectar si el usuario ya comentó ────────────────────────────────────
  const alreadyCommented = user
    ? comments.some((c) => c.user_id === user.id)
    : false;

  // ─── Publicar comentario ───────────────────────────────────────────────────
  async function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed.length < 10) {
      setError("El comentario debe tener al menos 10 caracteres.");
      return;
    }
    if (!token) {
      setError("Debes iniciar sesión para comentar.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/polls/${pollId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ text: trimmed, reaction }),
      });
      if (res.status === 409) {
        setError("Ya publicaste un comentario en esta encuesta.");
        setSubmitted(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || "Error al publicar. Intenta de nuevo.");
        return;
      }
      const created: Comment = await res.json();
      setComments((prev) => [created, ...prev]);
      setText("");
      setReaction(null);
      setSubmitted(true);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const canComment    = isAuthenticated && !alreadyCommented && !submitted;
  const showSubmitted = submitted || alreadyCommented;

  return (
    <div
      style={{
        marginTop: 16,
        borderRadius: 16,
        border: "1px solid rgba(138,43,226,0.12)",
        background: "rgba(138,43,226,0.03)",
        padding: "20px 24px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MessageCircle size={14} color="#B06EE8" fill="rgba(176,110,232,0.15)" />
          <span style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: "0.15em", color: "#B06EE8", textTransform: "uppercase" }}>
            Reacciones ciudadanas
          </span>
        </div>
        {comments.length > 0 && (
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)" }}>
            {comments.length} comentario{comments.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Formulario / estado */}
      {canComment ? (
        <div style={{ marginBottom: 20 }}>
          {/* Reacciones rápidas */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {REACTIONS.map((r) => {
              const active = reaction === r.emoji;
              return (
                <button
                  key={r.emoji}
                  onClick={() => setReaction(active ? null : r.emoji)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 14px", borderRadius: 20, cursor: "pointer",
                    fontFamily: "monospace",
                    background: active ? r.activeBg : "rgba(255,255,255,0.03)",
                    border: `1px solid ${active ? r.activeBorder : "rgba(255,255,255,0.07)"}`,
                    opacity: active ? 1 : 0.55,
                    transition: "all 0.15s",
                  }}
                >
                  <r.Icon size={13} color={r.color} strokeWidth={active ? 2.2 : 1.8} />
                  <span style={{ fontSize: 9, color: r.color, letterSpacing: "0.05em" }}>{r.label}</span>
                </button>
              );
            })}
          </div>

          {/* Textarea */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Comparte tu opinión sobre esta encuesta…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: "10px 14px",
              fontSize: 13, color: "#f5f5f5",
              fontFamily: "inherit", resize: "vertical",
              outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(138,43,226,0.4)"; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255, 255, 255, 0.53)" }}>
              {text.length}/500
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {error && (
                <span style={{ fontSize: 10, color: "#FF6B6B", fontFamily: "monospace" }}>{error}</span>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting || text.trim().length < 10}
                style={{
                  padding: "6px 18px", borderRadius: 8, cursor: "pointer",
                  fontSize: 11, fontFamily: "monospace", fontWeight: 700,
                  background: "rgba(138,43,226,0.15)",
                  border: "1px solid rgba(138,43,226,0.35)",
                  color: submitting || text.trim().length < 10 ? "rgba(255,255,255,0.2)" : "#fff",
                  transition: "all 0.15s",
                  opacity: submitting || text.trim().length < 10 ? 0.5 : 1,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {submitting ? "Enviando…" : (<>Publicar <Send size={10} /></>)}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : !isAuthenticated ? (
        <div
          style={{
            marginBottom: 18, padding: "12px 16px", borderRadius: 10,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
            Inicia sesión para dejar tu reacción →{" "}
            <button
              onClick={() => window.dispatchEvent(new Event("beacon:open-auth-modal"))}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#D4AF37", fontSize: 11, fontFamily: "monospace", textDecoration: "underline" }}
            >
              Acceder
            </button>
          </p>
        </div>
      ) : showSubmitted ? (
        <div style={{ marginBottom: 18, padding: "10px 14px", borderRadius: 10, background: "rgba(57,255,20,0.05)", border: "1px solid rgba(57,255,20,0.15)" }}>
          <p style={{ fontSize: 11, fontFamily: "monospace", color: "#39FF14", display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
            <CheckCircle2 size={12} /> Ya publicaste tu reacción en esta encuesta
          </p>
        </div>
      ) : null}

      {/* Lista de comentarios */}
      {loading ? (
        <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.15)", textAlign: "center", paddingTop: 8 }}>
          Cargando reacciones…
        </p>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255, 255, 255, 0.49)", textAlign: "center", paddingTop: 8 }}>
          Sé el primero en reaccionar
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {comments.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "12px 16px", borderRadius: 12,
                background: user && c.user_id === user.id
                  ? "rgba(138,43,226,0.06)"
                  : "rgba(255,255,255,0.02)",
                border: user && c.user_id === user.id
                  ? "1px solid rgba(138,43,226,0.2)"
                  : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                {c.reaction && (() => {
                  const r = REACTION_ICON[c.reaction!];
                  return r ? <r.Icon size={14} color={r.color} /> : null;
                })()}
                <span
                  style={{
                    fontSize: 8, fontFamily: "monospace", padding: "1px 7px",
                    borderRadius: 20, fontWeight: 700,
                    background: `${rankColor(c.rank)}15`,
                    border: `1px solid ${rankColor(c.rank)}30`,
                    color: rankColor(c.rank),
                  }}
                >
                  {c.rank}
                </span>
                {user && c.user_id === user.id && (
                  <span style={{ fontSize: 8, fontFamily: "monospace", color: "rgba(138,43,226,0.6)" }}>
                    tú
                  </span>
                )}
                <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", marginLeft: "auto" }}>
                  {new Date(c.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, margin: 0 }}>
                {c.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
