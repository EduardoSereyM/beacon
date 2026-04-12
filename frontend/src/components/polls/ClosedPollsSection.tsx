/**
 * ClosedPollsSection
 * ──────────────────
 * Shows recently closed polls with result summaries.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ClosedPoll {
  id: string;
  slug: string;
  title: string;
  header_image: string | null;
  poll_type: string;
  options?: string[] | null;
  total_votes: number;
  ends_at: string;
  is_open: boolean;
}

export default function ClosedPollsSection() {
  const [polls, setPolls] = useState<ClosedPoll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchClosed = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/polls?status=closed&limit=4`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.items) {
            setPolls(data.items as ClosedPoll[]);
          }
        }
      } catch (err) {
        console.error("Error fetching closed polls:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchClosed();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className="px-6 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden animate-pulse"
                style={{
                  background: "rgba(138,43,226,0.04)",
                  border: "1px solid rgba(138,43,226,0.08)",
                  height: 180,
                }}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 pb-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "#8A2BE2", boxShadow: "0 0 6px rgba(138,43,226,0.5)" }}
            />
            <span className="text-sm">✅</span>
            <h2 className="text-xs tracking-[0.18em] uppercase font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
              Resultados Recientes
            </h2>
          </div>
          <Link
            href="/encuestas"
            className="text-[10px] uppercase tracking-wider font-mono transition-colors hover:opacity-80"
            style={{ color: "#8A2BE2" }}
          >
            Ver archivo →
          </Link>
        </div>

        {/* Content */}
        {polls.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(138,43,226,0.05) 0%, rgba(212,175,55,0.05) 100%)",
              border: "1px solid rgba(138,43,226,0.15)",
            }}
          >
            <p className="text-2xl mb-2">✅</p>
            <p className="text-sm font-mono uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
              Sin encuestas cerradas disponibles
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {polls.map((poll) => (
              <Link key={poll.id} href={`/encuestas/${poll.slug || poll.id}`} style={{ textDecoration: "none" }}>
                <div
                  className="h-full rounded-2xl overflow-hidden cursor-pointer transition-all"
                  style={{
                    background: "rgba(17,17,17,0.9)",
                    border: "1px solid rgba(138,43,226,0.15)",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.transform = "translateY(-2px)";
                    el.style.borderColor = "rgba(138,43,226,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.transform = "translateY(0)";
                    el.style.borderColor = "rgba(138,43,226,0.15)";
                  }}
                >
                  {/* Image */}
                  <div
                    style={{
                      height: 100,
                      background: poll.header_image
                        ? "transparent"
                        : "linear-gradient(135deg, rgba(138,43,226,0.1) 0%, rgba(212,175,55,0.1) 100%)",
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
                      <span style={{ fontSize: 28, opacity: 0.2 }}>📊</span>
                    )}
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        fontSize: 8,
                        fontFamily: "monospace",
                        padding: "2px 6px",
                        borderRadius: 12,
                        background: "rgba(138,43,226,0.2)",
                        color: "#8A2BE2",
                        border: "1px solid rgba(138,43,226,0.3)",
                      }}
                    >
                      CERRADA
                    </span>
                  </div>

                  {/* Content */}
                  <div className="p-3">
                    <p
                      className="text-xs font-bold mb-2"
                      style={{
                        color: "#f5f5f5",
                        lineHeight: 1.2,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                      }}
                    >
                      {poll.title}
                    </p>
                    <p
                      className="text-[9px] font-mono"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      {poll.total_votes} votos
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
