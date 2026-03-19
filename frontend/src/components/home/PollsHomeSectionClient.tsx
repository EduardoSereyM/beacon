"use client";

/**
 * PollsHomeSectionClient
 * ─────────────────────
 * Client Component: fetchea encuestas activas en el cliente (siempre fresco).
 * Evita el stale-cache de Next.js ISR en el home.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface HomePoll {
  id: string;
  title: string;
  header_image: string | null;
  poll_type: string;
  ends_at: string;
  total_votes: number;
  requires_auth: boolean;
  is_open: boolean;
}

export default function PollsHomeSectionClient() {
  const [polls, setPolls] = useState<HomePoll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/v1/polls`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => {
        if (!cancelled) {
          setPolls((data.items || []).slice(0, 3));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="px-6 pb-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "#39FF14", boxShadow: "0 0 6px rgba(57,255,20,0.5)" }}
            />
            <span className="text-sm">📊</span>
            <h2 className="text-xs tracking-[0.18em] uppercase font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
              Encuestas Activas
            </h2>
          </div>
          <Link
            href="/encuestas"
            className="text-[10px] uppercase tracking-wider font-mono transition-colors hover:opacity-80"
            style={{ color: "#00E5FF" }}
          >
            Ver todas →
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden animate-pulse"
                style={{ background: "rgba(57,255,20,0.04)", border: "1px solid rgba(57,255,20,0.08)", height: 180 }}
              />
            ))}
          </div>
        ) : polls.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(57,255,20,0.05) 0%, rgba(0,229,255,0.05) 100%)",
              border: "1px solid rgba(57,255,20,0.15)",
            }}
          >
            <p className="text-2xl mb-2">📊</p>
            <p className="text-sm font-mono uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
              Sin encuestas activas por ahora
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {polls.map((poll) => (
              <Link key={poll.id} href={`/encuestas/${poll.id}`} style={{ textDecoration: "none" }}>
                <div
                  style={{
                    background: "rgba(17,17,17,0.9)",
                    border: `1px solid ${poll.is_open ? "rgba(57,255,20,0.15)" : "rgba(255,255,255,0.07)"}`,
                    borderRadius: 16,
                    overflow: "hidden",
                    cursor: "pointer",
                    transition: "border-color 0.2s, transform 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
                >
                  {/* Imagen o placeholder */}
                  <div style={{ height: 120, background: poll.header_image ? "transparent" : "linear-gradient(135deg, rgba(57,255,20,0.08) 0%, rgba(0,229,255,0.08) 100%)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                    {poll.header_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={poll.header_image} alt={poll.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 32, opacity: 0.4 }}>📊</span>
                    )}
                    <span style={{ position: "absolute", top: 10, right: 10, fontSize: 9, fontFamily: "monospace", padding: "2px 8px", borderRadius: 20, background: poll.is_open ? "rgba(57,255,20,0.15)" : "rgba(0,0,0,0.6)", color: poll.is_open ? "#39FF14" : "rgba(255,255,255,0.4)", border: `1px solid ${poll.is_open ? "rgba(57,255,20,0.3)" : "rgba(255,255,255,0.12)"}` }}>
                      {poll.is_open ? "● ABIERTA" : "CERRADA"}
                    </span>
                    {!poll.requires_auth && (
                      <span style={{ position: "absolute", top: 10, left: 10, fontSize: 9, fontFamily: "monospace", padding: "2px 8px", borderRadius: 20, background: "rgba(57,255,20,0.12)", color: "#39FF14", border: "1px solid rgba(57,255,20,0.2)" }}>⚡ Flash</span>
                    )}
                  </div>
                  <div style={{ padding: "14px 16px" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5", marginBottom: 6, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                      {poll.title}
                    </p>
                    <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>
                      {poll.total_votes} votos · Cierra {new Date(poll.ends_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
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
