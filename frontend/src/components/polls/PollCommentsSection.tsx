/**
 * PollCommentsSection
 * ────────────────────
 * Sección de reacciones ciudadanas en la página de encuesta.
 * Fase inicial: comentarios con reacciones (👍 👎 🤔).
 * Requiere autenticación para comentar.
 *
 * Arquitectura preparada para conectar a backend en iteración siguiente.
 * Por ahora: UI completa con estado local (demo-ready).
 */

"use client";

import { useState } from "react";
import usePermissions from "@/hooks/usePermissions";

interface Comment {
  id: string;
  author: string;
  rank: "VERIFIED" | "BASIC";
  text: string;
  reaction: "👍" | "👎" | "🤔" | null;
  created_at: string;
}

const REACTIONS = [
  { emoji: "👍", label: "De acuerdo" },
  { emoji: "👎", label: "En desacuerdo" },
  { emoji: "🤔", label: "Con dudas" },
];

const RANK_COLORS: Record<string, string> = {
  VERIFIED: "#4DFF83",
  BASIC:    "#FF8C00",
};

interface PollCommentsSectionProps {
  pollId: string;
  pollSlug: string;
  isOpen: boolean;
}

export default function PollCommentsSection({ pollId, isOpen }: PollCommentsSectionProps) {
  const { isAuthenticated, isVerified, user } = usePermissions();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [reaction, setReaction] = useState<"👍" | "👎" | "🤔" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Solo usuarios autenticados pueden comentar
  const canComment = isAuthenticated;

  function handleSubmit() {
    if (!text.trim() || text.trim().length < 10) {
      setError("El comentario debe tener al menos 10 caracteres.");
      return;
    }
    setSubmitting(true);
    setError(null);

    // TODO: conectar a POST /api/v1/polls/{pollId}/comments en iteración backend
    setTimeout(() => {
      const newComment: Comment = {
        id:         crypto.randomUUID(),
        author:     user?.full_name || user?.email || "Ciudadano",
        rank:       isVerified ? "VERIFIED" : "BASIC",
        text:       text.trim(),
        reaction,
        created_at: new Date().toISOString(),
      };
      setComments((prev) => [newComment, ...prev]);
      setText("");
      setReaction(null);
      setSubmitting(false);
      setSubmitted(true);
    }, 600);
  }

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
          <span style={{ fontSize: 13 }}>💬</span>
          <span style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: "0.15em", color: "rgba(138,43,226,0.7)", textTransform: "uppercase" }}>
            Reacciones ciudadanas
          </span>
        </div>
        {comments.length > 0 && (
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)" }}>
            {comments.length} comentario{comments.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Formulario */}
      {canComment && !submitted ? (
        <div style={{ marginBottom: 20 }}>
          {/* Reacciones rápidas */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {REACTIONS.map((r) => (
              <button
                key={r.emoji}
                onClick={() => setReaction(reaction === r.emoji ? null : r.emoji as typeof reaction)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 20, cursor: "pointer",
                  fontSize: 12, fontFamily: "monospace",
                  background: reaction === r.emoji ? "rgba(138,43,226,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${reaction === r.emoji ? "rgba(138,43,226,0.5)" : "rgba(255,255,255,0.08)"}`,
                  color: reaction === r.emoji ? "#fff" : "rgba(255,255,255,0.4)",
                  transition: "all 0.15s",
                }}
              >
                <span>{r.emoji}</span>
                <span style={{ fontSize: 9 }}>{r.label}</span>
              </button>
            ))}
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
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)" }}>
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
                {submitting ? "Enviando…" : "Publicar →"}
              </button>
            </div>
          </div>
        </div>
      ) : !canComment ? (
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
      ) : (
        <div style={{ marginBottom: 18, padding: "10px 14px", borderRadius: 10, background: "rgba(57,255,20,0.05)", border: "1px solid rgba(57,255,20,0.15)" }}>
          <p style={{ fontSize: 11, fontFamily: "monospace", color: "#39FF14" }}>
            ✓ Comentario publicado
          </p>
        </div>
      )}

      {/* Lista de comentarios */}
      {comments.length === 0 ? (
        <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.15)", textAlign: "center", paddingTop: 8 }}>
          Sé el primero en reaccionar
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {comments.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "12px 16px", borderRadius: 12,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                {c.reaction && <span style={{ fontSize: 14 }}>{c.reaction}</span>}
                <span style={{ fontSize: 11, fontWeight: 600, color: "#f5f5f5" }}>{c.author}</span>
                <span
                  style={{
                    fontSize: 8, fontFamily: "monospace", padding: "1px 7px",
                    borderRadius: 20, fontWeight: 700,
                    background: `${RANK_COLORS[c.rank]}15`,
                    border: `1px solid ${RANK_COLORS[c.rank]}30`,
                    color: RANK_COLORS[c.rank],
                  }}
                >
                  {c.rank}
                </span>
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
