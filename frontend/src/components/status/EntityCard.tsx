/**
 * BEACON PROTOCOL — EntityCard (Tarjeta de Entidad)
 * ===================================================
 * Componente reutilizable que muestra una entidad evaluada.
 * Usa los campos EXACTOS de la tabla 'entities' de Supabase.
 *
 * Mapeo BBDD → UI:
 *   first_name + last_name → Nombre mostrado
 *   position               → Subtítulo (ej: "Senador")
 *   party                  → Badge de partido
 *   region                 → Tooltip territorial
 *
 * "Cada card es una sentencia visual. El brillo no miente."
 */

"use client";

import { useState } from "react";

type EntityType = "POLITICO" | "PERSONA_PUBLICA" | "COMPANY" | "EVENT" | "POLL";
type RankType = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

/** Interface sincronizada con la tabla 'entities' de Supabase */
interface EntityData {
    id: string;
    first_name: string;
    last_name: string;
    second_last_name?: string;
    category: string;
    position?: string;
    region?: string;
    district?: string;
    bio?: string;
    photo_path?: string;
    official_links?: Record<string, unknown>;
    party?: string;
    email?: string;
    // Campos calculados por el motor
    type?: EntityType;
    service_tags?: string[];
    reputation_score: number;
    total_reviews: number;
    is_verified: boolean;
    rank: RankType;
    integrity_index: number;
}

/** Configuración visual por rango */
const RANK_STYLES: Record<
    RankType,
    { borderColor: string; glowClass: string; neonClass: string; label: string; emoji: string }
> = {
    DIAMOND: {
        borderColor: "#b9f2ff",
        glowClass: "glow-cyan",
        neonClass: "neon-diamond",
        label: "DIAMOND",
        emoji: "💎",
    },
    GOLD: {
        borderColor: "#D4AF37",
        glowClass: "glow-gold",
        neonClass: "neon-gold",
        label: "GOLD",
        emoji: "🥇",
    },
    SILVER: {
        borderColor: "#C0C0C0",
        glowClass: "",
        neonClass: "",
        label: "SILVER",
        emoji: "🥈",
    },
    BRONZE: {
        borderColor: "#cd7f32",
        glowClass: "",
        neonClass: "",
        label: "BRONZE",
        emoji: "🥉",
    },
};

/** Mapeo de category (BBDD) → tipo visual */
const CATEGORY_MAP: Record<string, { type: EntityType; label: string; icon: string; color: string }> = {
    politico: { type: "POLITICO", label: "Político", icon: "⚖️", color: "#D4AF37" },
    periodista: { type: "PERSONA_PUBLICA", label: "Persona", icon: "👤", color: "#C0C0C0" },
    empresario: { type: "COMPANY", label: "Empresa", icon: "🏢", color: "#00E5FF" },
};

/** Fallback para tipos de entidad */
const TYPE_FALLBACK = { type: "POLITICO" as EntityType, label: "Político", icon: "⚖️", color: "#D4AF37" };

interface EntityCardProps {
    entity: EntityData;
}

export default function EntityCard({ entity }: EntityCardProps) {
    const [isHovered, setIsHovered] = useState(false);
    const rankStyle = RANK_STYLES[entity.rank] || RANK_STYLES.BRONZE;

    // Resolver tipo visual desde la categoría de BBDD
    const cat = (entity.category || "politico").toLowerCase();
    const typeConfig = CATEGORY_MAP[cat] || TYPE_FALLBACK;
    const entityType = entity.type || typeConfig.type;

    // Nombre completo desde campos de BBDD
    const displayName = [entity.first_name, entity.last_name]
        .filter(Boolean)
        .join(" ");

    // Subtítulo: position (BBDD) o fallback
    const subtitle = entity.position || typeConfig.label;

    /** Color del score según valor */
    const scoreColor =
        entity.reputation_score >= 4.0
            ? "#39FF14"
            : entity.reputation_score >= 3.0
                ? "#FFD700"
                : "#FF073A";

    /** Porcentaje para la barra de integridad */
    const integrityPct = Math.min(100, Math.max(0, entity.integrity_index));

    return (
        <a
            href={`/${entityType === "EVENT" ? "events" : "entities"}/${entity.id}`}
            className={`block rounded-xl overflow-hidden transition-all duration-300 ${entity.rank === "GOLD" || entity.rank === "DIAMOND"
                ? "elite-card"
                : ""
                }`}
            style={{
                border: `1px solid ${isHovered ? rankStyle.borderColor : `${rankStyle.borderColor}25`
                    }`,
                boxShadow: isHovered
                    ? `0 0 15px ${rankStyle.borderColor}20, 0 4px 20px rgba(0,0,0,0.4)`
                    : "none",
                transform: isHovered ? "translateY(-3px)" : "translateY(0)",
                background: "rgba(17, 17, 17, 0.8)",
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* ─── Header: Avatar + Info ─── */}
            <div className="p-4 pb-3">
                <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                        className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500 ${entity.rank === "GOLD" || entity.rank === "DIAMOND"
                            ? rankStyle.neonClass
                            : ""
                            }`}
                        style={{
                            background: isHovered
                                ? `linear-gradient(135deg, ${rankStyle.borderColor}, ${rankStyle.borderColor}80)`
                                : `${rankStyle.borderColor}15`,
                            filter: isHovered ? "grayscale(0)" : "grayscale(0.5)",
                        }}
                    >
                        <span
                            className="text-lg transition-all duration-300"
                            style={{
                                filter: isHovered ? "brightness(1.2)" : "brightness(0.8)",
                            }}
                        >
                            {typeConfig.icon}
                        </span>
                    </div>

                    {/* Nombre y metadata (campos de BBDD) */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground truncate">
                                {displayName}
                            </h3>
                            {entity.is_verified && (
                                <span title="Verificado por el Protocolo">✓</span>
                            )}
                        </div>

                        {/* Subtítulo: position de la BBDD */}
                        <p className="text-[10px] text-foreground-muted truncate mt-0.5">
                            {subtitle}
                        </p>

                        {/* Tags de tipo + rango + partido */}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span
                                className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-medium"
                                style={{
                                    backgroundColor: `${typeConfig.color}15`,
                                    color: typeConfig.color,
                                }}
                            >
                                {typeConfig.label}
                            </span>
                            <span
                                className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold"
                                style={{
                                    backgroundColor: `${rankStyle.borderColor}20`,
                                    color: rankStyle.borderColor,
                                }}
                            >
                                {rankStyle.emoji} {rankStyle.label}
                            </span>
                            {entity.party && (
                                <span
                                    className="text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                                    style={{
                                        backgroundColor: "rgba(138, 43, 226, 0.12)",
                                        color: "#B388FF",
                                        border: "1px solid rgba(138, 43, 226, 0.2)",
                                    }}
                                >
                                    {entity.party}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Score */}
                    <div className="text-right flex-shrink-0">
                        <span
                            className="text-xl font-mono score-display font-bold"
                            style={{ color: scoreColor }}
                        >
                            {entity.reputation_score.toFixed(2)}
                        </span>
                        <p className="text-[9px] text-foreground-muted font-mono mt-0.5">
                            {entity.total_reviews.toLocaleString()} votos
                        </p>
                    </div>
                </div>

                {/* Service Tags (solo empresas) */}
                {entity.service_tags && entity.service_tags.length > 0 && (
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                        {entity.service_tags.map((tag) => (
                            <span
                                key={tag}
                                className="text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider"
                                style={{
                                    backgroundColor: "rgba(0, 229, 255, 0.08)",
                                    color: "#00E5FF",
                                    border: "1px solid rgba(0, 229, 255, 0.15)",
                                }}
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* ─── Barra de Integridad ─── */}
            <div className="px-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-foreground-muted uppercase tracking-wider">
                        Integrity Index
                    </span>
                    <span
                        className="text-[10px] font-mono score-display font-semibold"
                        style={{ color: "#39FF14" }}
                    >
                        {entity.integrity_index}%
                    </span>
                </div>
                <div className="w-full h-1 rounded-full overflow-hidden bg-beacon-border">
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                            width: `${integrityPct}%`,
                            backgroundColor: "#39FF14",
                            boxShadow: isHovered
                                ? "0 0 8px rgba(57, 255, 20, 0.4)"
                                : "none",
                        }}
                    />
                </div>
            </div>
        </a>
    );
}
