/**
 * BEACON PROTOCOL — Home Dashboard
 * ==================================
 * Server Component con ISR (revalidate 60s).
 * Fetches paralelos server-side → Vercel cachea → el usuario NUNCA ve Render dormido.
 *
 * "La primera impresión es el primer juicio. Hazle sentir el poder."
 */

import Link from "next/link";
import type { Metadata } from "next";
import EntityCard from "@/components/status/EntityCard";
import HomeHeroClient from "@/components/home/HomeHeroClient";
import PollsHomeSectionClient from "@/components/home/PollsHomeSectionClient";

export const revalidate = 10;

export const metadata: Metadata = {
  title: "Beacon Protocol — Motor de Integridad Digital",
  description:
    "Evalúa políticos, empresarios y personajes públicos de Chile. Verificación humana forense. La verdad validada.",
  alternates: {
    canonical: "https://www.beaconchile.cl",
  },
  openGraph: {
    title: "Beacon Protocol — Motor de Integridad Digital",
    description:
      "Evalúa políticos, empresarios y personajes públicos de Chile. " +
      "Verificación humana forense. La verdad validada.",
    url: "https://www.beaconchile.cl",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Beacon Protocol — Motor de Integridad Digital",
      },
    ],
  },
};

// ─── JSON-LD Schema.org ───
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Beacon Protocol",
  alternateName: "Beacon",
  url: "https://www.beaconchile.cl",
  description:
    "Motor de Integridad Digital — Evalúa políticos, empresarios y personajes públicos de Chile.",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://www.beaconchile.cl/entities?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
  publisher: {
    "@type": "Organization",
    name: "Beacon Protocol",
    url: "https://www.beaconchile.cl",
    logo: {
      "@type": "ImageObject",
      url: "https://www.beaconchile.cl/favicon.ico",
    },
  },
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface BackendEntity {
  id: string;
  first_name: string;
  last_name: string;
  second_last_name?: string;
  category: string;
  position?: string;
  region?: string;
  district?: string;
  bio?: string;
  party?: string;
  photo_path?: string;
  official_links?: Record<string, unknown>;
  reputation_score: number;
  total_reviews: number;
  is_verified: boolean;
  integrity_index: number;
  service_tags?: string[];
}

async function fetchSection(category: string, limit: number): Promise<BackendEntity[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (category) params.set("category", category);
    const res = await fetch(`${API_URL}/api/v1/entities?${params.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.entities || [];
  } catch {
    return [];
  }
}

// ─── Section Header ───
function SectionHeader({
  icon,
  title,
  count,
  href,
}: {
  icon: string;
  title: string;
  count?: number;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: "#39FF14", boxShadow: "0 0 6px rgba(57,255,20,0.5)" }}
        />
        <span className="text-sm" aria-hidden>
          {icon}
        </span>
        <h2 className="text-xs tracking-[0.18em] uppercase text-foreground-muted font-medium">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-[9px] font-mono text-foreground-muted">({count})</span>
        )}
      </div>
      <Link
        href={href}
        className="text-[10px] uppercase tracking-wider font-mono transition-colors hover:opacity-80"
        style={{ color: "#00E5FF" }}
      >
        Ver todos →
      </Link>
    </div>
  );
}

// ─── Entity Grid ───
function EntityGrid({
  entities,
  cols = 3,
}: {
  entities: BackendEntity[];
  cols?: number;
}) {
  const gridClass =
    cols === 5
      ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5"
      : cols === 4
        ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5";

  if (!entities.length) {
    return (
      <p className="text-[11px] text-foreground-muted font-mono py-6 text-center">
        Sin datos disponibles
      </p>
    );
  }

  return (
    <div className={gridClass}>
      {entities.map((entity, idx) => (
        <div
          key={entity.id}
          style={{ animation: `fadeInUp 0.4s ease-out ${idx * 50}ms both` }}
        >
          <EntityCard entity={entity} />
        </div>
      ))}
    </div>
  );
}

// ─── Divider ───
function SectionDivider() {
  return (
    <div
      className="my-10"
      style={{
        height: "1px",
        background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.15), transparent)",
      }}
    />
  );
}

// ─── Page ───
export default async function Home() {
  // Fetches paralelos en el servidor — Vercel cachea, Render dormido no afecta al usuario
  const [politicos, empresas, periodistas, allEntities] = await Promise.all([
    fetchSection("politico", 9),
    fetchSection("empresario", 9),
    fetchSection("periodista", 9),
    fetchSection("", 200),
  ]);

  return (
    <div className="min-h-screen">
      {/* ─── JSON-LD ─── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <style>{`
        @keyframes beaconPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0px transparent; }
          50%       { opacity: 0.5; box-shadow: 0 0 10px rgba(0,229,255,0.15); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ═══════════════════════════════════════════
       *  HERO
       * ═══════════════════════════════════════════ */}
      <HomeHeroClient />

      <SectionDivider />

      {/* ═══════════════════════════════════════════
       *  ENCUESTAS
       * ═══════════════════════════════════════════ */}
      <PollsHomeSectionClient />

      <SectionDivider />

      {/* ═══════════════════════════════════════════
       *  VS
       * ═══════════════════════════════════════════ */}
      <section className="px-6 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: "#D4AF37", boxShadow: "0 0 6px rgba(212,175,55,0.5)" }}
              />
              <span className="text-sm">⚔️</span>
              <h2 className="text-xs tracking-[0.18em] uppercase text-foreground-muted font-medium">
                VS del Momento
              </h2>
            </div>
            <Link
              href="/versus"
              className="text-[10px] uppercase tracking-wider font-mono transition-colors hover:opacity-80"
              style={{ color: "#D4AF37" }}
            >
              Ver todos →
            </Link>
          </div>

          <div
            className="rounded-xl p-8 text-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(212,175,55,0.05) 0%, rgba(138,43,226,0.05) 100%)",
              border: "1px solid rgba(212,175,55,0.15)",
            }}
          >
            <p className="text-2xl mb-2">⚔️</p>
            <p className="text-sm font-mono text-foreground-muted uppercase tracking-wider">
              Próximamente — Enfrentamientos en tiempo real
            </p>
            <Link
              href="/versus"
              className="inline-block mt-4 text-[11px] font-mono uppercase tracking-wider px-4 py-2 rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor: "rgba(212,175,55,0.1)",
                border: "1px solid rgba(212,175,55,0.3)",
                color: "#D4AF37",
              }}
            >
              Entrar al Arena →
            </Link>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════
       *  PERSONAJES PÚBLICOS
       * ═══════════════════════════════════════════ */}
      <section className="px-6 pb-10">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            icon="👤"
            title="Personajes Públicos"
            count={periodistas.length}
            href="/personajes"
          />
          <EntityGrid entities={periodistas} cols={3} />
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════
       *  EMPRESAS DESTACADAS
       * ═══════════════════════════════════════════ */}
      <section className="px-6 pb-10">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            icon="🏢"
            title="Empresas Destacadas"
            count={empresas.length}
            href="/empresas"
          />
          <EntityGrid entities={empresas} cols={3} />
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════
       *  TOP POLÍTICOS
       * ═══════════════════════════════════════════ */}
      <section className="px-6 pb-10">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            icon="⚖️"
            title="Top Políticos"
            count={politicos.length}
            href="/politicos"
          />
          <EntityGrid entities={politicos} cols={3} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
       *  STATS FOOTER
       * ═══════════════════════════════════════════ */}
      <section className="border-t border-beacon-border px-6 py-10 mt-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: "Ciudadanos Activos", value: "1,646", color: "#D4AF37" },
            {
              label: "Entidades en BBDD",
              value: allEntities.length > 0 ? allEntities.length.toLocaleString() : "—",
              color: "#00E5FF",
            },
            { label: "Votos Procesados", value: "18,403", color: "#39FF14" },
            { label: "Bots Silenciados", value: "214", color: "#FF073A" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p
                className="text-2xl sm:text-3xl font-mono score-display font-bold"
                style={{ color: stat.color }}
              >
                {stat.value}
              </p>
              <p className="text-[10px] text-foreground-muted tracking-wider uppercase mt-1">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
