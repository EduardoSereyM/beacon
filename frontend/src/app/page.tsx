/**
 * BEACON PROTOCOL — Index Page (La Puerta Principal)
 * ====================================================
 * Hero Section: Título con gradiente cian → púrpura.
 * Buscador de Poder: JetBrains Mono, glow verde al detectar humano.
 * Grid de Tendencias: Entidades más votadas con pulso cyber verde.
 *
 * "La primera impresión es el primer juicio. Hazle sentir el poder."
 */

"use client";

import { useState } from "react";
import EntityCard from "@/components/status/EntityCard";

/** Demo: entidades trending para el grid */
const TRENDING_ENTITIES = [
  {
    id: "e-001",
    name: "Gabriel Boric",
    type: "PERSON" as const,
    metadata: { role: "Presidente de Chile", party: "Convergencia Social" },
    reputation_score: 3.72,
    total_reviews: 1842,
    is_verified: true,
    rank: "GOLD" as const,
    integrity_index: 78,
  },
  {
    id: "e-002",
    name: "Banco Estado",
    type: "COMPANY" as const,
    metadata: { sector: "Banca Estatal" },
    service_tags: ["BANCO", "MICROFINANZAS"],
    reputation_score: 2.41,
    total_reviews: 3290,
    is_verified: true,
    rank: "SILVER" as const,
    integrity_index: 52,
  },
  {
    id: "e-003",
    name: "Lollapalooza Chile 2026",
    type: "EVENT" as const,
    metadata: { location: "Parque O'Higgins", date: "Marzo 2026" },
    reputation_score: 4.58,
    total_reviews: 892,
    is_verified: false,
    rank: "GOLD" as const,
    integrity_index: 91,
  },
  {
    id: "e-004",
    name: "Evelyn Matthei",
    type: "PERSON" as const,
    metadata: { role: "Ex Ministra del Trabajo", party: "UDI" },
    reputation_score: 3.15,
    total_reviews: 2105,
    is_verified: true,
    rank: "SILVER" as const,
    integrity_index: 65,
  },
  {
    id: "e-005",
    name: "Entel",
    type: "COMPANY" as const,
    metadata: { sector: "Telecomunicaciones" },
    service_tags: ["TELECOM", "INTERNET", "FIBRA"],
    reputation_score: 2.89,
    total_reviews: 1567,
    is_verified: true,
    rank: "BRONZE" as const,
    integrity_index: 44,
  },
  {
    id: "e-006",
    name: "Festival de Viña 2026",
    type: "EVENT" as const,
    metadata: { location: "Quinta Vergara, Viña del Mar" },
    reputation_score: 4.12,
    total_reviews: 3401,
    is_verified: true,
    rank: "GOLD" as const,
    integrity_index: 85,
  },
];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchGlow, setSearchGlow] = useState(false);

  /** Simula la detección de un humano real al escribir */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    // Glow verde (#39FF14) si detectamos comportamiento humano (> 3 chars con delay)
    setSearchGlow(value.length > 3);
  };

  return (
    <div className="min-h-screen">
      {/* ═══════════════════════════════════════════
       *  HERO SECTION
       *  Fondo #0A0A0A. Título con gradiente cian → púrpura.
       * ═══════════════════════════════════════════ */}
      <section className="relative pt-20 pb-16 px-6 overflow-hidden">
        {/* Subtle radial glow behind hero */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(0, 229, 255, 0.06) 0%, transparent 70%)",
          }}
        />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Badge superior */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6 glass">
            <div className="w-1.5 h-1.5 rounded-full bg-beacon-neon pulse-live" />
            <span className="text-[10px] text-foreground-muted tracking-[0.2em] uppercase font-mono">
              Protocolo Activo — Verificación Humana en Curso
            </span>
          </div>

          {/* Título Hero */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight mb-6">
            <span className="text-foreground">La Verdad Humana,</span>
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: "linear-gradient(135deg, #00E5FF, #8A2BE2)",
              }}
            >
              Validada.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-foreground-muted max-w-xl mx-auto mb-10 leading-relaxed">
            Tu voz tiene peso. Tu identidad tiene valor. Beacon valida la
            autenticidad de cada opinión mediante verificación forense de
            comportamiento.
          </p>

          {/* ═══ BUSCADOR DE PODER ═══
           * Input masivo con JetBrains Mono.
           * Glow verde (#39FF14) al detectar humano real. */}
          <div className="max-w-2xl mx-auto relative">
            <div
              className="relative rounded-xl overflow-hidden transition-all duration-500"
              style={{
                boxShadow: searchGlow
                  ? "0 0 20px rgba(57, 255, 20, 0.25), 0 0 40px rgba(57, 255, 20, 0.1)"
                  : "0 0 15px rgba(0, 229, 255, 0.08)",
                border: searchGlow
                  ? "1px solid rgba(57, 255, 20, 0.3)"
                  : "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Busca un político, empresa, evento o encuesta..."
                className="w-full bg-beacon-dark px-6 py-4 text-base text-foreground placeholder-foreground-muted outline-none"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  caretColor: searchGlow ? "#39FF14" : "#00E5FF",
                }}
              />

              {/* Indicador de estado (derecha) */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {searchGlow && (
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider neon-pulse"
                    style={{ color: "#39FF14" }}
                  >
                    HUMAN DETECTED
                  </span>
                )}
                <div
                  className="w-2.5 h-2.5 rounded-full transition-colors duration-500"
                  style={{
                    backgroundColor: searchGlow ? "#39FF14" : "#00E5FF",
                    boxShadow: searchGlow
                      ? "0 0 8px rgba(57, 255, 20, 0.5)"
                      : "0 0 8px rgba(0, 229, 255, 0.3)",
                  }}
                />
              </div>
            </div>

            {/* Sub-texto del buscador */}
            <p className="text-[10px] text-foreground-muted mt-3 font-mono tracking-wider">
              <span style={{ color: "#00E5FF" }}>DNA SCANNER</span> activo ·
              Fuzzy search con{" "}
              <span style={{ color: "#D4AF37" }}>pg_trgm</span> · 4 tipos de
              entidad
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
       *  GRID DE TENDENCIAS
       *  Entidades más votadas con pulso verde cyber.
       * ═══════════════════════════════════════════ */}
      <section className="px-6 pb-20">
        <div className="max-w-7xl mx-auto">
          {/* Header de sección */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full pulse-live"
                style={{ backgroundColor: "#39FF14" }}
              />
              <h2 className="text-xs tracking-[0.2em] uppercase text-foreground-muted font-medium">
                Entidades en Tendencia
              </h2>
            </div>
            <a
              href="/entities"
              className="text-[10px] uppercase tracking-wider font-mono hover:text-beacon-gold transition-colors"
              style={{ color: "#00E5FF" }}
            >
              Ver todas →
            </a>
          </div>

          {/* Grid 3 columnas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TRENDING_ENTITIES.map((entity) => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
       *  STATS FOOTER
       *  Métricas rápidas del protocolo
       * ═══════════════════════════════════════════ */}
      <section className="border-t border-beacon-border px-6 py-8">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            {
              label: "Ciudadanos Activos",
              value: "1,646",
              color: "#D4AF37",
            },
            {
              label: "Entidades Evaluadas",
              value: "248",
              color: "#00E5FF",
            },
            {
              label: "Votos Procesados",
              value: "18,403",
              color: "#39FF14",
            },
            {
              label: "Bots Silenciados",
              value: "214",
              color: "#FF073A",
            },
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
