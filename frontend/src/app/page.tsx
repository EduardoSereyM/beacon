/**
 * BEACON PROTOCOL — Home Dashboard
 * ==================================
 * Dashboard curado: Hero · Top Políticos · Empresas · Personajes Públicos · Stats
 *
 * Fetches paralelos por sección (sin carga masiva de 200 entidades).
 * Filtros eliminados del home → viven en /politicos, /empresas, /periodistas.
 *
 * "La primera impresión es el primer juicio. Hazle sentir el poder."
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import EntityCard from "@/components/status/EntityCard";

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
  rank: "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";
  integrity_index: number;
  service_tags?: string[];
}

async function fetchSection(category: string, limit: number): Promise<BackendEntity[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (category) params.set("category", category);
    const res = await fetch(`${API_URL}/api/v1/entities?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.entities || [];
  } catch {
    return [];
  }
}

// ─── Skeleton Card ───
function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-5 animate-pulse"
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        height: "180px",
      }}
    />
  );
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
  loading,
  cols = 3,
}: {
  entities: BackendEntity[];
  loading: boolean;
  cols?: number;
}) {
  const skeletons = Array.from({ length: cols });
  const gridClass =
    cols === 5
      ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
      : cols === 4
      ? "grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5";

  if (loading) {
    return (
      <div className={gridClass}>
        {skeletons.map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

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
          style={{
            animation: `fadeInUp 0.4s ease-out ${idx * 50}ms both`,
          }}
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

export default function Home() {
  const [politicos, setPoliticos] = useState<BackendEntity[]>([]);
  const [empresas, setEmpresas] = useState<BackendEntity[]>([]);
  const [periodistas, setPeriodistas] = useState<BackendEntity[]>([]);
  const [totalEntities, setTotalEntities] = useState<number>(0);

  const [loadingPoliticos, setLoadingPoliticos] = useState(true);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [loadingPeriodistas, setLoadingPeriodistas] = useState(true);

  useEffect(() => {
    // Fetches paralelos — no se esperan entre sí
    fetchSection("politico", 5).then((data) => {
      setPoliticos(data);
      setLoadingPoliticos(false);
    });

    fetchSection("empresario", 4).then((data) => {
      setEmpresas(data);
      setLoadingEmpresas(false);
    });

    fetchSection("periodista", 4).then((data) => {
      setPeriodistas(data);
      setLoadingPeriodistas(false);
    });

    // Conteo real via fetch de 200 — se usa solo para el stat del footer
    fetchSection("", 200).then((data) => {
      setTotalEntities(data.length);
    });
  }, []);

  return (
    <div className="min-h-screen">
      {/* ═══════════════════════════════════════════
       *  HERO
       * ═══════════════════════════════════════════ */}
      <section className="relative pt-20 pb-16 px-6 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(0,229,255,0.06) 0%, transparent 70%)",
          }}
        />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6 glass">
            <div className="w-1.5 h-1.5 rounded-full bg-beacon-neon pulse-live" />
            <span className="text-[10px] text-foreground-muted tracking-[0.2em] uppercase font-mono">
              Protocolo Activo — Verificación Humana en Curso
            </span>
          </div>

          {/* Título */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight mb-6">
            <span className="text-foreground">La Verdad Humana,</span>
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #00E5FF, #8A2BE2)" }}
            >
              Validada.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-foreground-muted max-w-xl mx-auto mb-10 leading-relaxed">
            Tu voz tiene peso. Tu identidad tiene valor. Beacon valida la autenticidad de
            cada opinión mediante verificación forense de comportamiento.
          </p>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/entities"
              className="px-6 py-3 rounded-xl text-sm font-semibold uppercase tracking-wider transition-all duration-300 hover:scale-105"
              style={{
                background: "linear-gradient(135deg, rgba(0,229,255,0.15), rgba(138,43,226,0.15))",
                border: "1px solid rgba(0,229,255,0.3)",
                color: "#00E5FF",
              }}
            >
              Explorar Entidades
            </Link>
            <Link
              href="/versus"
              className="px-6 py-3 rounded-xl text-sm font-semibold uppercase tracking-wider transition-all duration-300 hover:scale-105"
              style={{
                background: "rgba(212,175,55,0.08)",
                border: "1px solid rgba(212,175,55,0.25)",
                color: "#D4AF37",
              }}
            >
              ⚔️ VS del Momento
            </Link>
          </div>
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
          <EntityGrid entities={politicos} loading={loadingPoliticos} cols={5} />
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
          <EntityGrid entities={empresas} loading={loadingEmpresas} cols={4} />
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
            href="/periodistas"
          />
          <EntityGrid entities={periodistas} loading={loadingPeriodistas} cols={4} />
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════
       *  VS PLACEHOLDER (hasta que exista el endpoint)
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

          {/* Teaser card */}
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

      {/* ═══════════════════════════════════════════
       *  STATS FOOTER
       * ═══════════════════════════════════════════ */}
      <section className="border-t border-beacon-border px-6 py-10 mt-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: "Ciudadanos Activos", value: "1,646", color: "#D4AF37" },
            {
              label: "Entidades en BBDD",
              value: totalEntities > 0 ? totalEntities.toLocaleString() : "—",
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
