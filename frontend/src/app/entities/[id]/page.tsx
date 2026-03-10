/**
 * BEACON PROTOCOL — Entity Profile Page (Perfil de Entidad)
 * ===========================================================
 * Ruta dinámica: /entities/[id]
 *
 * Carga el perfil real desde el backend usando el id de la URL.
 * Muestra skeleton mientras carga, y mensaje amigable si no se encuentra.
 *
 * "Cada perfil es un juicio visual. La integridad se ve."
 */

"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import TruthMeter from "@/components/status/TruthMeter";
import VerdictButton from "@/components/status/VerdictButton";
import usePermissions from "@/hooks/usePermissions";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type UserRank = "DISPLACED" | "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

/** Mapeo de category (BBDD) → etiqueta visual */
const CATEGORY_META: Record<string, { label: string; icon: string }> = {
    politico:   { label: "Político",         icon: "⚖️" },
    periodista: { label: "Persona Pública",   icon: "👤" },
    empresario: { label: "Empresario",        icon: "💼" },
    empresa:    { label: "Empresa",           icon: "🏢" },
    evento:     { label: "Evento",            icon: "📅" },
};

/** Dimensión de evaluación (viene desde la API) */
interface Dimension {
    id: string;
    key: string;
    label: string;
    icon: string;
    display_order: number;
}

/** Fallback hardcodeado en caso de que el API falle */
const FALLBACK_DIMENSIONS: Record<string, Dimension[]> = {
    politico:   [
        { id: "f1", key: "transparencia", label: "Transparencia", icon: "⚖️", display_order: 1 },
        { id: "f2", key: "gestion",       label: "Gestión",       icon: "📊", display_order: 2 },
        { id: "f3", key: "coherencia",    label: "Coherencia",    icon: "✅", display_order: 3 },
    ],
    periodista: [
        { id: "f4", key: "probidad",    label: "Probidad",    icon: "💎", display_order: 1 },
        { id: "f5", key: "confianza",   label: "Confianza",   icon: "🤝", display_order: 2 },
        { id: "f6", key: "influencia",  label: "Influencia",  icon: "⭐", display_order: 3 },
    ],
    empresario: [
        { id: "f7", key: "probidad",   label: "Probidad",   icon: "💎", display_order: 1 },
        { id: "f8", key: "confianza",  label: "Confianza",  icon: "🤝", display_order: 2 },
        { id: "f9", key: "influencia", label: "Influencia", icon: "⭐", display_order: 3 },
    ],
    empresa: [
        { id: "fa", key: "servicio_cliente",  label: "Servicio al Cliente",  icon: "🎧",  display_order: 1 },
        { id: "fb", key: "etica_corporativa", label: "Ética Corporativa",    icon: "🏛️", display_order: 2 },
        { id: "fc", key: "calidad_producto",  label: "Calidad de Producto",  icon: "⭐",  display_order: 3 },
        { id: "fd", key: "transparencia",     label: "Transparencia",        icon: "🔍",  display_order: 4 },
    ],
    evento: [
        { id: "fe", key: "organizacion", label: "Organización", icon: "📋",  display_order: 1 },
        { id: "ff", key: "experiencia",  label: "Experiencia",  icon: "🎪",  display_order: 2 },
        { id: "fg", key: "seguridad",    label: "Seguridad",    icon: "🛡️", display_order: 3 },
    ],
};

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

// ─── Skeleton de carga ───
function ProfileSkeleton() {
    return (
        <div className="min-h-screen animate-pulse">
            <section className="relative px-6 pt-10 pb-16 overflow-hidden"
                style={{ background: "linear-gradient(180deg, rgba(138,43,226,0.08) 0%, rgba(10,10,10,1) 60%)" }}>
                <div className="max-w-4xl mx-auto">
                    <div className="w-32 h-4 rounded bg-white/5 mb-8" />
                    <div className="flex gap-6 items-start">
                        <div className="w-20 h-20 rounded-2xl bg-white/5 flex-shrink-0" />
                        <div className="flex-1 space-y-3">
                            <div className="w-56 h-7 rounded bg-white/5" />
                            <div className="w-40 h-4 rounded bg-white/5" />
                            <div className="flex gap-2">
                                <div className="w-20 h-5 rounded bg-white/5" />
                                <div className="w-20 h-5 rounded bg-white/5" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <section className="px-6 -mt-8">
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="rounded-xl h-40 bg-white/5" />
                    ))}
                </div>
            </section>
        </div>
    );
}

// ─── Pantalla de error / no encontrado ───
function NotFound({ message }: { message: string }) {
    return (
        <div className="min-h-screen flex items-center justify-center px-6">
            <div className="text-center max-w-md">
                <div
                    className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                    style={{
                        background: "linear-gradient(135deg, rgba(255,7,58,0.15), rgba(138,43,226,0.15))",
                        border: "1px solid rgba(255,7,58,0.3)",
                    }}
                >
                    <span className="text-3xl">🔍</span>
                </div>
                <h1 className="text-xl font-bold text-foreground mb-2">
                    No se encontró el resultado
                </h1>
                <p className="text-sm text-foreground-muted mb-2 font-mono">
                    {message}
                </p>
                <p className="text-xs text-foreground-muted mb-8">
                    Es posible que la persona, empresa o entidad que buscas no esté registrada en el Búnker, o haya sido eliminada.
                </p>
                <div className="flex items-center justify-center gap-4 flex-wrap">
                    <Link
                        href="/"
                        className="px-5 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all hover:opacity-80"
                        style={{
                            background: "rgba(0,229,255,0.08)",
                            border: "1px solid rgba(0,229,255,0.25)",
                            color: "#00E5FF",
                        }}
                    >
                        ← Volver al inicio
                    </Link>
                    <Link
                        href="/entities"
                        className="px-5 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all hover:opacity-80"
                        style={{
                            background: "rgba(212,175,55,0.08)",
                            border: "1px solid rgba(212,175,55,0.25)",
                            color: "#D4AF37",
                        }}
                    >
                        Explorar Entidades →
                    </Link>
                </div>
            </div>
        </div>
    );
}

interface EntityPageProps {
    params: Promise<{ id: string }>;
}

export default function EntityPage({ params }: EntityPageProps) {
    const { id } = use(params);
    const { user, permissions, isAuthenticated, openAuthModal } = usePermissions();

    // ─── Todos los hooks SIEMPRE al inicio, antes de cualquier early return ───
    const [entity, setEntity]         = useState<BackendEntity | null>(null);
    const [dimensions, setDimensions] = useState<Dimension[]>([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);

    // ─── Estado de votación ───
    const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
    const [voteStatus, setVoteStatus] = useState<"idle" | "loading" | "voted" | "error">("idle");
    const [voteMessage, setVoteMessage] = useState("");

    // ─── Limpiar error de sesión cuando el usuario re-inicia sesión ───
    // AuthModal dispara StorageEvent("storage") sintético tras login exitoso
    useEffect(() => {
        const handleReAuth = (e: StorageEvent) => {
            if (e.key === "beacon_user" && e.newValue && voteStatus === "error") {
                setVoteStatus("idle");
                setVoteMessage("");
            }
        };
        window.addEventListener("storage", handleReAuth);
        return () => window.removeEventListener("storage", handleReAuth);
    }, [voteStatus]);

    useEffect(() => {
        setLoading(true);
        setError(null);

        fetch(`${API_URL}/api/v1/entities/${id}`)
            .then(async (res) => {
                if (res.status === 404) throw new Error("Esta entidad no existe o fue removida del Búnker.");
                if (!res.ok)           throw new Error("Error al cargar el perfil. Intenta de nuevo más tarde.");
                return res.json();
            })
            .then(async (data) => {
                setEntity(data);
                // Cargar dimensiones desde la API para esta categoría
                const cat = (data.category || "politico").toLowerCase();
                try {
                    const dimRes = await fetch(`${API_URL}/api/v1/dimensions?category=${cat}`);
                    if (dimRes.ok) {
                        const dimData = await dimRes.json();
                        const dims: Dimension[] = dimData.dimensions || [];
                        setDimensions(dims.length > 0 ? dims : (FALLBACK_DIMENSIONS[cat] || FALLBACK_DIMENSIONS["politico"]));
                    } else {
                        setDimensions(FALLBACK_DIMENSIONS[cat] || FALLBACK_DIMENSIONS["politico"]);
                    }
                } catch {
                    setDimensions(FALLBACK_DIMENSIONS[cat] || FALLBACK_DIMENSIONS["politico"]);
                }
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, [id]);

    // ─── Early returns DESPUÉS de todos los hooks ───
    if (loading) return <ProfileSkeleton />;
    if (error || !entity) return <NotFound message={error || "Entidad no encontrada."} />;

    // ─── Datos derivados (solo se ejecutan cuando entity existe) ───
    const cat = (entity.category || "politico").toLowerCase();
    const typeConfig = CATEGORY_META[cat] || CATEGORY_META["politico"];

    const displayName = [entity.first_name, entity.last_name, entity.second_last_name]
        .filter(Boolean)
        .join(" ");

    const userRank: UserRank = isAuthenticated ? (user.rank as UserRank) : "DISPLACED";
    const isLocalVote = isAuthenticated && ["politico", "periodista"].includes(cat);

    const scoreColor =
        entity.reputation_score >= 4.0
            ? "#39FF14"
            : entity.reputation_score >= 3.0
                ? "#FFD700"
                : "#FF073A";

    type VerdictType = { label: string; color: string; weight: string };
    const VERDICT_LABELS: Record<UserRank, VerdictType> = {
        DISPLACED: { label: "Pulso Social", color: "#555", weight: "0x" },
        BRONZE: { label: "Voto Estándar", color: "#cd7f32", weight: "1x" },
        SILVER: { label: "Veredicto Certificado", color: "#C0C0C0", weight: "1.5x" },
        GOLD: { label: "Veredicto Magistral", color: "#D4AF37", weight: "2.5x" },
        DIAMOND: { label: "Sentencia Suprema", color: "#b9f2ff", weight: "5x" },
    };

    const activeSliders = dimensions;

    return (
        <div className="min-h-screen">
            {/* ═══════════════════════════════════════════
       *  CABECERA DE AUTORIDAD
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
                        <Link
                            href="/"
                            className="text-foreground-muted hover:text-foreground text-xs font-mono transition-colors"
                        >
                            ← Inicio
                        </Link>
                        <span className="text-foreground-muted text-xs">/</span>
                        <Link
                            href="/entities"
                            className="text-foreground-muted hover:text-foreground text-xs font-mono transition-colors"
                        >
                            Entidades
                        </Link>
                        <span className="text-foreground-muted text-xs">/</span>
                        <span className="text-xs font-mono" style={{ color: "#8A2BE2" }}>
                            {displayName}
                        </span>
                    </div>

                    {/* Header de Entidad */}
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                        {/* Avatar */}
                        <div
                            className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                            style={{
                                background: entity.photo_path
                                    ? "transparent"
                                    : "linear-gradient(135deg, #D4AF37, #f5d374)",
                            }}
                        >
                            {entity.photo_path ? (
                                <img
                                    src={entity.photo_path}
                                    alt={displayName}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                            ) : (
                                <span className="text-3xl">{typeConfig.icon}</span>
                            )}
                        </div>

                        <div className="flex-1">
                            {/* Nombre */}
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
                                    {displayName}
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

                            {/* Cargo y partido */}
                            <p className="text-sm text-foreground-muted mb-2">
                                {entity.position || typeConfig.label}
                                {entity.party && (
                                    <span className="text-foreground-muted"> · {entity.party}</span>
                                )}
                                {entity.region && (
                                    <span className="text-foreground-muted"> · {entity.region}</span>
                                )}
                            </p>

                            {/* Badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span
                                    className="text-[9px] px-2 py-0.5 rounded uppercase tracking-wider font-bold"
                                    style={{
                                        backgroundColor: "rgba(192, 192, 192, 0.1)",
                                        color: "#C0C0C0",
                                        border: "1px solid rgba(192, 192, 192, 0.2)",
                                    }}
                                >
                                    {typeConfig.label}
                                </span>
                                {(entity.service_tags || []).map((tag) => (
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

                            {/* Bio */}
                            {entity.bio && (
                                <p className="text-xs text-foreground-muted mt-3 leading-relaxed max-w-xl">
                                    {entity.bio}
                                </p>
                            )}
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
                                {(["GOLD", "SILVER", "BRONZE", "DISPLACED"] as UserRank[]).map((r) => {
                                    const v = VERDICT_LABELS[r];
                                    const isCurrentRank = r === userRank;
                                    return (
                                        <div
                                            key={r}
                                            className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all ${isCurrentRank ? "ring-1" : ""}`}
                                            style={{
                                                backgroundColor: isCurrentRank ? `${v.color}10` : "transparent",
                                                border: isCurrentRank ? `1px solid ${v.color}40` : "none",
                                            }}
                                        >
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: v.color }}>
                                                    {r}
                                                </p>
                                                <p className="text-[9px] text-foreground-muted">{v.label}</p>
                                            </div>
                                            <span className="text-xs font-mono score-display font-bold" style={{ color: v.color }}>
                                                {v.weight}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════
       *  EVALUACIÓN MULTIDIMENSIONAL
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
                        <EvaluationSliders
                            sliders={activeSliders}
                            onValuesChange={setSliderValues}
                        />

                        {/* ACM: Overlay de bloqueo para anónimos */}
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

                        {/* Botón de Veredicto */}
                        <div className="mt-6">
                            <VerdictButton
                                rank={userRank}
                                entityName={displayName}
                                voteStatus={voteStatus}
                                voteMessage={voteMessage}
                                onVerdict={async () => {
                                    if (Object.keys(sliderValues).length === 0) return;

                                    // Verificar token antes de intentar
                                    const token = localStorage.getItem("beacon_token");
                                    if (!token) {
                                        openAuthModal();
                                        return;
                                    }

                                    setVoteStatus("loading");
                                    setVoteMessage("");
                                    try {
                                        const res = await fetch(`${API_URL}/api/v1/entities/${id}/vote`, {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                                "Authorization": `Bearer ${token}`,
                                            },
                                            body: JSON.stringify({ scores: sliderValues }),
                                        });

                                        // Sesión expirada → limpiar y re-auth
                                        if (res.status === 401) {
                                            localStorage.removeItem("beacon_token");
                                            localStorage.removeItem("beacon_user");
                                            setVoteStatus("error");
                                            setVoteMessage("Sesión expirada. Inicia sesión nuevamente.");
                                            setTimeout(() => openAuthModal(), 800);
                                            return;
                                        }

                                        if (!res.ok) {
                                            const err = await res.json();
                                            throw new Error(err.detail || "Error al emitir voto");
                                        }
                                        const data = await res.json();
                                        setVoteStatus("voted");
                                        setVoteMessage(`✓ Veredicto registrado — Score actualizado: ${data.new_score.toFixed(2)} (${data.total_reviews} veredictos)`);
                                        // Actualizar score localmente
                                        setEntity((prev) => prev ? {
                                            ...prev,
                                            reputation_score: data.new_score,
                                            total_reviews: data.total_reviews,
                                        } : null);
                                    } catch (err) {
                                        setVoteStatus("error");
                                        setVoteMessage(err instanceof Error ? err.message : "Error al emitir voto");
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

// ─── Subcomponente de Sliders ───
function EvaluationSliders({
    sliders,
    onValuesChange,
}: {
    sliders: { key: string; label: string; icon: string }[];
    onValuesChange?: (values: Record<string, number>) => void;
}) {
    const [values, setValues] = useState<Record<string, number>>(() => {
        const initial: Record<string, number> = {};
        sliders.forEach((s) => { initial[s.key] = 3; });
        return initial;
    });

    // Notificar al padre en cada cambio
    useEffect(() => {
        onValuesChange?.(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values]);

    const handleChange = (key: string, value: number) => {
        setValues((prev) => ({ ...prev, [key]: value }));
    };

    const avg = Object.values(values).reduce((a, b) => a + b, 0) / Object.values(values).length;
    const avgColor = avg >= 4 ? "#39FF14" : avg >= 3 ? "#FFD700" : "#FF073A";

    return (
        <div className="space-y-5">
            {sliders.map((slider) => (
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
                                color: values[slider.key] >= 4 ? "#39FF14" : values[slider.key] >= 3 ? "#FFD700" : "#FF073A",
                            }}
                        >
                            {(values[slider.key] || 3).toFixed(1)}
                        </span>
                    </div>
                    <div className="relative">
                        <input
                            type="range"
                            min="0"
                            max="5"
                            step="0.1"
                            value={values[slider.key] || 3}
                            onChange={(e) => handleChange(slider.key, parseFloat(e.target.value))}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                            style={{
                                background: `linear-gradient(to right, #FF073A 0%, #FFD700 50%, #39FF14 100%)`,
                                accentColor: "#D4AF37",
                            }}
                        />
                        <div className="flex justify-between mt-1">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <span key={n} className="text-[8px] text-foreground-muted font-mono">{n}</span>
                            ))}
                        </div>
                    </div>
                </div>
            ))}

            {/* Resumen promedio */}
            <div className="mt-6 pt-4 border-t border-beacon-border flex items-center justify-between">
                <span className="text-[10px] text-foreground-muted uppercase tracking-wider">
                    Tu Veredicto Promedio
                </span>
                <span className="text-lg font-mono score-display font-bold" style={{ color: avgColor }}>
                    {avg.toFixed(2)}
                </span>
            </div>
        </div>
    );
}
