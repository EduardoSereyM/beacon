/**
 * BEACON PROTOCOL — /encuestas (Lista de Encuestas Ciudadanas)
 * =============================================================
 * Server Component con lista de encuestas activas.
 * Cada card muestra imagen + título + estado y linkea a /encuestas/[id].
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

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
  const [items, setItems] = useState<PollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("");

  const fetchPolls = useCallback(async (cat: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = cat
        ? `${API_URL}/api/v1/polls?category=${encodeURIComponent(cat)}`
        : `${API_URL}/api/v1/polls`;
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
    fetchPolls(activeCategory);
  }, [fetchPolls, activeCategory]);

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
              onClick={() => fetchPolls(activeCategory)}
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
    </div>
  );
}
