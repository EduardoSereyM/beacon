/**
 * BEACON PROTOCOL — Entity Profile Page (Perfil de Entidad)
 * ===========================================================
 * Ruta dinámica: /entities/[id]
 *
 * Arquitectura visual:
 *   1. Cabecera de Autoridad: degradado #0A0A0A → #8A2BE2
 *   2. Truth Meter: integrity_index circular (#39FF14)
 *   3. Evaluación Multidimensional: sliders por entity_type
 *   4. Botón de Veredicto: diferenciado por rango
 *   5. Botón Admin: "Generar Reporte de Verdad de Mercado"
 *
 * "Cada perfil es un juicio visual. La integridad se ve."
 */

"use client";

import { use, useState } from "react";
import TruthMeter from "@/components/status/TruthMeter";
import VerdictButton from "@/components/status/VerdictButton";
import usePermissions from "@/hooks/usePermissions";

type EntityType = "POLITICO" | "PERSONA_PUBLICA" | "COMPANY" | "EVENT" | "POLL";
type UserRank = "DISPLACED" | "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

/** Sliders por tipo de entidad */
const SLIDERS_BY_TYPE: Record<EntityType, { key: string; label: string; icon: string }[]> = {
    POLITICO: [
        { key: "transparencia", label: "Transparencia", icon: "⚖️" },
        { key: "gestion", label: "Gestión", icon: "📊" },
        { key: "coherencia", label: "Coherencia", icon: "✅" },
    ],
    PERSONA_PUBLICA: [
        { key: "probidad", label: "Probidad", icon: "💎" },
        { key: "confianza", label: "Confianza", icon: "🤝" },
        { key: "influencia", label: "Influencia", icon: "⭐" },
    ],
    COMPANY: [
        { key: "servicio_cliente", label: "Servicio al Cliente", icon: "🎧" },
        { key: "etica_corporativa", label: "Ética Corporativa", icon: "🏛️" },
        { key: "calidad_producto", label: "Calidad de Producto", icon: "⭐" },
        { key: "transparencia", label: "Transparencia", icon: "🔍" },
    ],
    EVENT: [
        { key: "organizacion", label: "Organización", icon: "📋" },
        { key: "experiencia", label: "Experiencia", icon: "🎪" },
        { key: "seguridad", label: "Seguridad", icon: "🛡️" },
    ],
    POLL: [
        { key: "relevancia", label: "Relevancia", icon: "📌" },
        { key: "claridad", label: "Claridad", icon: "💡" },
    ],
};

/** Demo: entidad de ejemplo (en producción vendrá del backend) */
const DEMO_ENTITY = {
    id: "e-001",
    name: "Gabriel Boric",
    entity_type: "POLITICO" as EntityType,
    metadata: {
        role: "Presidente de la República de Chile",
        party: "Convergencia Social",
        bio: "Abogado y político. Presidente desde 2022.",
        sector: "",
    },
    service_tags: [] as string[],
    reputation_score: 3.72,
    integrity_index: 78,
    total_reviews: 1842,
    is_verified: true,
};

/** Demo: rango del usuario actual */
const DEMO_USER_RANK: UserRank = "GOLD";

interface EntityPageProps {
    params: Promise<{ id: string }>;
}

export default function EntityPage({ params }: EntityPageProps) {
    const { id } = use(params);
    const entity = DEMO_ENTITY;
    const { user, permissions, isAuthenticated, openAuthModal } = usePermissions();

    // Rango dinámico desde ACM (en producción vendrá del token JWT)
    const userRank: UserRank = isAuthenticated
        ? (user.rank as UserRank)
        : "DISPLACED";

    /** Indicador de voto local (en producción vendrá del backend via verify_territoriality) */
    const isLocalVote = isAuthenticated && (entity.entity_type === "POLITICO" || entity.entity_type === "PERSONA_PUBLICA");

    /** Estado de los sliders de evaluación */
    const [sliderValues, setSliderValues] = useState<Record<string, number>>(() => {
        const initial: Record<string, number> = {};
        SLIDERS_BY_TYPE[entity.entity_type].forEach((s) => {
            initial[s.key] = 3;
        });
        return initial;
    });

    const handleSliderChange = (key: string, value: number) => {
        setSliderValues((prev) => ({ ...prev, [key]: value }));
    };

    /** Color del score según valor */
    const scoreColor =
        entity.reputation_score >= 4.0
            ? "#39FF14"
            : entity.reputation_score >= 3.0
                ? "#FFD700"
                : "#FF073A";

    /** Labels de rango para veredictos */
    type VerdictType = { label: string; color: string; weight: string };
    const VERDICT_LABELS: Record<UserRank, VerdictType> = {
        DISPLACED: { label: "Pulso Social", color: "#555", weight: "0x" },
        BRONZE: { label: "Voto Estándar", color: "#cd7f32", weight: "1x" },
        SILVER: { label: "Veredicto Certificado", color: "#C0C0C0", weight: "1.5x" },
        GOLD: { label: "Veredicto Magistral", color: "#D4AF37", weight: "2.5x" },
        DIAMOND: { label: "Sentencia Suprema", color: "#b9f2ff", weight: "5x" },
    };

    return (
        <div className="min-h-screen">
            {/* ═══════════════════════════════════════════
       *  CABECERA DE AUTORIDAD
       *  Degradado #0A0A0A → #8A2BE2 (Púrpura Élite)
       * ═══════════════════════════════════════════ */}
            <section
                className="relative px-6 pt-10 pb-16 overflow-hidden"
                style={{
                    background:
                        "linear-gradient(180deg, rgba(138, 43, 226, 0.08) 0%, rgba(10, 10, 10, 1) 60%)",
                }}
            >
                {/* Glow sutil púrpura arriba */}
                <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] pointer-events-none"
                    style={{
                        background:
                            "radial-gradient(ellipse at center, rgba(138, 43, 226, 0.12) 0%, transparent 70%)",
                    }}
                />

                <div className="max-w-4xl mx-auto relative z-10">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-3 mb-8">
                        <a
                            href="/"
                            className="text-foreground-muted hover:text-foreground text-xs font-mono transition-colors"
                        >
                            ← Inicio
                        </a>
                        <span className="text-foreground-muted text-xs">/</span>
                        <a
                            href="/entities"
                            className="text-foreground-muted hover:text-foreground text-xs font-mono transition-colors"
                        >
                            Entidades
                        </a>
                        <span className="text-foreground-muted text-xs">/</span>
                        <span className="text-xs font-mono" style={{ color: "#8A2BE2" }}>
                            {entity.name}
                        </span>
                    </div>

                    {/* Header de Entidad */}
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                        {/* Avatar */}
                        <div
                            className="w-20 h-20 rounded-2xl flex items-center justify-center neon-gold flex-shrink-0"
                            style={{
                                background: "linear-gradient(135deg, #D4AF37, #f5d374)",
                            }}
                        >
                            <span className="text-3xl">
                                {entity.entity_type === "POLITICO" ? "⚖️" : entity.entity_type === "PERSONA_PUBLICA" ? "👤" : entity.entity_type === "COMPANY" ? "🏢" : "🎪"}
                            </span>
                        </div>

                        <div className="flex-1">
                            {/* Nombre */}
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
                                    {entity.name}
                                </h1>
                                {entity.is_verified && (
                                    <span
                                        className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                                        style={{
                                            backgroundColor: "rgba(212, 175, 55, 0.15)",
                                            color: "#D4AF37",
                                            border: "1px solid rgba(212, 175, 55, 0.3)",
                                        }}
                                    >
                                        ✓ Verificado
                                    </span>
                                )}
                            </div>

                            {/* Tipo y metadata */}
                            <p className="text-sm text-foreground-muted mb-2">
                                {entity.metadata.role || entity.metadata.sector}
                                {entity.metadata.party && (
                                    <span className="text-foreground-muted">
                                        {" "}
                                        · {entity.metadata.party}
                                    </span>
                                )}
                            </p>

                            {/* Badges: entity_type + service_tags */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span
                                    className="text-[9px] px-2 py-0.5 rounded uppercase tracking-wider font-bold"
                                    style={{
                                        backgroundColor: "rgba(192, 192, 192, 0.1)",
                                        color: "#C0C0C0",
                                        border: "1px solid rgba(192, 192, 192, 0.2)",
                                    }}
                                >
                                    {entity.entity_type}
                                </span>
                                {entity.service_tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="text-[9px] px-2 py-0.5 rounded uppercase tracking-wider"
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
                        </div>

                        {/* Score rápido */}
                        <div className="text-right flex-shrink-0">
                            <span
                                className="text-4xl font-mono score-display font-black"
                                style={{ color: scoreColor }}
                            >
                                {entity.reputation_score.toFixed(2)}
                            </span>
                            <p className="text-[10px] text-foreground-muted font-mono mt-1">
                                {entity.total_reviews.toLocaleString()} veredictos
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════
       *  TRUTH METER + MÉTRICAS CORE
       * ═══════════════════════════════════════════ */}
            <section className="px-6 -mt-8">
                <div className="max-w-4xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Truth Meter (columna central) */}
                        <div className="glass rounded-xl p-6 flex justify-center md:order-2">
                            <TruthMeter value={entity.integrity_index} size={180} />
                        </div>

                        {/* Métricas izquierda */}
                        <div className="space-y-4 md:order-1">
                            <div className="glass rounded-xl p-5">
                                <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-1">
                                    Reputation Score
                                </p>
                                <div className="flex items-end gap-2">
                                    <span
                                        className="text-3xl font-mono score-display font-bold"
                                        style={{ color: scoreColor }}
                                    >
                                        {entity.reputation_score.toFixed(2)}
                                    </span>
                                    <span className="text-xs text-foreground-muted mb-1">/ 5.00</span>
                                </div>
                                <p className="text-[9px] text-foreground-muted mt-1 font-mono">
                                    BAYESIAN · m=30 · C=3.0
                                </p>
                            </div>

                            <div className="glass rounded-xl p-5">
                                <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-1">
                                    Total Veredictos
                                </p>
                                <span
                                    className="text-3xl font-mono score-display font-bold"
                                    style={{ color: "#00E5FF" }}
                                >
                                    {entity.total_reviews.toLocaleString()}
                                </span>
                                <p className="text-[9px] text-foreground-muted mt-1 font-mono">
                                    FACTOR VOLUMEN · √(N/100)
                                </p>
                            </div>
                        </div>

                        {/* Tabla de impacto por rango (derecha) */}
                        <div className="glass rounded-xl p-5 md:order-3">
                            <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-3">
                                Impacto por Rango
                            </p>
                            <div className="space-y-2">
                                {(["GOLD", "SILVER", "BRONZE", "DISPLACED"] as UserRank[]).map(
                                    (r) => {
                                        const v = VERDICT_LABELS[r];
                                        const isCurrentRank = r === userRank;
                                        return (
                                            <div
                                                key={r}
                                                className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all ${isCurrentRank ? "ring-1" : ""
                                                    }`}
                                                style={{
                                                    backgroundColor: isCurrentRank
                                                        ? `${v.color}10`
                                                        : "transparent",
                                                    border: isCurrentRank ? `1px solid ${v.color}40` : "none",
                                                }}
                                            >
                                                <div>
                                                    <p
                                                        className="text-[10px] font-bold uppercase tracking-wider"
                                                        style={{ color: v.color }}
                                                    >
                                                        {r}
                                                    </p>
                                                    <p className="text-[9px] text-foreground-muted">
                                                        {v.label}
                                                    </p>
                                                </div>
                                                <span
                                                    className="text-xs font-mono score-display font-bold"
                                                    style={{ color: v.color }}
                                                >
                                                    {v.weight}
                                                </span>
                                            </div>
                                        );
                                    }
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════
       *  EVALUACIÓN MULTIDIMENSIONAL
       *  Sliders dinámicos por entity_type
       * ═══════════════════════════════════════════ */}
            <section className="px-6 py-10">
                <div className="max-w-4xl mx-auto">
                    <div className="glass rounded-xl p-6 relative">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                                    Evaluación Multidimensional
                                </h2>
                                <p className="text-[10px] text-foreground-muted mt-0.5">
                                    Desliza cada criterio para emitir tu veredicto con precisión
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {isLocalVote && (
                                    <span
                                        className="text-[9px] px-2 py-1 rounded font-mono uppercase tracking-wider flex items-center gap-1"
                                        style={{
                                            backgroundColor: "rgba(212, 175, 55, 0.15)",
                                            color: "#D4AF37",
                                            border: "1px solid rgba(212, 175, 55, 0.3)",
                                        }}
                                    >
                                        📍 Voto Local · 1.5x
                                    </span>
                                )}
                                <span
                                    className="text-[9px] px-2 py-1 rounded font-mono uppercase tracking-wider"
                                    style={{
                                        backgroundColor: `${VERDICT_LABELS[userRank].color}15`,
                                        color: VERDICT_LABELS[userRank].color,
                                    }}
                                >
                                    Tu rango: {userRank}
                                </span>
                            </div>
                        </div>

                        {/* Sliders */}
                        <div className="space-y-5">
                            {SLIDERS_BY_TYPE[entity.entity_type].map((slider) => (
                                <div key={slider.key}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">{slider.icon}</span>
                                            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                                {slider.label}
                                            </label>
                                        </div>
                                        <span
                                            className="text-sm font-mono score-display font-bold"
                                            style={{
                                                color:
                                                    sliderValues[slider.key] >= 4
                                                        ? "#39FF14"
                                                        : sliderValues[slider.key] >= 3
                                                            ? "#FFD700"
                                                            : "#FF073A",
                                            }}
                                        >
                                            {sliderValues[slider.key].toFixed(1)}
                                        </span>
                                    </div>

                                    {/* Slider custom */}
                                    <div className="relative">
                                        <input
                                            type="range"
                                            min="0"
                                            max="5"
                                            step="0.1"
                                            value={sliderValues[slider.key]}
                                            onChange={(e) =>
                                                handleSliderChange(slider.key, parseFloat(e.target.value))
                                            }
                                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                                            style={{
                                                background: `linear-gradient(to right, #FF073A 0%, #FFD700 50%, #39FF14 100%)`,
                                                accentColor: "#D4AF37",
                                            }}
                                        />
                                        {/* Marcadores 1-5 */}
                                        <div className="flex justify-between mt-1">
                                            {[1, 2, 3, 4, 5].map((n) => (
                                                <span
                                                    key={n}
                                                    className="text-[8px] text-foreground-muted font-mono"
                                                >
                                                    {n}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ── ACM: Overlay de bloqueo para anónimos ── */}
                        {!permissions.evaluate && (
                            <div
                                className="absolute inset-0 z-20 rounded-xl flex items-center justify-center cursor-pointer"
                                onClick={openAuthModal}
                                style={{
                                    background: "rgba(10, 10, 10, 0.6)",
                                    backdropFilter: "blur(6px)",
                                    WebkitBackdropFilter: "blur(6px)",
                                }}
                            >
                                <div className="text-center">
                                    <div
                                        className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                                        style={{
                                            background: "linear-gradient(135deg, #D4AF37, #8A2BE2)",
                                            boxShadow: "0 0 20px rgba(212, 175, 55, 0.3)",
                                        }}
                                    >
                                        <span className="text-lg">🔒</span>
                                    </div>
                                    <p className="text-xs font-bold text-white tracking-wide">
                                        Tu voz requiere identidad
                                    </p>
                                    <p className="text-[9px] text-gray-400 mt-1 font-mono">
                                        Regístrate para evaluar
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Resumen promedio */}
                        <div className="mt-6 pt-4 border-t border-beacon-border flex items-center justify-between">
                            <span className="text-[10px] text-foreground-muted uppercase tracking-wider">
                                Tu Veredicto Promedio
                            </span>
                            <span
                                className="text-lg font-mono score-display font-bold"
                                style={{
                                    color: (() => {
                                        const avg =
                                            Object.values(sliderValues).reduce((a, b) => a + b, 0) /
                                            Object.values(sliderValues).length;
                                        return avg >= 4 ? "#39FF14" : avg >= 3 ? "#FFD700" : "#FF073A";
                                    })(),
                                }}
                            >
                                {(
                                    Object.values(sliderValues).reduce((a, b) => a + b, 0) /
                                    Object.values(sliderValues).length
                                ).toFixed(2)}
                            </span>
                        </div>
                    </div>

                    {/* ─── Botón de Veredicto ─── */}
                    <div className="mt-6">
                        <VerdictButton
                            rank={userRank}
                            entityName={entity.name}
                            onVerdict={() => {
                                console.log("Veredicto emitido:", {
                                    entity_id: id,
                                    rank: userRank,
                                    scores: sliderValues,
                                    average:
                                        Object.values(sliderValues).reduce((a, b) => a + b, 0) /
                                        Object.values(sliderValues).length,
                                });
                            }}
                        />
                    </div>

                    {/* ─── Botón Admin Oculto: Reporte de Verdad de Mercado ─── */}
                    <div className="mt-4">
                        <button
                            className="w-full py-3 px-6 rounded-lg text-[10px] font-mono uppercase tracking-[0.2em] transition-all opacity-30 hover:opacity-100"
                            style={{
                                border: "1px dashed rgba(138, 43, 226, 0.2)",
                                color: "#8A2BE2",
                                backgroundColor: "rgba(138, 43, 226, 0.03)",
                            }}
                            onClick={() => {
                                console.log(
                                    "📊 Generando Reporte de Verdad de Mercado para:",
                                    entity.name
                                );
                            }}
                        >
                            🔮 Generar Reporte de Verdad de Mercado — Overlord Only
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}
