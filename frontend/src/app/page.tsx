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
import { Users, ShieldCheck, BarChart3 } from "lucide-react";
import HomeHeroClient from "@/components/home/HomeHeroClient";
import PollsHeroSection from "@/components/polls/PollsHeroSection";
import TrendingPollsSection from "@/components/polls/TrendingPollsSection";
import PollsByCategorySection from "@/components/polls/PollsByCategorySection";
import ClosedPollsSection from "@/components/polls/ClosedPollsSection";
import VotingWeightDisclaimer from "@/components/home/VotingWeightDisclaimer";
import ComparisonSection from "@/components/home/ComparisonSection";

export const revalidate = 10;

export const metadata: Metadata = {
  title: "Beacon Chile — Opinión ciudadana verificada",
  description:
    "La plataforma de opinión ciudadana abierta y verificada de Chile. Sin panelistas seleccionados ni agenda oculta. Vota, ve los resultados y propón preguntas.",
  alternates: {
    canonical: "https://www.beaconchile.cl",
  },
  openGraph: {
    title: "Beacon Chile — Opinión ciudadana verificada",
    description:
      "Sin panelistas seleccionados ni agenda oculta. Vota, ve los resultados y propón preguntas.",
    url: "https://www.beaconchile.cl",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Beacon Chile — Opinión ciudadana verificada",
      },
    ],
  },
};

// ─── JSON-LD Schema.org ───
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Beacon Chile",
  alternateName: "Beacon",
  url: "https://www.beaconchile.cl",
  description:
    "Plataforma de opinión ciudadana abierta y verificada de Chile. Sin panelistas seleccionados ni agenda oculta.",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://www.beaconchile.cl/encuestas?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
  publisher: {
    "@type": "Organization",
    name: "Beacon Chile",
    url: "https://www.beaconchile.cl",
    logo: {
      "@type": "ImageObject",
      url: "https://www.beaconchile.cl/favicon.ico",
    },
  },
};

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
export default function Home() {
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
       *  COMPARATIVA: TRADICIONALES VS BEACON
       * ═══════════════════════════════════════════ */}
      <ComparisonSection />

      <SectionDivider />

      {/* ═══════════════════════════════════════════
       *  POR QUÉ BEACON
       * ═══════════════════════════════════════════ */}
      <section className="px-6 pb-10">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                Icon: Users,
                title: "Tu voz, sin filtros",
                body: "No existe un panel de 1.000 personas elegidas por nosotros. Cualquier ciudadano puede votar, proponer preguntas y definir la agenda. Aquí nadie decide quién tiene voz.",
                color: "#00E5FF",
              },
              {
                Icon: ShieldCheck,
                title: "Cada voto, una persona real",
                body: "Tu voto cuenta porque eres real, no porque alguien te eligió. Verificamos tu identidad una sola vez — sin bots, sin multicuentas, sin criterios de admisión.",
                color: "#D4AF37",
              },
              {
                Icon: BarChart3,
                title: "Datos de Chile, para todos",
                body: "Los resultados son públicos y gratuitos, siempre. No trabajamos para empresas, partidos ni gobiernos. Los datos de opinión pública pertenecen a todos, no a quien los encarga.",
                color: "#39FF14",
              },
            ].map(({ Icon, title, body, color }) => (
              <div
                key={title}
                className="rounded-xl p-6"
                style={{
                  background: "rgba(17,17,17,0.6)",
                  border: `1px solid ${color}20`,
                }}
              >
                <Icon size={28} style={{ color }} strokeWidth={1.5} />
                <h3
                  className="text-sm font-bold uppercase tracking-wider mt-4 mb-3"
                  style={{ color }}
                >
                  {title}
                </h3>
                <p className="text-sm text-foreground-muted leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════
       *  🎯 POLLS ARE NOW PRIMARY FEATURE
       * ═══════════════════════════════════════════ */}

      {/* HERO POLL */}
      <PollsHeroSection />

      <SectionDivider />

      {/* TRENDING POLLS */}
      <TrendingPollsSection />

      <SectionDivider />

      {/* POLLS BY CATEGORY */}
      <PollsByCategorySection />

      <SectionDivider />

      {/* CLOSED POLLS / RESULTS */}
      <ClosedPollsSection />

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
       *  VOTING WEIGHT & RUT PRIVACY DISCLAIMER
       * ═══════════════════════════════════════════ */}
      <VotingWeightDisclaimer />

      <SectionDivider />

      {/* ═══════════════════════════════════════════
       *  STATS FOOTER
       * ═══════════════════════════════════════════ */}
      <section className="border-t border-beacon-border px-6 py-10 mt-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: "Ciudadanos Activos", value: "1,646", color: "#D4AF37" },
            { label: "Entidades Evaluadas", value: "—", color: "#00E5FF" },
            { label: "Votos Registrados", value: "18,403", color: "#39FF14" },
            { label: "Votos Verificados", value: "14,189", color: "#8A2BE2" },
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
