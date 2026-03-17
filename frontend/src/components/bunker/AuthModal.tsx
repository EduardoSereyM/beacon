/**
 * BEACON PROTOCOL — Auth Modal (La Puerta del Búnker)
 * =====================================================
 * Modal de Login/Registro con estética Dark Premium.
 *
 * UX Features:
 *   - Selectores en cascada: País → Región → Comuna
 *   - Toggle visibilidad contraseña (icono ojo)
 *   - Validación de complejidad de contraseña en tiempo real
 *   - Botón deshabilitado hasta campos requeridos OK
 *   - Backdrop-blur + fade-in-scale animation
 *   - Bordes Cian (#00E5FF) foco / Oro (#D4AF37) identidad
 *
 * Nota: RUT y año de nacimiento se completan en el perfil del usuario,
 * no en el registro, para reducir fricción inicial.
 *
 * "El que quiera hablar, primero debe demostrar que es real."
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "@/store";

// ═══════════════════════════════════════════
//  DATOS GEOGRÁFICOS (Cascada País → Región → Comuna)
// ═══════════════════════════════════════════

/** Países disponibles y sus regiones */
const GEOGRAPHY: Record<string, Record<string, string[]>> = {
    Chile: {
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
    },
};

const COUNTRIES = Object.keys(GEOGRAPHY);

// ═══════════════════════════════════════════
//  VALIDACIÓN + MÁSCARA RUT MÓDULO 11
// ═══════════════════════════════════════════

/** Limpia un RUT a solo dígitos + K */
function cleanRut(rut: string): string {
    return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Aplica máscara XX.XXX.XXX-X mientras se escribe */
function formatRutMask(raw: string): string {
    const clean = cleanRut(raw);
    if (clean.length <= 1) return clean;

    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);

    // Insertar puntos cada 3 dígitos desde la derecha
    const reversed = body.split("").reverse();
    const groups: string[] = [];
    for (let i = 0; i < reversed.length; i += 3) {
        groups.push(reversed.slice(i, i + 3).reverse().join(""));
    }
    const formatted = groups.reverse().join(".");

    return `${formatted}-${dv}`;
}

/** Valida un RUT chileno con Módulo 11 */
function validateRutMod11(rut: string): boolean {
    const clean = cleanRut(rut);
    if (clean.length < 2) return false;

    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);

    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i]) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const remainder = 11 - (sum % 11);
    let expectedDV: string;
    if (remainder === 11) expectedDV = "0";
    else if (remainder === 10) expectedDV = "K";
    else expectedDV = remainder.toString();

    return dv === expectedDV;
}

// ═══════════════════════════════════════════
//  ICONOS SVG MINIMALISTAS
// ═══════════════════════════════════════════

function EyeIcon({ open }: { open: boolean }) {
    if (open) {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
        );
    }
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    );
}

// ═══════════════════════════════════════════
//  COMPONENTE FORGOT PASSWORD (sub-formulario)
// ═══════════════════════════════════════════

function ForgotPasswordForm({ onBack, apiUrl }: { onBack: () => void; apiUrl: string }) {
    const CYAN = "#00E5FF";
    const GOLD = "#D4AF37";
    const RED = "#FF073A";
    const GREEN = "#00FF87";

    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        setLoading(true);
        setMsg(null);
        try {
            const res = await fetch(`${apiUrl}/api/v1/user/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error al enviar email");
            setMsg({ type: "success", text: data.message });
        } catch (err: unknown) {
            setMsg({ type: "error", text: err instanceof Error ? err.message : "Error desconocido" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="px-8 pb-8 space-y-4">
            <p className="text-[10px] text-gray-500 font-mono leading-relaxed">
                Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                        Email *
                    </label>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@correo.cl"
                        className="w-full text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200 bg-transparent"
                        style={{ border: "1px solid rgba(255,255,255,0.1)", caretColor: CYAN }}
                        onFocus={(e) => e.target.style.borderColor = `${CYAN}60`}
                        onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                    />
                </div>

                {msg && (
                    <div
                        className="text-[10px] font-mono px-3 py-2 rounded-lg"
                        style={{
                            color: msg.type === "success" ? GREEN : RED,
                            backgroundColor: msg.type === "success" ? `${GREEN}10` : `${RED}10`,
                            border: `1px solid ${msg.type === "success" ? `${GREEN}25` : `${RED}25`}`,
                        }}
                    >
                        {msg.text}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full py-3 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white transition-all duration-300 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                        background: email
                            ? `linear-gradient(135deg, ${GOLD}, #8A2BE2)`
                            : "rgba(50,50,50,0.5)",
                        boxShadow: email ? `0 0 20px ${GOLD}20` : "none",
                    }}
                >
                    {loading ? "Enviando..." : "Enviar Enlace de Recuperación"}
                </button>

                <p className="text-center text-[9px] font-mono">
                    <button
                        type="button"
                        onClick={onBack}
                        className="hover:text-white transition-colors"
                        style={{ color: CYAN }}
                    >
                        ← Volver a Iniciar Sesión
                    </button>
                </p>
            </form>
        </div>
    );
}

// ═══════════════════════════════════════════
//  COMPONENTE AUTHMODAL
// ═══════════════════════════════════════════

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionExpired?: boolean;
}

export default function AuthModal({ isOpen, onClose, sessionExpired = false }: AuthModalProps) {
    const { setAuth } = useAuthStore();
    const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
    const [isAnimating, setIsAnimating] = useState(false);
    const [showAdminInterstitial, setShowAdminInterstitial] = useState(false);

    // ─── Form State ───
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // ─── Validación Contraseña ───
    const [pwdValidations, setPwdValidations] = useState({
        length: false,
        upper: false,
        number: false,
        special: false,
    });

    useEffect(() => {
        setPwdValidations({
            length: password.length >= 8,
            upper: /[A-Z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[@#$%&*]/.test(password),
        });
    }, [password]);

    // ─── Geografía Cascada (País → Región → Comuna) ───
    const [country, setCountry] = useState("Chile"); // Preseleccionado
    const [region, setRegion] = useState("");
    const [commune, setCommune] = useState("");
    const [ageRange, setAgeRange] = useState("");

    // ─── UI State ───
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Regiones disponibles según país seleccionado
    const availableRegiones = useMemo(() => {
        if (!country) return [];
        return Object.keys(GEOGRAPHY[country] || {});
    }, [country]);

    // Comunas disponibles según región seleccionada
    const availableCommunas = useMemo(() => {
        if (!country || !region) return [];
        return GEOGRAPHY[country]?.[region] || [];
    }, [country, region]);

    // Reset cascada: país cambia → resetear región y comuna
    useEffect(() => {
        setRegion("");
        setCommune("");
    }, [country]);

    // Reset comuna cuando cambia la región
    useEffect(() => {
        setCommune("");
    }, [region]);

    // Animación de entrada
    useEffect(() => {
        if (isOpen) {
            requestAnimationFrame(() => setIsAnimating(true));
        } else {
            setIsAnimating(false);
        }
    }, [isOpen]);

    // Cerrar con Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    // ─── Validación de formulario completo ───
    const isFormValid = useMemo(() => {
        const isPwdValid = pwdValidations.length && pwdValidations.upper && pwdValidations.number && pwdValidations.special;
        if (mode === "login") {
            return email.length > 0 && password.length >= 8; // En login no bloqueamos por complejidad para evitar revelar reglas a atacantes en cuentas viejas
        }
        // Registro: email, nombre, password válida, confirmPassword, país, región, comuna, rango etario
        return (
            email.length > 0 &&
            fullName.length >= 2 &&
            isPwdValid &&
            confirmPassword === password &&
            country.length > 0 &&
            region.length > 0 &&
            commune.length > 0 &&
            ageRange.length > 0
        );
    }, [mode, email, password, confirmPassword, fullName, country, region, commune, ageRange, pwdValidations]);

    // Timestamp de inicio para DNA Scanner (fill_duration)
    const [formStartTime] = useState(() => performance.now());

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (!isFormValid) return;

        setLoading(true);

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const fillDuration = (performance.now() - formStartTime) / 1000;

            if (mode === "login") {
                const res = await fetch(`${API_URL}/api/v1/user/auth/login`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-fill-duration": fillDuration.toString(),
                    },
                    body: JSON.stringify({ email, password }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    const errorMsg = data.detail || "Credenciales inválidas";
                    // Detectar el error específico de Supabase cuando el email no está confirmado
                    if (errorMsg.toLowerCase().includes("email not confirmed") ||
                        errorMsg.toLowerCase().includes("not confirmed")) {
                        throw new Error("Debes confirmar tu correo electrónico antes de acceder. Revisa tu bandeja de entrada.");
                    }
                    throw new Error(errorMsg);
                }

                const data = await res.json();

                // Fuente de verdad única: Zustand store con persist (beacon-auth)
                setAuth(data.access_token, data.user);

                // Retrocompatibilidad: legacy keys que usa admin/layout.tsx y entities/[id]
                // TODO P3: migrar todos los consumidores a useAuthStore y eliminar estas líneas
                localStorage.setItem("beacon_token", data.access_token);
                localStorage.setItem("beacon_user", JSON.stringify(data.user));

                // Notificar a otras pestañas
                window.dispatchEvent(new StorageEvent("storage", {
                    key: "beacon_user",
                    newValue: JSON.stringify(data.user),
                }));

                if (data.user.role === "admin") {
                    setShowAdminInterstitial(true);
                    setSuccess(`Bienvenido, Overlord ${data.user.full_name}.`);
                } else {
                    setSuccess(`Bienvenido, ${data.user.full_name}. Rango: ${data.user.rank}`);
                    setTimeout(() => onClose(), 1500);
                }
            } else {
                // ─── Registro ───
                if (password !== confirmPassword) {
                    throw new Error("Las contraseñas no coinciden");
                }

                const res = await fetch(`${API_URL}/api/v1/user/auth/register`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-fill-duration": fillDuration.toString(),
                    },
                    body: JSON.stringify({
                        email,
                        full_name: fullName,
                        password,
                        country: country || undefined,
                        region: region || undefined,
                        commune: commune || undefined,
                        age_range: ageRange || undefined,
                    }),
                });

                const data = await res.json();

                if (!res.ok) {
                    // Rate limit de Supabase (429) — mensaje compacto
                    if (res.status === 429) {
                        throw new Error("⏳ Límite de emails alcanzado. Espera unos minutos e intenta con otro email.");
                    }
                    throw new Error(data.detail || "Error en el registro");
                }

                // Mensaje adaptado: con o sin confirmación de email (según si el backend está en DEBUG)
                const successMsg = data.email_confirmation_required
                    ? `📧 Registro exitoso. Hemos enviado un email de confirmación a ${email}. Revisa tu bandeja y haz clic en el enlace para activar tu cuenta.`
                    : `✅ Cuenta activada. Ya puedes iniciar sesión.`;
                setSuccess(successMsg);
                setTimeout(() => {
                    setMode("login");
                    setSuccess("");
                }, 4000);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error interno del servidor");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const CYAN = "#00E5FF";
    const GOLD = "#D4AF37";
    const RED = "#FF073A";

    // Estilo de input reutilizable
    const inputStyle = (focused?: boolean): React.CSSProperties => ({
        border: `1px solid ${focused ? `${CYAN}60` : "rgba(255,255,255,0.1)"}`,
        caretColor: CYAN,
        backgroundColor: "transparent",
    });

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            onClick={onClose}
            style={{
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                opacity: isAnimating ? 1 : 0,
                transition: "opacity 0.3s ease",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
                style={{
                    background: "rgba(15, 15, 15, 0.95)",
                    border: `1px solid ${mode === "register" ? GOLD : CYAN}30`,
                    boxShadow: `0 0 40px ${mode === "register" ? GOLD : CYAN}10,
                      0 24px 48px rgba(0, 0, 0, 0.5)`,
                    transform: isAnimating ? "scale(1)" : "scale(0.95)",
                    opacity: isAnimating ? 1 : 0,
                    transition: "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
            >
                {/* ─── Glow top ─── */}
                <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[2px]"
                    style={{
                        background: `linear-gradient(90deg, transparent, ${mode === "register" ? GOLD : CYAN}, transparent)`,
                    }}
                />

                {/* ─── Header ─── */}
                <div className="px-8 pt-8 pb-4 text-center">
                    <div
                        className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                        style={{
                            background: `linear-gradient(135deg, ${GOLD}, #8A2BE2)`,
                            boxShadow: `0 0 20px ${GOLD}40`,
                        }}
                    >
                        <span className="text-lg font-black text-[#0A0A0A]">B</span>
                    </div>
                    <h2 className="text-lg font-bold text-white tracking-wide">
                        {mode === "login" ? "Acceso al Búnker" : mode === "register" ? "Registro Ciudadano" : "Recuperar Acceso"}
                    </h2>
                    <p className="text-[10px] text-gray-500 mt-1 font-mono uppercase tracking-widest">
                        {mode === "login"
                            ? "Identifícate para entrar"
                            : mode === "register"
                                ? "Tu voz tendrá peso. Tu integridad, valor."
                                : "Recibirás un enlace en tu correo"}
                    </p>
                </div>

                {/* ─── Aviso de sesión expirada ─── */}
                {sessionExpired && mode === "login" && (
                    <div className="mx-8 mb-2 rounded-lg px-4 py-2 text-xs font-mono text-center"
                        style={{ backgroundColor: "rgba(255, 170, 0, 0.08)", border: "1px solid rgba(255, 170, 0, 0.3)", color: "#FFAA00" }}>
                        Tu sesión ha expirado. Inicia sesión nuevamente.
                    </div>
                )}

                {/* ─── Toggle Login/Register (oculto en modo forgot) ─── */}
                {!showAdminInterstitial && mode !== "forgot" && (
                    <div className="px-8 pb-4">
                        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                            {(["login", "register"] as const).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                                    className="flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-all duration-300"
                                    style={{
                                        backgroundColor: mode === m ? `${CYAN}15` : "transparent",
                                        color: mode === m ? CYAN : "#666",
                                        borderBottom: mode === m ? `2px solid ${CYAN}` : "2px solid transparent",
                                    }}
                                >
                                    {m === "login" ? "Iniciar Sesión" : "Registrarse"}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══ FORGOT PASSWORD FORM ═══ */}
                {!showAdminInterstitial && mode === "forgot" && (
                    <ForgotPasswordForm
                        onBack={() => { setMode("login"); setError(""); setSuccess(""); }}
                        apiUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
                    />
                )}

                {/* ═══ LOGIN / REGISTER FORM ═══ */}
                {!showAdminInterstitial && mode !== "forgot" && (
                    <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">

                        {/* ─── Nombre (solo registro) ─── */}
                        {mode === "register" && (
                            <div>
                                <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                    Nombre Completo *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Tu nombre público en Beacon"
                                    className="w-full text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200"
                                    style={inputStyle()}
                                    onFocus={(e) => e.target.style.borderColor = `${CYAN}60`}
                                    onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                                />
                            </div>
                        )}

                        {/* ─── Email ─── */}
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Email *
                            </label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="tu@correo.cl"
                                className="w-full text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200"
                                style={inputStyle()}
                                onFocus={(e) => e.target.style.borderColor = `${CYAN}60`}
                                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                            />
                        </div>

                        {/* ─── Contraseña con toggle ojo ─── */}
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Contraseña *
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    minLength={8}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mínimo 8 caracteres"
                                    className="w-full text-sm text-white px-3 py-2.5 pr-10 rounded-lg outline-none font-mono transition-all duration-200"
                                    style={inputStyle()}
                                    onFocus={(e) => e.target.style.borderColor = `${CYAN}60`}
                                    onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity duration-200"
                                    style={{ color: showPassword ? CYAN : "#555", opacity: showPassword ? 1 : 0.6 }}
                                    tabIndex={-1}
                                >
                                    <EyeIcon open={showPassword} />
                                </button>
                            </div>
                            {mode === "register" && (
                                <>
                                    <div className="mt-2 font-mono grid grid-cols-2 gap-x-3 gap-y-1.5">
                                        {[
                                            { ok: pwdValidations.length, label: "Min 8 caracteres" },
                                            { ok: pwdValidations.upper, label: "Una mayúscula" },
                                            { ok: pwdValidations.number, label: "Un número" },
                                            { ok: pwdValidations.special, label: "Carácter (@#$%&*)" },
                                        ].map(({ ok, label }) => (
                                            <span
                                                key={label}
                                                className="flex items-center gap-1.5 text-[11px] font-semibold transition-colors duration-200"
                                                style={{ color: ok ? CYAN : RED }}
                                            >
                                                <span className="text-[13px] leading-none">{ok ? "✓" : "✗"}</span>
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                    {/* Aviso visible cuando hay requisitos sin cumplir y el usuario ya escribió algo */}
                                    {password.length > 0 && !Object.values(pwdValidations).every(Boolean) && (
                                        <p
                                            className="mt-2 text-[10px] font-mono px-2.5 py-1.5 rounded-lg"
                                            style={{
                                                backgroundColor: `${RED}10`,
                                                color: RED,
                                                border: `1px solid ${RED}25`,
                                            }}
                                        >
                                            ✗ Completa los requisitos en rojo para continuar
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        {/* ─── Confirmar Contraseña (solo registro) ─── */}
                        {mode === "register" && (
                            <div>
                                <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                    Confirmar Contraseña *
                                </label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        required
                                        minLength={8}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Repite tu contraseña"
                                        className="w-full text-sm text-white px-3 py-2.5 pr-10 rounded-lg outline-none font-mono transition-all duration-200"
                                        style={{
                                            ...inputStyle(),
                                            borderColor: confirmPassword.length > 0 && confirmPassword !== password
                                                ? `${RED}60`
                                                : confirmPassword.length > 0 && confirmPassword === password
                                                    ? `${GOLD}40`
                                                    : "rgba(255,255,255,0.1)",
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity duration-200"
                                        style={{ color: showConfirmPassword ? CYAN : "#555", opacity: showConfirmPassword ? 1 : 0.6 }}
                                        tabIndex={-1}
                                    >
                                        <EyeIcon open={showConfirmPassword} />
                                    </button>
                                </div>
                                {confirmPassword.length > 0 && confirmPassword !== password && (
                                    <p className="text-[9px] font-mono mt-1" style={{ color: RED }}>
                                        Las contraseñas no coinciden
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ═══ CAMPOS EXTENDIDOS (solo registro) ═══ */}
                        {mode === "register" && (
                            <>
                                        {/* ─── Selectores en Cascada: País → Región → Comuna ─── */}

                                {/* País */}
                                <div>
                                    <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                        País *
                                    </label>
                                    <select
                                        value={country}
                                        onChange={(e) => setCountry(e.target.value)}
                                        required
                                        className="w-full text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200 appearance-none"
                                        style={{
                                            backgroundColor: "#0F0F0F",
                                            border: `1px solid ${country ? `${CYAN}30` : "rgba(255,255,255,0.1)"}`,
                                        }}
                                    >
                                        <option value="">Seleccionar</option>
                                        {COUNTRIES.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {/* Región (dependiente de País) */}
                                    <div>
                                        <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                            Región *
                                        </label>
                                        <select
                                            value={region}
                                            onChange={(e) => setRegion(e.target.value)}
                                            required
                                            disabled={!country}
                                            className="w-full text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200 appearance-none disabled:opacity-40"
                                            style={{
                                                backgroundColor: "#0F0F0F",
                                                border: `1px solid ${region ? `${CYAN}30` : "rgba(255,255,255,0.1)"}`,
                                            }}
                                        >
                                            <option value="">{country ? "Seleccionar" : "Elige país"}</option>
                                            {availableRegiones.map((r) => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Comuna (dependiente de Región) */}
                                    <div>
                                        <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                            Comuna *
                                        </label>
                                        <select
                                            value={commune}
                                            onChange={(e) => setCommune(e.target.value)}
                                            required
                                            disabled={!region}
                                            className="w-full text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200 appearance-none disabled:opacity-40"
                                            style={{
                                                backgroundColor: "#0F0F0F",
                                                border: `1px solid ${commune ? `${CYAN}30` : "rgba(255,255,255,0.1)"}`,
                                            }}
                                        >
                                            <option value="">{region ? "Seleccionar" : "Elige región"}</option>
                                            {availableCommunas.map((c) => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* ─── Rango Etario ─── */}
                                <div>
                                    <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                        Rango Etario *
                                    </label>
                                    <select
                                        value={ageRange}
                                        onChange={(e) => setAgeRange(e.target.value)}
                                        required
                                        className="w-full text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200 appearance-none"
                                        style={{
                                            backgroundColor: "#0F0F0F",
                                            border: `1px solid ${ageRange ? `${CYAN}30` : "rgba(255,255,255,0.1)"}`,
                                        }}
                                    >
                                        <option value="">Seleccionar</option>
                                        <option value="18-24">18 - 24</option>
                                        <option value="25-34">25 - 34</option>
                                        <option value="35-44">35 - 44</option>
                                        <option value="45-54">45 - 54</option>
                                        <option value="55-64">55 - 64</option>
                                        <option value="65+">65+</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {/* ─── Error / Success ─── */}
                        {error && (
                            <div
                                className="text-[10px] font-mono px-3 py-2 rounded-lg"
                                style={{
                                    backgroundColor: `${RED}10`,
                                    color: RED,
                                    border: `1px solid ${RED}20`,
                                }}
                            >
                                {error}
                            </div>
                        )}
                        {success && (
                            <div
                                className="text-[10px] font-mono px-3 py-2 rounded-lg"
                                style={{
                                    backgroundColor: `${GOLD}15`,
                                    color: GOLD,
                                    border: `1px solid ${GOLD}30`,
                                }}
                            >
                                {success}
                            </div>
                        )}

                        {/* ─── Submit Button (deshabilitado si formulario incompleto) ─── */}
                        <button
                            type="submit"
                            disabled={loading || !isFormValid}
                            className="w-full py-3 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                            style={{
                                background: isFormValid
                                    ? `linear-gradient(135deg, ${GOLD}, #8A2BE2)`
                                    : "rgba(50,50,50,0.5)",
                                boxShadow: isFormValid
                                    ? `0 0 20px ${GOLD}20, 0 0 20px rgba(138, 43, 226, 0.2)`
                                    : "none",
                            }}
                        >
                            {loading
                                ? "Procesando..."
                                : mode === "login"
                                    ? "Entrar al Búnker"
                                    : "Registrar Ciudadano"
                            }
                        </button>

                        {/* Footer hint */}
                        <p className="text-center text-[9px] text-gray-600 font-mono">
                            {mode === "login" ? (
                                <>
                                    ¿No tienes cuenta? Cambia a «Registrarse» arriba.
                                    <br />
                                    <button
                                        type="button"
                                        onClick={() => setMode("forgot")}
                                        className="mt-1 hover:text-white transition-colors"
                                        style={{ color: "#00E5FF" }}
                                    >
                                        ¿Olvidaste tu contraseña?
                                    </button>
                                </>
                            ) : mode === "register" ? (
                                "Al registrarte aceptas el Protocolo de Integridad."
                            ) : null}
                        </p>
                    </form>
                )}

                {/* ═══ ADMIN INTERSTITIAL ═══ */}
                {showAdminInterstitial && (
                    <div className="px-8 pb-8 animate-fade-in text-center">
                        <p className="text-sm text-gray-300 mb-6 font-mono leading-relaxed">
                            Detectada llave de acceso de <span style={{ color: GOLD }}>Seguridad Nivel 5</span>.
                            <br />
                            Selecciona tu vector de entrada:
                        </p>

                        <div className="grid grid-cols-1 gap-4">
                            {/* Modo Búnker (Admin) */}
                            <a
                                href="/admin"
                                className="relative p-5 rounded-xl border transition-all duration-300 group overflow-hidden"
                                style={{
                                    borderColor: `${GOLD}40`,
                                    background: `linear-gradient(135deg, rgba(212,175,55,0.05), rgba(212,175,55,0.1))`,
                                }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(212,175,55,0.1)] to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                                <div className="relative z-10 flex items-center justify-between">
                                    <div className="text-left">
                                        <h3 className="text-sm font-bold tracking-wider uppercase mb-1" style={{ color: GOLD }}>Modo Admin</h3>
                                        <p className="text-[10px] text-gray-400 font-mono">Sovereign Dashboard · Gestión Total</p>
                                    </div>
                                    <span className="text-2xl filter grayscale group-hover:grayscale-0 transition-all duration-300">🛡️</span>
                                </div>
                            </a>

                            {/* Modo Pruebas (Usuario Elite) */}
                            <button
                                onClick={onClose}
                                className="relative p-5 rounded-xl border transition-all duration-300 group text-left overflow-hidden"
                                style={{
                                    borderColor: `${CYAN}40`,
                                    background: `linear-gradient(135deg, rgba(0,229,255,0.05), rgba(0,229,255,0.1))`,
                                }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(0,229,255,0.1)] to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                                <div className="relative z-10 flex items-center justify-between">
                                    <div className="text-left">
                                        <h3 className="text-sm font-bold tracking-wider uppercase mb-1" style={{ color: CYAN }}>Modo Pruebas</h3>
                                        <p className="text-[10px] text-gray-400 font-mono">Vista de Ciudadano · Diamond Rank</p>
                                    </div>
                                    <span className="text-2xl filter grayscale group-hover:grayscale-0 transition-all duration-300">💎</span>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── Close button ─── */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors"
                    aria-label="Cerrar"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
