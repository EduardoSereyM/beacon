/**
 * BEACON PROTOCOL — VerifyIdentityModal (P5 v3)
 * ===============================================
 * Flujo: Onboarding (4 slides) → Intro verificación → Formulario → Éxito
 * Flujo API: PUT /profile → POST /verify-identity → rank VERIFIED
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { BadgeCheck, SmilePlus, UserLock, Vote } from "lucide-react";
import { useAuthStore } from "@/store";

// ─── Geografía Chile ─────────────────────────────────────────────────────────

const CHILE_REGIONS: Record<string, string[]> = {
    "Arica y Parinacota": ["Arica", "Camarones", "Putre", "General Lagos"],
    "Tarapacá": ["Iquique", "Alto Hospicio", "Pozo Almonte", "Pica", "Huara"],
    "Antofagasta": ["Antofagasta", "Calama", "Mejillones", "Tocopilla", "San Pedro de Atacama"],
    "Atacama": ["Copiapó", "Vallenar", "Caldera", "Chañaral", "Tierra Amarilla"],
    "Coquimbo": ["La Serena", "Coquimbo", "Ovalle", "Illapel", "Vicuña"],
    "Valparaíso": ["Valparaíso", "Viña del Mar", "Quilpué", "Villa Alemana", "San Antonio", "Quillota", "La Calera"],
    "Metropolitana": [
        "Santiago", "Providencia", "Las Condes", "Ñuñoa", "La Florida",
        "Maipú", "Puente Alto", "Vitacura", "Lo Barnechea", "Peñalolén",
        "La Reina", "Macul", "San Miguel", "San Bernardo", "Recoleta",
        "Independencia", "Estación Central", "Cerrillos", "Quilicura",
    ],
    "O'Higgins": ["Rancagua", "San Fernando", "Rengo", "Machalí", "Graneros"],
    "Maule": ["Talca", "Curicó", "Linares", "Constitución", "Cauquenes"],
    "Ñuble": ["Chillán", "San Carlos", "Bulnes", "Quirihue"],
    "Biobío": ["Concepción", "Los Ángeles", "Chiguayante", "Talcahuano", "Coronel", "Hualpén"],
    "La Araucanía": ["Temuco", "Padre Las Casas", "Villarrica", "Angol", "Pucón"],
    "Los Ríos": ["Valdivia", "La Unión", "Panguipulli", "Río Bueno"],
    "Los Lagos": ["Puerto Montt", "Osorno", "Castro", "Puerto Varas", "Ancud"],
    "Aysén": ["Coyhaique", "Puerto Aysén", "Chile Chico"],
    "Magallanes": ["Punta Arenas", "Puerto Natales", "Porvenir"],
};

const CURRENT_YEAR = new Date().getFullYear();
const ONBOARDING_KEY = "beacon_onboarding_seen";

// ─── Utilidades RUT Módulo 11 ─────────────────────────────────────────────────

function cleanRut(rut: string): string {
    return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

function formatRut(raw: string): string {
    const clean = cleanRut(raw);
    if (clean.length < 2) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    const reversed = body.split("").reverse();
    const groups: string[] = [];
    for (let i = 0; i < reversed.length; i += 3) {
        groups.push(reversed.slice(i, i + 3).reverse().join(""));
    }
    return `${groups.reverse().join(".")}-${dv}`;
}

function validateRut(rut: string): boolean {
    const clean = cleanRut(rut);
    if (clean.length < 2) return false;
    const body = clean.slice(0, -1);
    const dvInput = clean.slice(-1).toUpperCase();
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i]) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const remainder = sum % 11;
    const dvExpected = remainder === 0 ? "0" : remainder === 1 ? "K" : String(11 - remainder);
    return dvInput === dvExpected;
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const INPUT_STYLE = {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
};

const INPUT_ERROR_STYLE = {
    border: "1px solid rgba(255,80,80,0.6)",
    background: "rgba(255,255,255,0.04)",
};

const GOLD = "#D4AF37";
const GOLD_DIM = "rgba(212,175,55,0.15)";
const GOLD_BORDER = "rgba(212,175,55,0.35)";

// ─── Onboarding slides data ───────────────────────────────────────────────────

const SLIDES = [
    {
        Icon: BadgeCheck,
        title: "Valor único",
        subtitle: "Por qué Beacon es diferente",
        body: "Beacon es la primera plataforma de opinión ciudadana verificada de Chile. Cada voz es real, cada dato es auditable.",
        accent: GOLD,
    },
    {
        Icon: SmilePlus,
        title: "Cómo funciona",
        subtitle: "El sistema de verificación y pesos",
        body: "Los usuarios no verificados votan con 0.5 puntos. Al verificar tu identidad, tu voto vale 1 punto completo — el doble de impacto.",
        accent: "#00E5FF",
    },
    {
        Icon: UserLock,
        title: "Seguridad",
        subtitle: "Cómo protegemos tu RUT",
        body: "Tu RUT se convierte en un hash SHA-256 irreversible al instante. Beacon nunca almacena tu RUT en texto plano. Matemáticamente imposible de reconstruir.",
        accent: "#39FF14",
    },
    {
        Icon: Vote,
        title: "Primera encuesta",
        subtitle: "Opina sobre algo que te importa",
        body: "Una vez verificado, participa en encuestas sobre política, economía y sociedad chilena. Tu opinión construye estadísticas oficiales.",
        accent: "#8A2BE2",
    },
];

// ─── Onboarding Component ─────────────────────────────────────────────────────

function OnboardingSlides({ onFinish, onSkip }: { onFinish: () => void; onSkip: () => void }) {
    const [slide, setSlide] = useState(0);
    const current = SLIDES[slide];
    const { Icon } = current;
    const isLast = slide === SLIDES.length - 1;

    return (
        <div className="flex flex-col" style={{ minHeight: 340 }}>
            {/* Slide content */}
            <div className="flex flex-col items-center text-center gap-4 flex-1 py-4">
                <div
                    style={{
                        width: 72,
                        height: 72,
                        borderRadius: "50%",
                        background: `${current.accent}18`,
                        border: `2px solid ${current.accent}50`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: `0 0 24px ${current.accent}20`,
                        transition: "all 0.3s ease",
                    }}
                >
                    <Icon size={32} color={current.accent} strokeWidth={1.5} />
                </div>

                <div>
                    <p className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: current.accent }}>
                        {current.subtitle}
                    </p>
                    <h2 className="text-xl font-bold text-white mb-3">{current.title}</h2>
                    <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)", maxWidth: 320 }}>
                        {current.body}
                    </p>
                </div>
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-2 py-4">
                {SLIDES.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setSlide(i)}
                        style={{
                            width: i === slide ? 20 : 8,
                            height: 8,
                            borderRadius: 4,
                            background: i === slide ? GOLD : "rgba(255,255,255,0.15)",
                            border: "none",
                            cursor: "pointer",
                            transition: "all 0.25s ease",
                        }}
                    />
                ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    onClick={onSkip}
                    className="flex-1 py-2.5 rounded-lg text-sm font-mono tracking-wide transition-all"
                    style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        color: "rgba(255,255,255,0.4)",
                        cursor: "pointer",
                    }}
                >
                    Saltar
                </button>
                <button
                    onClick={() => isLast ? onFinish() : setSlide(s => s + 1)}
                    className="flex-[2] py-2.5 rounded-lg text-sm font-bold font-mono tracking-wide transition-all hover:scale-[1.02]"
                    style={{
                        background: `linear-gradient(135deg, ${GOLD}, #B8860B)`,
                        color: "#0a0a0a",
                        border: "none",
                        cursor: "pointer",
                    }}
                >
                    {isLast ? "Verificar mi identidad →" : "Siguiente →"}
                </button>
            </div>
        </div>
    );
}

// ─── Verify Intro Component ───────────────────────────────────────────────────

const VERIFY_STEPS = [
    {
        title: "Ingresa tu RUT",
        desc: "Solo será necesario una sola vez en toda tu vida en Beacon.",
    },
    {
        title: "Confirmación automática",
        desc: "Tu RUT se convierte inmediatamente en un código hash irreversible. Matemáticamente imposible de reconstruir.",
    },
    {
        title: "Votos verificados",
        desc: "Cada voto que emitas ahora vale 1 punto completo. Tu voz tiene más peso porque eres real.",
    },
];

function VerifyIntro({ onContinue }: { onContinue: () => void }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="text-center">
                <h2 className="text-xl font-bold text-white mb-1">Verifica tu identidad</h2>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Aumenta tu poder de voto de 0.5 a 1 punto completo.{" "}
                    <span style={{ color: GOLD }}>Tu RUT está 100% protegido con SHA-256.</span>
                </p>
            </div>

            <div className="flex flex-col gap-3">
                {VERIFY_STEPS.map((step, i) => (
                    <div
                        key={i}
                        className="flex items-start gap-4 p-4 rounded-xl"
                        style={{
                            background: GOLD_DIM,
                            border: `1px solid ${GOLD_BORDER}`,
                        }}
                    >
                        {/* Gold circle */}
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: `linear-gradient(135deg, ${GOLD}, #B8860B)`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 15,
                                fontWeight: 800,
                                color: "#0a0a0a",
                                flexShrink: 0,
                                boxShadow: `0 0 12px rgba(212,175,55,0.3)`,
                            }}
                        >
                            {i + 1}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-white mb-0.5">{step.title}</p>
                            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                                {step.desc}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={onContinue}
                className="w-full py-3 rounded-xl text-sm font-bold font-mono tracking-widest uppercase transition-all hover:scale-[1.02]"
                style={{
                    background: `linear-gradient(135deg, ${GOLD}, #B8860B)`,
                    color: "#0a0a0a",
                    border: "none",
                    cursor: "pointer",
                }}
            >
                Verificar ahora →
            </button>
        </div>
    );
}

// ─── Pride moment post-verificación ──────────────────────────────────────────

function VerifiedPrideMoment({ isVerified, onClose }: { isVerified: boolean; onClose: () => void }) {
    const [copied, setCopied] = useState(false);

    const shareText =
        "Acabo de verificar mi identidad en @BeaconChile.\n" +
        "Mi voto cuenta en las estadísticas oficiales de Chile. ¿Y el tuyo?\n" +
        "beaconchile.cl #BeaconChile #ChileOpina";

    function handleShare() {
        if (typeof navigator !== "undefined" && navigator.share) {
            navigator.share({
                title: "Soy ciudadano verificado en Beacon Chile",
                text: shareText,
                url: "https://www.beaconchile.cl",
            }).catch(() => {});
        } else {
            navigator.clipboard.writeText(shareText).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
            });
        }
    }

    if (!isVerified) {
        return (
            <div className="text-center py-6">
                <div className="text-4xl mb-3">✅</div>
                <h2 className="text-lg font-bold text-white mb-2">RUT registrado</h2>
                <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Completa tus datos demográficos en el perfil para ascender a VERIFIED.
                </p>
                <button
                    onClick={onClose}
                    className="text-xs font-mono uppercase tracking-wider px-4 py-2 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}
                >
                    Cerrar
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center text-center py-4 gap-5">
            <div
                style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: "rgba(212,175,55,0.1)",
                    border: "2px solid rgba(212,175,55,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 36,
                    boxShadow: "0 0 32px rgba(212,175,55,0.15)",
                }}
            >
                🎖️
            </div>

            <div className="flex flex-col gap-2">
                <h2 className="text-xl font-bold text-white">Ahora eres un ciudadano verificado</h2>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Tu voz es parte de las estadísticas oficiales de Chile.
                </p>
                <p className="text-sm font-semibold" style={{ color: GOLD }}>
                    Un ser humano real. Una voz que cuenta al 100%.
                </p>
            </div>

            <div className="flex flex-col gap-3 w-full">
                <button
                    onClick={handleShare}
                    className="w-full py-3 rounded-xl text-sm font-bold font-mono tracking-wide transition-all"
                    style={{
                        background: copied ? "rgba(57,255,20,0.12)" : "rgba(212,175,55,0.12)",
                        border: `1px solid ${copied ? "rgba(57,255,20,0.4)" : GOLD_BORDER}`,
                        color: copied ? "#39FF14" : GOLD,
                        cursor: "pointer",
                    }}
                >
                    {copied ? "✓ Texto copiado — pégalo donde quieras" : "Compartir que soy ciudadano verificado →"}
                </button>

                <button
                    onClick={() => { onClose(); window.location.href = "/encuestas"; }}
                    className="w-full py-3 rounded-xl text-sm font-bold font-mono tracking-wide"
                    style={{
                        background: "rgba(0,229,255,0.08)",
                        border: "1px solid rgba(0,229,255,0.25)",
                        color: "#00E5FF",
                        cursor: "pointer",
                    }}
                >
                    Ir a votar →
                </button>
            </div>
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type ModalStep = "onboarding" | "intro" | "form" | "success";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    initialStep?: "onboarding" | "intro";
}

export default function VerifyIdentityModal({ isOpen, onClose, initialStep = "intro" }: Props) {
    const { token, user, setAuth } = useAuthStore();

    const [step, setStep] = useState<ModalStep>(initialStep);

    const [rut, setRut] = useState("");
    const [birthYear, setBirthYear] = useState(user?.birth_year ? String(user.birth_year) : "");
    const [gender, setGender] = useState(user?.gender ?? "");
    const [region, setRegion] = useState(user?.region ?? "");
    const [commune, setCommune] = useState(user?.commune ?? "");

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<{ new_rank: string; message: string } | null>(null);
    const [serverError, setServerError] = useState("");

    const communes = useMemo(() => CHILE_REGIONS[region] ?? [], [region]);

    // Sincronizar step cuando el modal se abre con un initialStep distinto
    useEffect(() => {
        if (isOpen) setStep(initialStep);
    }, [isOpen, initialStep]);

    if (!isOpen) return null;

    const handleOnboardingFinish = () => {
        try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* SSR */ }
        // En modo onboarding puro → cierra el modal (no lleva al form)
        onClose();
    };

    const handleRegionChange = (val: string) => {
        setRegion(val);
        setCommune("");
        setErrors((e) => ({ ...e, region: "", commune: "" }));
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (!validateRut(rut)) newErrors.rut = "RUT inválido. Verifica el dígito verificador.";
        const year = parseInt(birthYear);
        if (!birthYear || isNaN(year) || year < 1920 || year > CURRENT_YEAR - 18) {
            newErrors.birthYear = `Ingresa un año válido (1920–${CURRENT_YEAR - 18}).`;
        }
        if (!gender) newErrors.gender = "Selecciona tu género.";
        if (!region) newErrors.region = "Selecciona tu región.";
        if (!commune) newErrors.commune = "Selecciona tu comuna.";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setServerError("");
        if (!validate()) return;
        if (!token) { setServerError("Sesión expirada. Vuelve a iniciar sesión."); return; }

        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
        const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

        try {
            const profileRes = await fetch(`${apiUrl}/api/v1/user/auth/profile`, {
                method: "PUT",
                headers,
                body: JSON.stringify({ birth_year: parseInt(birthYear), gender, country: "Chile", region, commune }),
            });
            if (!profileRes.ok) {
                const d = await profileRes.json();
                setServerError(d.detail ?? "Error al guardar perfil.");
                return;
            }

            const rutRes = await fetch(`${apiUrl}/api/v1/user/auth/verify-identity`, {
                method: "POST",
                headers,
                body: JSON.stringify({ rut }),
            });
            const rutData = await rutRes.json();
            if (!rutRes.ok) { setServerError(rutData.detail ?? "Error al verificar RUT."); return; }

            if (user) {
                const updatedUser = { ...user, rank: rutData.new_rank as typeof user.rank, region, commune };
                setAuth(token, updatedUser);
                try { localStorage.setItem("beacon_user", JSON.stringify(updatedUser)); } catch { /* SSR */ }
            }

            setSuccess({ new_rank: rutData.new_rank, message: rutData.message });
            setStep("success");

        } catch {
            setServerError("Error de conexión. Intenta más tarde.");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setRut(""); setBirthYear(""); setGender(""); setRegion(""); setCommune("");
        setErrors({}); setServerError(""); setSuccess(null);
        onClose();
    };

    const inputClass = "w-full px-4 py-3 rounded-lg text-sm text-white outline-none transition-all";
    const labelClass = "block text-xs font-medium text-foreground-muted mb-1 uppercase tracking-wider";

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)" }}
            onClick={handleClose}
        >
            <div
                className="relative w-full max-w-md rounded-2xl p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
                style={{
                    background: "rgba(10,10,10,0.97)",
                    border: `1px solid ${GOLD_BORDER}`,
                    boxShadow: "0 0 40px rgba(212,175,55,0.08)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Cerrar */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-5 text-foreground-muted hover:text-foreground text-xl transition-colors"
                    aria-label="Cerrar"
                    style={{ cursor: "pointer" }}
                >
                    ×
                </button>

                {/* ── Onboarding ── */}
                {step === "onboarding" && (
                    <OnboardingSlides
                        onFinish={handleOnboardingFinish}
                        onSkip={handleOnboardingFinish}
                    />
                )}

                {/* ── Intro verificación ── */}
                {step === "intro" && (
                    <VerifyIntro onContinue={() => setStep("form")} />
                )}

                {/* ── Formulario ── */}
                {step === "form" && (
                    <>
                        <div className="text-center mb-6">
                            <div className="text-4xl mb-3">🔏</div>
                            <h2 className="text-xl font-bold text-white">Verificar Identidad</h2>
                            <p className="text-xs text-foreground-muted mt-1">
                                Completa tus datos para obtener rango{" "}
                                <span style={{ color: "#4dff83" }}>VERIFIED</span> y voto con peso <strong>1.0x</strong>.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* RUT */}
                            <div>
                                <label className={labelClass}>RUT chileno *</label>
                                <input
                                    type="text"
                                    value={rut}
                                    onChange={(e) => { setRut(formatRut(e.target.value)); setErrors((err) => ({ ...err, rut: "" })); }}
                                    placeholder="12.345.678-9"
                                    maxLength={12}
                                    className={`${inputClass} font-mono`}
                                    style={errors.rut ? INPUT_ERROR_STYLE : INPUT_STYLE}
                                    autoComplete="off"
                                    autoFocus
                                />
                                {rut.length >= 3 && (
                                    <p className="text-xs mt-1 font-semibold" style={{ color: validateRut(rut) ? "#4dff83" : "#ff5050" }}>
                                        {validateRut(rut) ? "✓ RUT válido" : "✗ RUT inválido — verifica el dígito verificador"}
                                    </p>
                                )}
                                {!rut && (
                                    <p className="text-[10px] text-foreground-muted mt-1">
                                        Almacenado como hash SHA-256 irreversible. Nunca lo vemos en texto plano.
                                    </p>
                                )}
                            </div>

                            {/* Año de nacimiento */}
                            <div>
                                <label className={labelClass}>Año de nacimiento *</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={birthYear}
                                    onChange={(e) => { setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4)); setErrors((err) => ({ ...err, birthYear: "" })); }}
                                    placeholder="1990"
                                    maxLength={4}
                                    className={inputClass}
                                    style={errors.birthYear ? INPUT_ERROR_STYLE : INPUT_STYLE}
                                />
                                {errors.birthYear && <p className="text-xs mt-1" style={{ color: "#ff5050" }}>{errors.birthYear}</p>}
                            </div>

                            {/* Género */}
                            <div>
                                <label className={labelClass}>Género *</label>
                                <select
                                    value={gender}
                                    onChange={(e) => { setGender(e.target.value); setErrors((err) => ({ ...err, gender: "" })); }}
                                    className={inputClass}
                                    style={errors.gender ? INPUT_ERROR_STYLE : INPUT_STYLE}
                                >
                                    <option value="" style={{ background: "#0a0a0a", color: "white" }}>Selecciona género</option>
                                    <option value="Masculino" style={{ background: "#0a0a0a", color: "white" }}>Masculino</option>
                                    <option value="Femenino" style={{ background: "#0a0a0a", color: "white" }}>Femenino</option>
                                    <option value="No binario" style={{ background: "#0a0a0a", color: "white" }}>No binario</option>
                                    <option value="Prefiero no decir" style={{ background: "#0a0a0a", color: "white" }}>Prefiero no decir</option>
                                </select>
                                {errors.gender && <p className="text-xs mt-1" style={{ color: "#ff5050" }}>{errors.gender}</p>}
                            </div>

                            {/* País */}
                            <div>
                                <label className={labelClass}>País *</label>
                                <input
                                    type="text"
                                    value="Chile"
                                    readOnly
                                    className={inputClass}
                                    style={{ ...INPUT_STYLE, opacity: 0.5, cursor: "default" }}
                                />
                            </div>

                            {/* Región */}
                            <div>
                                <label className={labelClass}>Región *</label>
                                <select
                                    value={region}
                                    onChange={(e) => handleRegionChange(e.target.value)}
                                    className={inputClass}
                                    style={errors.region ? INPUT_ERROR_STYLE : INPUT_STYLE}
                                >
                                    <option value="" style={{ background: "#0a0a0a", color: "white" }}>Selecciona región</option>
                                    {Object.keys(CHILE_REGIONS).map((r) => (
                                        <option key={r} value={r} style={{ background: "#0a0a0a", color: "white" }}>{r}</option>
                                    ))}
                                </select>
                                {errors.region && <p className="text-xs mt-1" style={{ color: "#ff5050" }}>{errors.region}</p>}
                            </div>

                            {/* Comuna */}
                            <div>
                                <label className={labelClass}>Comuna *</label>
                                <select
                                    value={commune}
                                    onChange={(e) => { setCommune(e.target.value); setErrors((err) => ({ ...err, commune: "" })); }}
                                    disabled={!region}
                                    className={inputClass}
                                    style={errors.commune ? INPUT_ERROR_STYLE : { ...INPUT_STYLE, opacity: !region ? 0.4 : 1 }}
                                >
                                    <option value="" style={{ background: "#0a0a0a", color: "white" }}>{region ? "Selecciona comuna" : "Primero elige región"}</option>
                                    {communes.map((c) => (
                                        <option key={c} value={c} style={{ background: "#0a0a0a", color: "white" }}>{c}</option>
                                    ))}
                                </select>
                                {errors.commune && <p className="text-xs mt-1" style={{ color: "#ff5050" }}>{errors.commune}</p>}
                            </div>

                            {serverError && (
                                <p className="text-xs text-center py-2 px-3 rounded-lg" style={{ color: "#ff5050", background: "rgba(255,80,80,0.08)" }}>
                                    {serverError}
                                </p>
                            )}

                            <p className="text-[10px] text-foreground-muted text-center">
                                Al verificar aceptas que BEACON almacene tu hash de identidad para prevenir votos duplicados.
                            </p>

                            <button
                                type="submit"
                                disabled={loading || !rut || !birthYear || !region || !commune}
                                className="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-widest transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                style={{ background: `linear-gradient(135deg, ${GOLD}, #B8860B)`, color: "#0a0a0a" }}
                            >
                                {loading ? "Verificando..." : "Verificar Identidad"}
                            </button>
                        </form>
                    </>
                )}

                {/* ── Éxito ── */}
                {step === "success" && success && (
                    <VerifiedPrideMoment
                        isVerified={success.new_rank === "VERIFIED"}
                        onClose={handleClose}
                    />
                )}
            </div>
        </div>
    );
}
