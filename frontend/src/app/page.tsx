/**
 * BEACON PROTOCOL — Index Page con Buscador de Integridad
 * ========================================================
 * Hero Section + Buscador Dinámico + Filtros DISTINCT
 * + Tabs de Poder + Grid filtrado con datos reales
 *
 * Datos sincronizados con la tabla 'entities' de Supabase:
 *   first_name, last_name, position, region, party
 *
 * Filtros dinámicos cargados via GET /entities/filters (DISTINCT)
 * Se auto-actualizan al cargar nuevas entidades en la BBDD.
 *
 * "La primera impresión es el primer juicio. Hazle sentir el poder."
 */

"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import EntityCard from "@/components/status/EntityCard";

/** URL de la API del Búnker */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type EntityType = "POLITICO" | "PERSONA_PUBLICA" | "COMPANY" | "EVENT" | "POLL";

/** Categorías principales */
const CATEGORIES: {
  key: EntityType | "ALL";
  label: string;
  icon: string;
  dbCategory?: string; // mapeo a la BBDD
}[] = [
    { key: "ALL", label: "Todas", icon: "🌐" },
    { key: "POLITICO", label: "Política", icon: "⚖️", dbCategory: "politico" },
    { key: "PERSONA_PUBLICA", label: "Personajes Públicos", icon: "👤", dbCategory: "periodista" },
    { key: "COMPANY", label: "Empresas", icon: "🏢", dbCategory: "empresario" },
    { key: "EVENT", label: "Eventos Live", icon: "🎪" },
    { key: "POLL", label: "Encuestas Élite", icon: "📊" },
  ];

/** Interfaz sincronizada con la tabla 'entities' de Supabase */
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
  official_links?: Record<string, unknown>;
  reputation_score: number;
  total_reviews: number;
  is_verified: boolean;
  rank: "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";
  integrity_index: number;
  service_tags?: string[];
}

/** Estilos de los selectores glassmorphism */
const selectStyle: React.CSSProperties = {
  backgroundColor: "rgba(255, 255, 255, 0.03)",
  color: "#aaa",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "8px",
  padding: "6px 10px",
  fontSize: "11px",
  fontFamily: "'JetBrains Mono', monospace",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  outline: "none",
  cursor: "pointer",
  minWidth: "140px",
};

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ─── Estado del Buscador ───
  const [searchQuery, setSearchQuery] = useState("");
  const [searchGlow, setSearchGlow] = useState(false);

  // ─── Entidades desde la API ───
  const [allEntities, setAllEntities] = useState<BackendEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);

  // ─── Filtros DISTINCT (cargados de la BBDD) ───
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);
  const [availableParties, setAvailableParties] = useState<string[]>([]);
  const [filterRegion, setFilterRegion] = useState("");
  const [filterParty, setFilterParty] = useState("");

  // ─── Category Switcher ───
  const [activeCategory, setActiveCategory] = useState<EntityType | "ALL">(
    (searchParams.get("category") as EntityType | "ALL") || "ALL"
  );
  const [isFiltering, setIsFiltering] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // ─── Cargar filtros DISTINCT desde la BBDD (1 sola vez) ───
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/entities/filters`);
        if (res.ok) {
          const data = await res.json();
          setAvailableRegions(data.regions || []);
          setAvailableParties(data.parties || []);
        }
      } catch (err) {
        console.error("Error cargando filtros:", err);
      }
    };
    loadFilters();
  }, []);

  // ─── Fetch entidades desde el backend ───
  useEffect(() => {
    const fetchEntities = async () => {
      try {
        setLoadingEntities(true);

        const catData = CATEGORIES.find(c => c.key === activeCategory);
        const params = new URLSearchParams();
        params.set("limit", "200");

        if (catData?.dbCategory) {
          params.set("category", catData.dbCategory);
        }

        const res = await fetch(`${API_URL}/api/v1/entities?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setAllEntities(data.entities || []);
        } else {
          console.error("Error fetching entities:", res.status);
          setAllEntities([]);
        }
      } catch (err) {
        console.error("Error de conexión con el Búnker:", err);
        setAllEntities([]);
      } finally {
        setLoadingEntities(false);
      }
    };
    fetchEntities();
  }, [activeCategory]);

  /** Categoría activa */
  const activeCategoryData = CATEGORIES.find((c) => c.key === activeCategory);

  /** Detecta humano escribiendo */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setSearchGlow(value.length > 3);
  };

  /** Cambia la categoría con animación */
  const handleCategoryChange = useCallback(
    (category: EntityType | "ALL") => {
      if (category === activeCategory) return;
      setIsVisible(false);
      setIsFiltering(true);
      // Reset filtros al cambiar categoría
      setFilterRegion("");
      setFilterParty("");
      setSearchQuery("");

      setTimeout(() => {
        setActiveCategory(category);
        const params = new URLSearchParams();
        if (category !== "ALL") params.set("category", category);
        const url = params.toString() ? `?${params.toString()}` : "/";
        router.push(url, { scroll: false });

        setTimeout(() => {
          setIsFiltering(false);
          setIsVisible(true);
        }, 400);
      }, 250);
    },
    [activeCategory, router]
  );

  /** Filtrado de entidades en cliente (instantáneo) */
  const filteredEntities = useMemo(() => {
    let results = allEntities;

    // Filtro por región (desde selector DISTINCT)
    if (filterRegion) {
      results = results.filter(
        (e) => e.region === filterRegion
      );
    }

    // Filtro por partido (desde selector DISTINCT)
    if (filterParty) {
      results = results.filter(
        (e) => e.party && e.party.toLowerCase().includes(filterParty.toLowerCase())
      );
    }

    // Filtro por búsqueda de texto (first_name / last_name)
    if (searchQuery.length > 1) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (e) =>
          e.first_name.toLowerCase().includes(q) ||
          e.last_name.toLowerCase().includes(q) ||
          (e.position || "").toLowerCase().includes(q)
      );
    }

    return results;
  }, [allEntities, filterRegion, filterParty, searchQuery]);

  // Sincronizar URL params al cargar
  useEffect(() => {
    const cat = searchParams.get("category") as EntityType | null;
    if (cat) setActiveCategory(cat);
  }, [searchParams]);

  /** Resetear todos los filtros */
  const clearAllFilters = () => {
    setFilterRegion("");
    setFilterParty("");
    setSearchQuery("");
    setSearchGlow(false);
  };

  const hasActiveFilters = filterRegion || filterParty || searchQuery.length > 1;

  return (
    <div className="min-h-screen">
      {/* ═══════════════════════════════════════════
       *  HERO SECTION
       * ═══════════════════════════════════════════ */}
      <section className="relative pt-20 pb-16 px-6 overflow-hidden">
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
                placeholder="Busca por nombre, apellido o cargo..."
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
              Búsqueda por{" "}
              <span style={{ color: "#D4AF37" }}>first_name, last_name, position</span> ·{" "}
              {allEntities.length} entidades en la BBDD
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
       *  UNIVERSAL CATEGORY SWITCHER
       * ═══════════════════════════════════════════ */}
      <section className="px-6 pb-4">
        <div className="max-w-7xl mx-auto">
          {/* ─── Tabs Principales ─── */}
          <div className="relative">
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

            {/* Glow dorado */}
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

          {/* ─── Filtros Dinámicos (Región + Partido desde DISTINCT) ─── */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <span className="text-[9px] text-foreground-muted uppercase tracking-wider font-mono flex-shrink-0">
              Filtros:
            </span>

            {/* Selector de Región (DISTINCT) */}
            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              style={selectStyle}
            >
              <option value="">Todas las regiones</option>
              {availableRegions.map((r) => (
                <option key={r} value={r}>{r.replace("Región de ", "").replace("Región del ", "").replace("Región ", "")}</option>
              ))}
            </select>

            {/* Selector de Partido (DISTINCT) */}
            <select
              value={filterParty}
              onChange={(e) => setFilterParty(e.target.value)}
              style={selectStyle}
            >
              <option value="">Todos los partidos</option>
              {availableParties.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* Botón limpiar filtros */}
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-[9px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all duration-200"
                style={{
                  backgroundColor: "rgba(255, 7, 58, 0.08)",
                  color: "#FF073A",
                  border: "1px solid rgba(255, 7, 58, 0.2)",
                }}
              >
                ✕ Limpiar
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
       *  GRID DE ENTIDADES
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
                  : `${activeCategoryData?.label || "Resultados"}`}
                {hasActiveFilters && " · Filtrado"}
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

          {/* Estado de carga */}
          {(loadingEntities || isFiltering) && (
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
                {loadingEntities ? "Conectando con el Búnker..." : "Amigos bits filtrando..."}
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

          {/* Grid */}
          {!isFiltering && !loadingEntities && (
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
                    animationDelay: `${idx * 40}ms`,
                    animation: isVisible
                      ? `fadeInUp 0.4s ease-out ${idx * 40}ms both`
                      : "none",
                  }}
                >
                  <EntityCard entity={entity} />
                </div>
              ))}
            </div>
          )}

          {/* Sin resultados */}
          {!isFiltering && !loadingEntities && filteredEntities.length === 0 && (
            <div className="text-center py-16">
              <p className="text-foreground-muted text-sm">
                No se encontraron entidades
              </p>
              <p className="text-[10px] text-foreground-muted mt-1 font-mono">
                Prueba con otra categoría o limpia los filtros
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="mt-4 text-xs font-mono uppercase tracking-wider px-4 py-2 rounded-lg transition-all"
                  style={{
                    backgroundColor: "rgba(0, 229, 255, 0.08)",
                    color: "#00E5FF",
                    border: "1px solid rgba(0, 229, 255, 0.2)",
                  }}
                >
                  Limpiar todos los filtros
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
       *  STATS FOOTER
       * ═══════════════════════════════════════════ */}
      <section className="border-t border-beacon-border px-6 py-8">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: "Ciudadanos Activos", value: "1,646", color: "#D4AF37" },
            { label: "Entidades en BBDD", value: allEntities.length.toString(), color: "#00E5FF" },
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

/** Wrapper con Suspense */
export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div
              className="w-8 h-8 rounded-lg mx-auto mb-3 animate-pulse"
              style={{ background: "linear-gradient(135deg, #D4AF37, #8A2BE2)" }}
            />
            <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#00E5FF" }}>
              Cargando el búnker...
            </p>
          </div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
