/**
 * BEACON PROTOCOL — Auth Modal (La Puerta del Búnker)
 * =====================================================
 * Modal de Login/Registro con estética Dark Premium.
 *
 * Características:
 *   - Fondo cristal oscuro (backdrop-blur)
 *   - Bordes Cian (#00E5FF) para foco
 *   - Bordes Oro (#D4AF37) para campos de identidad verificada
 *   - Animación Fade-in-scale
 *   - Validación local RUT Módulo 11 con feedback visual
 *   - Toggle Login ↔ Registro sin recargar
 *
 * "El que quiera hablar, primero debe demostrar que es real."
 */

"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Validación RUT Módulo 11 (local, sin servidor) ───
function validateRutMod11(rut: string): { valid: boolean; formatted: string } {
    // Limpiar: solo números y K/k
    const clean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
    if (clean.length < 2) return { valid: false, formatted: "" };

    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);

    // Calcular dígito verificador
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

    // Formatear: 12.345.678-5
    const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;

    return { valid: dv === expectedDV, formatted };
}

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [isAnimating, setIsAnimating] = useState(false);

    // ─── Form State ───
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [commune, setCommune] = useState("");
    const [region, setRegion] = useState("");
    const [ageRange, setAgeRange] = useState("");

    // ─── RUT State ───
    const [rut, setRut] = useState("");
    const [rutValid, setRutValid] = useState<boolean | null>(null);
    const [rutFormatted, setRutFormatted] = useState("");

    // ─── UI State ───
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

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

    // Validación RUT en tiempo real
    const handleRutChange = useCallback((value: string) => {
        setRut(value);
        if (value.length >= 2) {
            const result = validateRutMod11(value);
            setRutValid(result.valid);
            setRutFormatted(result.formatted);
        } else {
            setRutValid(null);
            setRutFormatted("");
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        setLoading(true);

        const startTime = performance.now();

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

            if (mode === "login") {
                const res = await fetch(`${API_URL}/api/v1/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || "Credenciales inválidas");
                }

                const data = await res.json();
                // Guardar token (en producción usar httpOnly cookies)
                localStorage.setItem("beacon_token", data.access_token);
                localStorage.setItem("beacon_user", JSON.stringify(data.user));
                setSuccess(`Bienvenido, ${data.user.full_name}. Rango: ${data.user.rank}`);
                setTimeout(() => onClose(), 1500);
            } else {
                // Registro
                const fillDuration = (performance.now() - startTime) / 1000;

                const res = await fetch(`${API_URL}/api/v1/auth/register`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-fill-duration": fillDuration.toString(),
                    },
                    body: JSON.stringify({
                        email,
                        full_name: fullName,
                        password,
                        commune: commune || undefined,
                        region: region || undefined,
                        age_range: ageRange || undefined,
                    }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || "Error en el registro");
                }

                setSuccess("Ciudadano registrado. Rango inicial: BRONZE. Verifica tu email.");
                setTimeout(() => setMode("login"), 2000);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error interno del servidor");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const cianColor = "#00E5FF";
    const goldColor = "#D4AF37";

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
                className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden"
                style={{
                    background: "rgba(15, 15, 15, 0.95)",
                    border: `1px solid ${mode === "register" ? goldColor : cianColor}30`,
                    boxShadow: `0 0 40px ${mode === "register" ? goldColor : cianColor}10,
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
                        background: `linear-gradient(90deg, transparent, ${mode === "register" ? goldColor : cianColor}, transparent)`,
                    }}
                />

                {/* ─── Header ─── */}
                <div className="px-8 pt-8 pb-4 text-center">
                    <div
                        className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                        style={{
                            background: `linear-gradient(135deg, ${goldColor}, #8A2BE2)`,
                            boxShadow: `0 0 20px ${goldColor}40`,
                        }}
                    >
                        <span className="text-lg font-black text-[#0A0A0A]">B</span>
                    </div>
                    <h2 className="text-lg font-bold text-white tracking-wide">
                        {mode === "login" ? "Acceso al Búnker" : "Registro Ciudadano"}
                    </h2>
                    <p className="text-[10px] text-gray-500 mt-1 font-mono uppercase tracking-widest">
                        {mode === "login"
                            ? "Identifícate para entrar"
                            : "Tu voz tendrá peso. Tu integridad, valor."}
                    </p>
                </div>

                {/* ─── Toggle Login/Register ─── */}
                <div className="px-8 pb-4">
                    <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                        {(["login", "register"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                                className="flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-all duration-300"
                                style={{
                                    backgroundColor: mode === m ? `${cianColor}15` : "transparent",
                                    color: mode === m ? cianColor : "#666",
                                    borderBottom: mode === m ? `2px solid ${cianColor}` : "2px solid transparent",
                                }}
                            >
                                {m === "login" ? "Iniciar Sesión" : "Registrarse"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ─── Form ─── */}
                <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">
                    {/* Nombre (solo registro) */}
                    {mode === "register" && (
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Nombre Completo
                            </label>
                            <input
                                type="text"
                                required
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Tu nombre público en Beacon"
                                className="w-full bg-transparent text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200"
                                style={{
                                    border: `1px solid rgba(255,255,255,0.1)`,
                                    caretColor: cianColor,
                                }}
                                onFocus={(e) => e.target.style.borderColor = `${cianColor}60`}
                                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                            />
                        </div>
                    )}

                    {/* Email */}
                    <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="tu@correo.cl"
                            className="w-full bg-transparent text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200"
                            style={{
                                border: `1px solid rgba(255,255,255,0.1)`,
                                caretColor: cianColor,
                            }}
                            onFocus={(e) => e.target.style.borderColor = `${cianColor}60`}
                            onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                            Contraseña
                        </label>
                        <input
                            type="password"
                            required
                            minLength={8}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Mínimo 8 caracteres"
                            className="w-full bg-transparent text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200"
                            style={{
                                border: `1px solid rgba(255,255,255,0.1)`,
                                caretColor: cianColor,
                            }}
                            onFocus={(e) => e.target.style.borderColor = `${cianColor}60`}
                            onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                        />
                    </div>

                    {/* Campos extendidos (solo registro) */}
                    {mode === "register" && (
                        <>
                            {/* RUT con validación Módulo 11 */}
                            <div>
                                <label className="block text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: goldColor }}>
                                    RUT (Opcional — verifica después)
                                </label>
                                <input
                                    type="text"
                                    value={rut}
                                    onChange={(e) => handleRutChange(e.target.value)}
                                    placeholder="12.345.678-5"
                                    className="w-full bg-transparent text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200"
                                    style={{
                                        border: `1px solid ${rutValid === null
                                                ? "rgba(255,255,255,0.1)"
                                                : rutValid
                                                    ? `${goldColor}80`
                                                    : "#FF073A80"
                                            }`,
                                        caretColor: goldColor,
                                    }}
                                />
                                {/* Feedback visual RUT */}
                                {rut.length >= 2 && (
                                    <div className="flex items-center gap-2 mt-1">
                                        <span
                                            className="text-[9px] font-mono"
                                            style={{ color: rutValid ? goldColor : "#FF073A" }}
                                        >
                                            {rutValid ? `✓ ${rutFormatted} — Módulo 11 válido` : "✗ Dígito verificador inválido"}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Comuna y Región en fila */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                        Comuna
                                    </label>
                                    <input
                                        type="text"
                                        value={commune}
                                        onChange={(e) => setCommune(e.target.value)}
                                        placeholder="Providencia"
                                        className="w-full bg-transparent text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200"
                                        style={{
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            caretColor: cianColor,
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = `${cianColor}60`}
                                        onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                        Región
                                    </label>
                                    <input
                                        type="text"
                                        value={region}
                                        onChange={(e) => setRegion(e.target.value)}
                                        placeholder="Metropolitana"
                                        className="w-full bg-transparent text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200"
                                        style={{
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            caretColor: cianColor,
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = `${cianColor}60`}
                                        onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                                    />
                                </div>
                            </div>

                            {/* Rango etario */}
                            <div>
                                <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                    Rango Etario
                                </label>
                                <select
                                    value={ageRange}
                                    onChange={(e) => setAgeRange(e.target.value)}
                                    className="w-full bg-[#0F0F0F] text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200"
                                    style={{
                                        border: "1px solid rgba(255,255,255,0.1)",
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

                    {/* Error / Success */}
                    {error && (
                        <div
                            className="text-[10px] font-mono px-3 py-2 rounded-lg"
                            style={{
                                backgroundColor: "rgba(255, 7, 58, 0.1)",
                                color: "#FF073A",
                                border: "1px solid rgba(255, 7, 58, 0.2)",
                            }}
                        >
                            {error}
                        </div>
                    )}
                    {success && (
                        <div
                            className="text-[10px] font-mono px-3 py-2 rounded-lg"
                            style={{
                                backgroundColor: `${goldColor}15`,
                                color: goldColor,
                                border: `1px solid ${goldColor}30`,
                            }}
                        >
                            {success}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            background: `linear-gradient(135deg, ${goldColor}, #8A2BE2)`,
                            boxShadow: `0 0 20px ${goldColor}20, 0 0 20px rgba(138, 43, 226, 0.2)`,
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
                        {mode === "login"
                            ? "¿No tienes cuenta? Cambia a «Registrarse» arriba."
                            : "Al registrarte aceptas el Protocolo de Integridad."}
                    </p>
                </form>

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
