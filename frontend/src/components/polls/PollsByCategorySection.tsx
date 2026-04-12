/**
 * PollsByCategorySection
 * ──────────────────────
 * Shows active polls grouped by category.
 * Displays category tabs with polls in a grid layout.
 */

"use client";

import { useEffect, useState } from "react";
import PollCard from "./PollCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface CategoryPoll {
  id: string;
  slug: string;
  title: string;
  header_image: string | null;
  poll_type: string;
  category: string;
  total_votes: number;
  ends_at: string;
  is_open: boolean;
  requires_auth: boolean;
}

const CATEGORIES = [
  { value: "politica", label: "Política", emoji: "⚖️" },
  { value: "economia", label: "Economía", emoji: "💰" },
  { value: "educacion", label: "Educación", emoji: "📚" },
  { value: "salud", label: "Salud", emoji: "🏥" },
  { value: "seguridad", label: "Seguridad", emoji: "🛡️" },
  { value: "ambiente", label: "Ambiente", emoji: "🌍" },
  { value: "cultura", label: "Cultura", emoji: "🎭" },
  { value: "deporte", label: "Deporte", emoji: "⚽" },
];

export default function PollsByCategorySection() {
  const [pollsByCategory, setPollsByCategory] = useState<Record<string, CategoryPoll[]>>({});
  const [activeCategory, setActiveCategory] = useState("politica");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchByCategory = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/polls?limit=100`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.items) {
            const grouped: Record<string, CategoryPoll[]> = {};
            CATEGORIES.forEach((cat) => {
              grouped[cat.value] = [];
            });

            (data.items as CategoryPoll[]).forEach((poll) => {
              const category = poll.category || "general";
              if (!grouped[category]) {
                grouped[category] = [];
              }
              grouped[category].push(poll);
            });

            setPollsByCategory(grouped);
          }
        }
      } catch (err) {
        console.error("Error fetching category polls:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchByCategory();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className="px-6 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="h-40 rounded-2xl overflow-hidden animate-pulse"
            style={{
              background: "rgba(57,255,20,0.04)",
              border: "1px solid rgba(57,255,20,0.08)",
            }}
          />
        </div>
      </section>
    );
  }

  const activeCategoryPolls = pollsByCategory[activeCategory] || [];
  const activeCategoryLabel = CATEGORIES.find((c) => c.value === activeCategory);

  return (
    <section className="px-6 pb-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: "#00E5FF", boxShadow: "0 0 6px rgba(0,229,255,0.5)" }}
          />
          <span className="text-sm">🏷️</span>
          <h2 className="text-xs tracking-[0.18em] uppercase font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
            Por Categoría
          </h2>
        </div>

        {/* Category Tabs */}
        <div className="mb-6 overflow-x-auto pb-2">
          <div className="flex gap-2 min-w-min">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setActiveCategory(cat.value)}
                className="flex items-center gap-2 px-4 py-2 rounded-full font-mono text-[11px] uppercase tracking-wider transition-all whitespace-nowrap"
                style={{
                  backgroundColor: activeCategory === cat.value ? "rgba(0,229,255,0.2)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${activeCategory === cat.value ? "rgba(0,229,255,0.4)" : "rgba(255,255,255,0.1)"}`,
                  color: activeCategory === cat.value ? "#00E5FF" : "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  if (activeCategory !== cat.value) {
                    el.style.backgroundColor = "rgba(255,255,255,0.08)";
                    el.style.borderColor = "rgba(255,255,255,0.15)";
                  }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  if (activeCategory !== cat.value) {
                    el.style.backgroundColor = "rgba(255,255,255,0.05)";
                    el.style.borderColor = "rgba(255,255,255,0.1)";
                  }
                }}
              >
                <span>{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Polls Grid */}
        {activeCategoryPolls.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(0,229,255,0.05) 0%, rgba(57,255,20,0.05) 100%)",
              border: "1px solid rgba(0,229,255,0.15)",
            }}
          >
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm font-mono uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
              Sin encuestas en {activeCategoryLabel?.label}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeCategoryPolls.map((poll) => (
              <PollCard
                key={poll.id}
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
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
