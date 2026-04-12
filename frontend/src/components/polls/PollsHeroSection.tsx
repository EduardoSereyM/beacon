/**
 * PollsHeroSection
 * ────────────────
 * Featured poll section with large votable display.
 * Shows the first active poll with real-time vote count.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface HeroPoll {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  header_image: string | null;
  poll_type: string;
  options: string[] | null;
  scale_min: number;
  scale_max: number;
  total_votes: number;
  ends_at: string;
  is_open: boolean;
  is_featured: boolean;
}

export default function PollsHeroSection() {
  const [poll, setPoll] = useState<HeroPoll | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchFeatured = async () => {
      try {
        // Lógica mixta: featured manual primero, fallback a más votada
        const res = await fetch(`${API_URL}/api/v1/polls/featured`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data) {
            setPoll(data);
          }
        }
      } catch (err) {
        console.error("Error fetching hero poll:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchFeatured();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className="px-6 pb-10">
        <div className="max-w-7xl mx-auto">
          <div
            className="rounded-2xl overflow-hidden animate-pulse"
            style={{
              background: "rgba(57,255,20,0.04)",
              border: "1px solid rgba(57,255,20,0.08)",
              height: 320,
            }}
          />
        </div>
      </section>
    );
  }

  if (!poll) {
    return (
      <section className="px-6 pb-10">
        <div className="max-w-7xl mx-auto">
          <div
            className="rounded-2xl p-12 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(57,255,20,0.05) 0%, rgba(0,229,255,0.05) 100%)",
              border: "1px solid rgba(57,255,20,0.15)",
            }}
          >
            <p className="text-2xl mb-3">🎯</p>
            <p className="text-sm font-mono uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
              Sin encuestas destacadas disponibles
            </p>
          </div>
        </div>
      </section>
    );
  }

  const endsAtDate = new Date(poll.ends_at).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="px-6 pb-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: "#39FF14", boxShadow: "0 0 6px rgba(57,255,20,0.5)" }}
          />
          <span className="text-sm">🎯</span>
          <h2 className="text-xs tracking-[0.18em] uppercase font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
            Encuesta Destacada
          </h2>
        </div>

        {/* Hero Card */}
        <Link href={`/encuestas/${poll.slug || poll.id}`} style={{ textDecoration: "none" }}>
          <div
            className="rounded-2xl overflow-hidden cursor-pointer transition-all hover:border-opacity-100"
            style={{
              background: "rgba(17,17,17,0.9)",
              border: `2px solid ${poll.is_open ? "rgba(57,255,20,0.2)" : "rgba(255,255,255,0.1)"}`,
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.transform = "translateY(-4px)";
              el.style.borderColor = poll.is_open ? "rgba(57,255,20,0.5)" : "rgba(255,255,255,0.2)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.transform = "translateY(0)";
              el.style.borderColor = poll.is_open ? "rgba(57,255,20,0.2)" : "rgba(255,255,255,0.1)";
            }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
              {/* Image */}
              <div
                style={{
                  height: "280px",
                  background: poll.header_image
                    ? "transparent"
                    : "linear-gradient(135deg, rgba(57,255,20,0.1) 0%, rgba(0,229,255,0.1) 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {poll.header_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={poll.header_image}
                    alt={poll.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 64, opacity: 0.2 }}>📊</span>
                )}

                {/* Status */}
                <span
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    fontSize: 11,
                    fontFamily: "monospace",
                    padding: "4px 12px",
                    borderRadius: 20,
                    background: poll.is_open ? "rgba(57,255,20,0.2)" : "rgba(0,0,0,0.6)",
                    color: poll.is_open ? "#39FF14" : "rgba(255,255,255,0.4)",
                    border: `1px solid ${poll.is_open ? "rgba(57,255,20,0.4)" : "rgba(255,255,255,0.15)"}`,
                    fontWeight: 600,
                  }}
                >
                  {poll.is_open ? "● ABIERTA AHORA" : "CERRADA"}
                </span>
              </div>

              {/* Content */}
              <div className="p-8 flex flex-col justify-between">
                <div>
                  <h1
                    className="text-2xl md:text-3xl font-bold mb-4 leading-tight"
                    style={{ color: "#f5f5f5" }}
                  >
                    {poll.title}
                  </h1>
                  {poll.description && (
                    <p className="text-sm text-foreground-muted mb-6 leading-relaxed">
                      {poll.description}
                    </p>
                  )}
                </div>

                {/* Stats */}
                <div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <p
                        className="text-2xl font-mono font-bold"
                        style={{ color: "#39FF14" }}
                      >
                        {poll.total_votes.toLocaleString()}
                      </p>
                      <p className="text-xs uppercase tracking-wider text-foreground-muted">
                        Votos
                      </p>
                    </div>
                    <div>
                      <p
                        className="text-sm font-mono"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                      >
                        Cierra el
                      </p>
                      <p className="text-xs font-mono text-foreground-muted">
                        {endsAtDate}
                      </p>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="text-[11px] font-mono uppercase tracking-wider px-4 py-3 rounded-lg inline-block transition-all hover:scale-105 active:scale-95"
                    style={{
                      backgroundColor: poll.is_open ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${poll.is_open ? "rgba(57,255,20,0.3)" : "rgba(255,255,255,0.1)"}`,
                      color: poll.is_open ? "#39FF14" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {poll.is_open ? "✓ Ir a votar →" : "Ver resultados →"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}
