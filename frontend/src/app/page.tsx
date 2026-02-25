/**
 * BEACON PROTOCOL — Index Page con Universal Category Switcher
 * ==============================================================
 * Hero Section + Tabs de Poder + Sub-filtros dinámicos + Grid filtrado
 *
 * Arquitectura del Selector:
 *   - 4 categorías: Personajes Públicos, Empresas, Eventos Live, Encuestas Élite
 *   - Sub-filtros por service_tags (Empresas: Bancos, Retail, etc.)
 *   - Filtrado por URL params (?category=COMPANY&tag=BANCO)
 *   - Animación de desvanecimiento al cambiar categoría
 *   - Estado de carga #00E5FF ("amigos bits filtrando")
 *
 * "La primera impresión es el primer juicio. Hazle sentir el poder."
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import EntityCard from "@/components/status/EntityCard";

type EntityType = "PERSON" | "COMPANY" | "EVENT" | "POLL";

/** Categorías principales con su estética */
const CATEGORIES: {
  key: EntityType | "ALL";
  label: string;
  icon: string;
  subFilters?: { key: string; label: string }[];
}[] = [
    { key: "ALL", label: "Todas", icon: "🌐" },
    {
      key: "PERSON",
      label: "Personajes Públicos",
      icon: "👤",
    },
    {
      key: "COMPANY",
      label: "Empresas",
      icon: "🏢",
      subFilters: [
        { key: "BANCO", label: "Bancos" },
        { key: "RETAIL", label: "Retail" },
        { key: "ENERGIA", label: "Energía" },
        { key: "SALUD", label: "Salud" },
        { key: "TELECOM", label: "Telecom" },
      ],
    },
    {
      key: "EVENT",
      label: "Eventos Live",
      icon: "🎪",
      subFilters: [
        { key: "FESTIVAL", label: "Festivales" },
        { key: "ELECCION", label: "Elecciones" },
        { key: "TV", label: "Programas TV" },
      ],
    },
    {
      key: "POLL",
      label: "Encuestas Élite",
      icon: "📊",
    },
  ];

/** Demo: entidades para el grid (en producción vendrán del backend) */
const ALL_ENTITIES = [
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
    service_tags: ["FESTIVAL"],
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
    service_tags: ["FESTIVAL", "TV"],
    reputation_score: 4.12,
    total_reviews: 3401,
    is_verified: true,
    rank: "GOLD" as const,
    integrity_index: 85,
  },
  {
    id: "e-007",
    name: "Falabella",
    type: "COMPANY" as const,
    metadata: { sector: "Retail y Servicios Financieros" },
    service_tags: ["RETAIL", "BANCO"],
    reputation_score: 2.65,
    total_reviews: 4102,
    is_verified: true,
    rank: "SILVER" as const,
    integrity_index: 38,
  },
  {
    id: "e-008",
    name: "José Antonio Kast",
    type: "PERSON" as const,
    metadata: { role: "Diputado", party: "Partido Republicano" },
    reputation_score: 2.94,
    total_reviews: 2891,
    is_verified: true,
    rank: "BRONZE" as const,
    integrity_index: 57,
  },
  {
    id: "e-009",
    name: "Enel Chile",
    type: "COMPANY" as const,
    metadata: { sector: "Energía Eléctrica" },
    service_tags: ["ENERGIA"],
    reputation_score: 1.87,
    total_reviews: 2340,
    is_verified: true,
    rank: "BRONZE" as const,
    integrity_index: 29,
  },
  {
    id: "e-010",
    name: "Elecciones Municipales 2026",
    type: "EVENT" as const,
    metadata: { location: "Nacional" },
    service_tags: ["ELECCION"],
    reputation_score: 3.95,
    total_reviews: 5210,
    is_verified: true,
    rank: "GOLD" as const,
    integrity_index: 88,
  },
  {
    id: "e-011",
    name: "Isapre Consalud",
    type: "COMPANY" as const,
    metadata: { sector: "Salud" },
    service_tags: ["SALUD"],
    reputation_score: 1.45,
    total_reviews: 1890,
    is_verified: true,
    rank: "BRONZE" as const,
    integrity_index: 22,
  },
  {
    id: "e-012",
    name: "¿Debería ser legal la marihuana?",
    type: "POLL" as const,
    metadata: { topic: "Legislación" },
    reputation_score: 4.21,
    total_reviews: 8901,
    is_verified: true,
    rank: "GOLD" as const,
    integrity_index: 92,
  },
];

export default function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Estado del buscador
  const [searchQuery, setSearchQuery] = useState("");
  const [searchGlow, setSearchGlow] = useState(false);

  // Estado del Category Switcher
  const [activeCategory, setActiveCategory] = useState<EntityType | "ALL">(
    (searchParams.get("category") as EntityType | "ALL") || "ALL"
  );
  const [activeTag, setActiveTag] = useState<string>(
    searchParams.get("tag") || ""
  );
  const [isFiltering, setIsFiltering] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  /** Categoría activa con sus sub-filtros */
  const activeCategoryData = CATEGORIES.find((c) => c.key === activeCategory);

  /** Simula la detección de un humano real al escribir */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setSearchGlow(value.length > 3);
  };

  /** Cambia la categoría con animación */
  const handleCategoryChange = useCallback(
    (category: EntityType | "ALL") => {
      if (category === activeCategory) return;

      // Fase 1: Desvanecer cards actuales
      setIsVisible(false);
      setIsFiltering(true);

      // Fase 2: Cambiar categoría y URL after fade
      setTimeout(() => {
        setActiveCategory(category);
        setActiveTag(""); // Reset sub-filtro

        // Actualizar URL sin recargar
        const params = new URLSearchParams();
        if (category !== "ALL") params.set("category", category);
        const url = params.toString() ? `?${params.toString()}` : "/";
        router.push(url, { scroll: false });

        // Fase 3: Simular carga de "amigos bits"
        setTimeout(() => {
          setIsFiltering(false);
          setIsVisible(true);
        }, 400);
      }, 250);
    },
    [activeCategory, router]
  );

  /** Cambia el sub-filtro (service_tag) */
  const handleTagChange = useCallback(
    (tag: string) => {
      const newTag = tag === activeTag ? "" : tag;

      setIsVisible(false);
      setIsFiltering(true);

      setTimeout(() => {
        setActiveTag(newTag);

        // Actualizar URL
        const params = new URLSearchParams();
        if (activeCategory !== "ALL") params.set("category", activeCategory);
        if (newTag) params.set("tag", newTag);
        const url = params.toString() ? `?${params.toString()}` : "/";
        router.push(url, { scroll: false });

        setTimeout(() => {
          setIsFiltering(false);
          setIsVisible(true);
        }, 350);
      }, 200);
    },
    [activeCategory, activeTag, router]
  );

  /** Filtrado de entidades */
  const filteredEntities = useMemo(() => {
    let results = ALL_ENTITIES;

    // Filtrar por categoría
    if (activeCategory !== "ALL") {
      results = results.filter((e) => e.type === activeCategory);
    }

    // Filtrar por sub-tag
    if (activeTag) {
      results = results.filter(
        (e) =>
          "service_tags" in e &&
          (e.service_tags as string[])?.includes(activeTag)
      );
    }

    // Filtrar por búsqueda
    if (searchQuery.length > 2) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          JSON.stringify(e.metadata).toLowerCase().includes(q)
      );
    }

    return results;
  }, [activeCategory, activeTag, searchQuery]);

  // Sincronizar URL params al cargar
  useEffect(() => {
    const cat = searchParams.get("category") as EntityType | null;
    const tag = searchParams.get("tag");
    if (cat) setActiveCategory(cat);
    if (tag) setActiveTag(tag);
  }, [searchParams]);

  return (
    <div className="min-h-screen">
      {/* ═══════════════════════════════════════════
       *  HERO SECTION
       *  Fondo #0A0A0A. Título con gradiente cian → púrpura.
       * ═══════════════════════════════════════════ */}
      <section className="relative pt-20 pb-16 px-6 overflow-hidden">
        {/* Glow radial de fondo */}
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

          {/* ═══ BUSCADOR DE PODER ═══ */}
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

              {/* Indicador de estado */}
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
       *  UNIVERSAL CATEGORY SWITCHER
       *  Tabs de Poder con sub-filtros dinámicos.
       *  Acento #D4AF37 con glow hacia el contenido.
       * ═══════════════════════════════════════════ */}
      <section className="px-6 pb-4">
        <div className="max-w-7xl mx-auto">
          {/* ─── Tabs Principales ─── */}
          <div className="relative">
            {/* Scrollable tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-3 scrollbar-hide">
              {CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => handleCategoryChange(cat.key)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider whitespace-nowrap transition-all duration-300 flex-shrink-0"
                    style={{
                      backgroundColor: isActive
                        ? "rgba(212, 175, 55, 0.1)"
                        : "transparent",
                      color: isActive ? "#D4AF37" : "rgba(136, 136, 136, 0.7)",
                      border: isActive
                        ? "1px solid rgba(212, 175, 55, 0.3)"
                        : "1px solid transparent",
                      boxShadow: isActive
                        ? "0 4px 20px rgba(212, 175, 55, 0.1)"
                        : "none",
                    }}
                  >
                    <span className="text-sm">{cat.icon}</span>
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Glow dorado debajo del tab activo */}
            {activeCategory !== "ALL" && (
              <div
                className="absolute bottom-0 left-0 right-0 h-[1px] transition-opacity duration-500"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.3), transparent)",
                  boxShadow: "0 2px 12px rgba(212, 175, 55, 0.15)",
                }}
              />
            )}
          </div>

          {/* ─── Sub-filtros Dinámicos (Service Tags) ─── */}
          {activeCategoryData?.subFilters && (
            <div
              className="flex items-center gap-2 mt-3 overflow-x-auto pb-2 scrollbar-hide transition-all duration-300"
              style={{
                opacity: activeCategoryData.subFilters ? 1 : 0,
                transform: activeCategoryData.subFilters
                  ? "translateY(0)"
                  : "translateY(-8px)",
              }}
            >
              <span className="text-[9px] text-foreground-muted uppercase tracking-wider font-mono flex-shrink-0 mr-1">
                Filtrar:
              </span>
              {activeCategoryData.subFilters.map((sub) => {
                const isTagActive = activeTag === sub.key;
                return (
                  <button
                    key={sub.key}
                    onClick={() => handleTagChange(sub.key)}
                    className="px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all duration-200 flex-shrink-0"
                    style={{
                      backgroundColor: isTagActive
                        ? "rgba(0, 229, 255, 0.12)"
                        : "rgba(255, 255, 255, 0.03)",
                      color: isTagActive ? "#00E5FF" : "rgba(136, 136, 136, 0.6)",
                      border: isTagActive
                        ? "1px solid rgba(0, 229, 255, 0.3)"
                        : "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    {sub.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
       *  GRID DE ENTIDADES (Filtrado + Animación)
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
                {activeCategory === "ALL"
                  ? "Entidades en Tendencia"
                  : `${activeCategoryData?.label || "Resultados"}${activeTag ? ` · ${activeTag}` : ""}`}
              </h2>
              <span className="text-[9px] font-mono text-foreground-muted">
                ({filteredEntities.length})
              </span>
            </div>
            <a
              href="/entities"
              className="text-[10px] uppercase tracking-wider font-mono hover:text-beacon-gold transition-colors"
              style={{ color: "#00E5FF" }}
            >
              Ver todas →
            </a>
          </div>

          {/* Estado de carga: amigos bits filtrando */}
          {isFiltering && (
            <div className="flex items-center justify-center py-12 gap-3">
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{
                  backgroundColor: "#00E5FF",
                  boxShadow: "0 0 10px rgba(0, 229, 255, 0.4)",
                }}
              />
              <span
                className="text-xs font-mono uppercase tracking-[0.2em]"
                style={{ color: "#00E5FF" }}
              >
                Amigos bits filtrando la base de datos...
              </span>
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{
                  backgroundColor: "#00E5FF",
                  boxShadow: "0 0 10px rgba(0, 229, 255, 0.4)",
                  animationDelay: "0.5s",
                }}
              />
            </div>
          )}

          {/* Grid con animación de desvanecimiento */}
          {!isFiltering && (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 transition-all duration-500"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "scale(1)" : "scale(0.97)",
              }}
            >
              {filteredEntities.map((entity, idx) => (
                <div
                  key={entity.id}
                  style={{
                    animationDelay: `${idx * 60}ms`,
                    animation: isVisible
                      ? `fadeInUp 0.4s ease-out ${idx * 60}ms both`
                      : "none",
                  }}
                >
                  <EntityCard entity={entity} />
                </div>
              ))}
            </div>
          )}

          {/* Sin resultados */}
          {!isFiltering && filteredEntities.length === 0 && (
            <div className="text-center py-16">
              <p className="text-foreground-muted text-sm">
                No se encontraron entidades
              </p>
              <p className="text-[10px] text-foreground-muted mt-1 font-mono">
                Prueba con otra categoría o limpia los filtros
              </p>
            </div>
          )}
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
