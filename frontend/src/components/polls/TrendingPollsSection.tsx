/**
 * TrendingPollsSection
 * ────────────────────
 * Shows the top 3 trending polls by vote count.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PollCard from "./PollCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface TrendingPoll {
  id: string;
  slug: string;
  title: string;
  header_image: string | null;
  poll_type: string;
  total_votes: number;
  ends_at: string;
  is_open: boolean;
  requires_auth: boolean;
}

export default function TrendingPollsSection() {
  const [polls, setPolls] = useState<TrendingPoll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchTrending = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/polls?limit=30`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.items) {
            // Solo contar como "tendencia" si tiene al menos 1 voto
            const sorted = (data.items as TrendingPoll[])
              .filter((p) => p.total_votes > 0)
              .sort((a, b) => b.total_votes - a.total_votes)
              .slice(0, 3);
            setPolls(sorted);
          }
        }
      } catch (err) {
        console.error("Error fetching trending polls:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTrending();
    return () => { cancelled = true; };
  }, []);

  if (!loading && polls.length === 0) return null;

  if (loading) {
    return (
      <section className="px-6 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden animate-pulse"
                style={{
                  background: "rgba(212,175,55,0.04)",
                  border: "1px solid rgba(212,175,55,0.08)",
                  height: 200,
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
              style={{ backgroundColor: "#D4AF37", boxShadow: "0 0 6px rgba(212,175,55,0.5)" }}
            />
            <span className="text-sm">🔥</span>
            <h2 className="text-xs tracking-[0.18em] uppercase font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
              Tendencias Ahora
            </h2>
          </div>
          <Link
            href="/encuestas"
            className="text-[10px] uppercase tracking-wider font-mono transition-colors hover:opacity-80"
            style={{ color: "#D4AF37" }}
          >
            Ver todas →
          </Link>
        </div>

        {/* Content */}
        {polls.length === 0 ? null : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {polls.map((poll, idx) => (
              <div
                key={poll.id}
                style={{
                  animation: `fadeInUp 0.4s ease-out ${idx * 50}ms both`,
                }}
              >
                {/* Rank Badge */}
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full font-mono text-xs font-bold"
                    style={{
                      backgroundColor: idx === 0 ? "rgba(212,175,55,0.2)" : `rgba(${255 - idx * 50},${255 - idx * 50},${255 - idx * 50},0.1)`,
                      color: idx === 0 ? "#D4AF37" : "rgba(255,255,255,0.4)",
                      border: idx === 0 ? "1px solid rgba(212,175,55,0.4)" : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
                  </span>
                  <span className="text-xs font-mono text-foreground-muted">
                    {poll.total_votes} votos
                  </span>
                </div>
                <PollCard
                  id={poll.id}
                  slug={poll.slug}
                  title={poll.title}
                  headerImage={poll.header_image}
                  totalVotes={poll.total_votes}
                  endsAt={poll.ends_at}
                  isOpen={poll.is_open}
                  requiresAuth={poll.requires_auth}
                  size="small"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
