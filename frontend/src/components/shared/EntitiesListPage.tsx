/**
 * BEACON PROTOCOL — EntitiesListPage (Componente Compartido)
 * ===========================================================
 * Lista de entidades con búsqueda por nombre y filtro por categoría.
 * Reutilizado por /entities, /politicos, /empresas, /personajes, /eventos.
 *
 * "El que no puede ser buscado, no puede ser juzgado."
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

type CategoryTab = "" | "politico" | "empresario" | "periodista" | "evento";

const CATEGORY_TABS: { key: CategoryTab; label: string; icon: string; color: string }[] = [
  { key: "",           label: "Todos",      icon: "🌐", color: "#00E5FF" },
  { key: "politico",   label: "Políticos",  icon: "⚖️", color: "#D4AF37" },
  { key: "empresario", label: "Empresas",   icon: "🏢", color: "#00E5FF" },
  { key: "periodista", label: "Personajes", icon: "👤", color: "#C0C0C0" },
  { key: "evento",     label: "Eventos",    icon: "📅", color: "#8A2BE2" },
];

interface InitialData {
  entities: BackendEntity[];
  total: number;
}

interface EntitiesListPageProps {
  defaultCategory?: CategoryTab;
  title: string;
  subtitle: string;
  /** Datos pre-cargados server-side (Server Component híbrido). Elimina el flicker inicial. */
  initialData?: InitialData;
}

export default function EntitiesListPage({
  defaultCategory = "",
  title,
  subtitle,
  initialData,
}: EntitiesListPageProps) {
  // Si hay initialData del server, arrancamos con datos (cero flicker)
  const [entities, setEntities] = useState<BackendEntity[]>(initialData?.entities ?? []);
  const [loading, setLoading] = useState(!initialData);
  // Ref para saltear el fetch de montaje cuando ya tenemos initialData
  const skipInitialFetch = useRef(!!initialData);

  // Filter state
  const [category, setCategory] = useState<CategoryTab>(defaultCategory);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [offset, setOffset] = useState(0);
  const LIMIT = 24;

  // Fetch entities when filters change
  const fetchEntities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (category) params.set("category", category);
      if (search) params.set("search", search);

      const res = await fetch(`${API_URL}/api/v1/entities?${params.toString()}`);
      if (!res.ok) {
        setEntities([]);
        setTotal(0);
        return;
      }
      const data = await res.json();
      setEntities(data.entities || []);
      setTotal(data.total || 0);
    } catch {
      setEntities([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [category, search, offset]);

  useEffect(() => {
    // Si tenemos datos del servidor (initialData), saltamos el primer fetch.
    // En cuanto el usuario cambie un filtro, skipInitialFetch ya es false → fetcha.
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    fetchEntities();
  }, [fetchEntities]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [category, search]);

  // Search handlers
  const handleSearch = () => setSearch(searchInput.trim());
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const clearFilters = () => {
    if (!defaultCategory) setCategory("");
    setSearch("");
    setSearchInput("");
  };

  const hasActiveFilters = search || (!defaultCategory && category);

  return (
    <div className="min-h-screen pt-20 pb-12 px-6">
      <div className="max-w-7xl mx-auto">

        {/* ═══ Header ═══ */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            <span className="text-foreground">{title}</span>
          </h1>
          <p className="text-sm text-foreground-muted mt-2 max-w-lg">{subtitle}</p>
        </div>

        {/* ═══ Category Tabs (solo si no hay categoría fija) ═══ */}
        {!defaultCategory && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setCategory(tab.key)}
                className="px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-wider transition-all duration-200"
                style={{
                  backgroundColor:
                    category === tab.key ? `${tab.color}20` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${category === tab.key ? `${tab.color}50` : "rgba(255,255,255,0.06)"}`,
                  color: category === tab.key ? tab.color : "rgba(255,255,255,0.5)",
                }}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ═══ Search Bar ═══ */}
        <div
          className="flex flex-wrap items-center gap-3 mb-8 p-4 rounded-xl"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm text-foreground placeholder-foreground-muted px-3 py-2 rounded-lg outline-none font-mono"
              style={{ border: "1px solid rgba(0,229,255,0.2)" }}
            />
            <button
              onClick={handleSearch}
              className="px-3 py-2 rounded-lg text-xs font-mono uppercase transition-all hover:scale-105"
              style={{
                backgroundColor: "rgba(0,229,255,0.1)",
                border: "1px solid rgba(0,229,255,0.3)",
                color: "#00E5FF",
              }}
            >
              Buscar
            </button>
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-[10px] font-mono uppercase tracking-wider px-3 py-2 rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor: "rgba(255,7,58,0.08)",
                border: "1px solid rgba(255,7,58,0.25)",
                color: "#FF073A",
              }}
            >
              Limpiar
            </button>
          )}
        </div>

        {/* ═══ Results Count ═══ */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: "#39FF14",
                boxShadow: "0 0 6px rgba(57,255,20,0.5)",
              }}
            />
            <span className="text-xs text-foreground-muted font-mono uppercase tracking-wider">
              {loading ? "Cargando..." : `${total} entidades encontradas`}
            </span>
          </div>
          {total > LIMIT && (
            <span className="text-[10px] text-foreground-muted font-mono">
              Mostrando {offset + 1}–{Math.min(offset + LIMIT, total)} de {total}
            </span>
          )}
        </div>

        {/* ═══ Entity Grid ═══ */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl p-5 animate-pulse"
                style={{
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  height: "180px",
                }}
              />
            ))}
          </div>
        ) : entities.length === 0 ? (
          <div
            className="text-center py-16 rounded-xl"
            style={{
              backgroundColor: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p className="text-2xl mb-3">🔍</p>
            <p className="text-sm text-foreground-muted font-mono">
              No se encontraron entidades con estos filtros
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 text-[11px] font-mono uppercase tracking-wider px-4 py-2 rounded-lg transition-all hover:scale-105"
                style={{
                  backgroundColor: "rgba(0,229,255,0.08)",
                  border: "1px solid rgba(0,229,255,0.25)",
                  color: "#00E5FF",
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {entities.map((entity, idx) => (
              <div
                key={entity.id}
                style={{
                  animation: `fadeInUp 0.4s ease-out ${idx * 30}ms both`,
                }}
              >
                <EntityCard entity={entity} />
              </div>
            ))}
          </div>
        )}

        {/* ═══ Pagination ═══ */}
        {total > LIMIT && !loading && (
          <div className="flex items-center justify-center gap-4 mt-10">
            <button
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              disabled={offset === 0}
              className="px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-30"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#00E5FF",
              }}
            >
              ← Anterior
            </button>
            <span className="text-[10px] font-mono text-foreground-muted">
              Página {Math.floor(offset / LIMIT) + 1} de {Math.ceil(total / LIMIT)}
            </span>
            <button
              onClick={() => setOffset(offset + LIMIT)}
              disabled={offset + LIMIT >= total}
              className="px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-30"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#00E5FF",
              }}
            >
              Siguiente →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
