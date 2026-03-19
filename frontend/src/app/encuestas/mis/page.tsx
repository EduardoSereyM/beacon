/**
 * BEACON PROTOCOL — /encuestas/mis (Mis Encuestas)
 * ==================================================
 * Encuestas en las que el usuario autenticado ha participado,
 * incluidas las privadas a las que tuvo acceso.
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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
  header_image: string | null;
  poll_type: "multiple_choice" | "scale";
  options: string[] | null;
  scale_min: number;
  scale_max: number;
  starts_at: string;
  ends_at: string;
  total_votes: number;
  is_open: boolean;
  is_active: boolean;
  category: string;
  results: PollResult[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    politica: "Política",
    economia: "Economía",
    salud: "Salud",
    educacion: "Educación",
    espectaculos: "Espectáculos",
    deporte: "Deporte",
    cultura: "Cultura",
    general: "General",
  };
  return map[cat] ?? cat;
}

// ─── MiPollCard ───────────────────────────────────────────────────────────────

function MiPollCard({ poll }: { poll: PollItem }) {
  const topResult =
    poll.poll_type === "multiple_choice"
      ? (poll.results as { option: string; count: number; pct: number }[]).sort(
          (a, b) => (b.pct ?? 0) - (a.pct ?? 0)
        )[0]
      : null;
  const scaleResult =
    poll.poll_type === "scale"
      ? (poll.results as { average: number; count: number }[])[0]
      : null;

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
          display: "flex",
          flexDirection: "column",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = poll.is_open
            ? "rgba(57,255,20,0.35)"
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
        {/* Imagen */}
        {poll.header_image && (
          <div style={{ position: "relative", width: "100%", height: 120, flexShrink: 0 }}>
            <Image
              src={poll.header_image}
              alt={poll.title}
              fill
              style={{ objectFit: "cover" }}
              unoptimized
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.85))",
              }}
            />
          </div>
        )}

        {/* Content */}
        <div style={{ padding: "16px 18px", flex: 1 }}>
          {/* Badges */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <span
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "2px 7px",
                borderRadius: 20,
                background: poll.is_open ? "rgba(57,255,20,0.08)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${poll.is_open ? "rgba(57,255,20,0.2)" : "rgba(255,255,255,0.08)"}`,
                color: poll.is_open ? "#39FF14" : "rgba(255,255,255,0.3)",
              }}
            >
              {poll.is_open ? "Abierta" : "Cerrada"}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "2px 7px",
                borderRadius: 20,
                background: "rgba(0,229,255,0.06)",
                border: "1px solid rgba(0,229,255,0.13)",
                color: "#00E5FF",
              }}
            >
              {categoryLabel(poll.category)}
            </span>
          </div>

          {/* Title */}
          <h3
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#f5f5f5",
              marginBottom: 6,
              lineHeight: 1.35,
            }}
          >
            {poll.title}
          </h3>

          {/* Result preview */}
          {topResult && (
            <div
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.4)",
                marginBottom: 4,
              }}
            >
              Liderando:{" "}
              <span style={{ color: "#00E5FF", fontWeight: 600 }}>
                {topResult.option} · {topResult.pct}%
              </span>
            </div>
          )}
          {scaleResult && (
            <div
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.4)",
                marginBottom: 4,
              }}
            >
              Promedio:{" "}
              <span style={{ color: "#00E5FF", fontWeight: 600 }}>
                {scaleResult.average} / {poll.scale_max}
              </span>
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <span
              style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)" }}
            >
              {poll.total_votes} {poll.total_votes === 1 ? "voto" : "votos"} · cierra {formatDate(poll.ends_at)}
            </span>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "#39FF14", fontWeight: 600 }}>
              Ver →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function MisEncuestasPage() {
  const { token } = useAuthStore();
  const [items, setItems] = useState<PollItem[]>([]);
  const [loading, setLoading] = useState(!!token);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/v1/polls/my`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setItems(data.items || []))
      .catch(() => setError("Error al cargar tus encuestas"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen pt-20 pb-12 px-6">
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ paddingTop: 32, paddingBottom: 24 }}>
          <Link
            href="/encuestas"
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: "rgba(255,255,255,0.35)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 16,
            }}
          >
            ← Encuestas Ciudadanas
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            <span className="text-foreground">Mis </span>
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #00E5FF, #39FF14)" }}
            >
              Encuestas
            </span>
          </h1>
          <p className="text-sm text-foreground-muted">
            Encuestas en las que has participado, incluidas las privadas.
          </p>
        </div>

        {/* Sin login */}
        {!token && !loading && (
          <div
            style={{
              textAlign: "center",
              padding: "48px 24px",
              borderRadius: 16,
              background: "rgba(0,229,255,0.04)",
              border: "1px solid rgba(0,229,255,0.1)",
            }}
          >
            <p style={{ fontSize: 32, marginBottom: 12 }}>🔒</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f5f5f5", marginBottom: 6 }}>
              Inicia sesión para ver tus encuestas
            </p>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
              Necesitas una cuenta BEACON para acceder a este historial.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
              Cargando tus encuestas…
            </p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ fontSize: 13, color: "#ff5050" }}>{error}</p>
          </div>
        )}

        {/* Vacío */}
        {!loading && !error && token && items.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "48px 24px",
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(0,229,255,0.04), rgba(57,255,20,0.04))",
              border: "1px solid rgba(0,229,255,0.1)",
            }}
          >
            <p style={{ fontSize: 40, marginBottom: 12 }}>📋</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#f5f5f5", marginBottom: 6 }}>
              Aún no has participado en ninguna encuesta
            </p>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>
              Explora las encuestas activas y deja tu opinión.
            </p>
            <Link
              href="/encuestas"
              style={{
                display: "inline-flex",
                padding: "8px 20px",
                borderRadius: 10,
                fontSize: 11,
                fontFamily: "monospace",
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
                color: "#00E5FF",
                border: "1px solid rgba(0,229,255,0.3)",
                background: "rgba(0,229,255,0.07)",
                textDecoration: "none",
              }}
            >
              Ver Encuestas →
            </Link>
          </div>
        )}

        {/* Lista */}
        {!loading && !error && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.25)",
                marginBottom: 4,
              }}
            >
              {items.length} {items.length === 1 ? "encuesta" : "encuestas"} · ordenadas por actividad
            </p>
            {items.map((poll) => (
              <MiPollCard key={poll.id} poll={poll} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
