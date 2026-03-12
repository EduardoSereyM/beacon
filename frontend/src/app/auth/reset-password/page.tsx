/**
 * BEACON PROTOCOL — Reset Password (Nueva Contraseña)
 * ====================================================
 * Segunda fase del flujo de recuperación.
 *
 * Supabase redirige aquí con ?token_hash=xxx&type=recovery
 * después de que el ciudadano hace clic en el email.
 *
 * Flujo:
 *   1. Lee token_hash + type de la URL
 *   2. Muestra formulario con nueva contraseña + confirmación
 *   3. POST /api/v1/user/auth/reset-password con token + nueva clave
 *   4. Éxito → redirige al inicio para iniciar sesión
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

// ───────────────────────────────────
//  ICONOS SVG
// ───────────────────────────────────

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

// ───────────────────────────────────
//  COMPONENTE PRINCIPAL (dentro de Suspense)
// ───────────────────────────────────

function ResetPasswordContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const CYAN = "#00E5FF";
    const GOLD = "#D4AF37";
    const RED = "#FF073A";

    // ─── Estado del token ───
    // tokenHash → flujo OTP (query param token_hash)
    // accessToken → flujo implícito (hash fragment access_token)
    const [tokenHash, setTokenHash] = useState<string | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [tokenError, setTokenError] = useState("");

    // ─── Estado del formulario ───
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");
    const [countdown, setCountdown] = useState(5);

    // ─── Validaciones de contraseña ───
    const pwdValidations = useMemo(() => ({
        length: newPassword.length >= 8,
        upper: /[A-Z]/.test(newPassword),
        number: /[0-9]/.test(newPassword),
        special: /[@#$%&*]/.test(newPassword),
    }), [newPassword]);

    const isPwdValid = Object.values(pwdValidations).every(Boolean);
    const isFormValid = isPwdValid && newPassword === confirmPassword && !!(tokenHash || accessToken);

    // ─── Leer token_hash de la URL ───
    useEffect(() => {
        const hash = searchParams.get("token_hash");
        const type = searchParams.get("type");
        const errorDesc = searchParams.get("error_description");

        if (errorDesc) {
            setTokenError(decodeURIComponent(errorDesc));
            return;
        }

        if (hash && type === "recovery") {
            // Flujo OTP: token_hash en query params
            setTokenHash(hash);
        } else if (typeof window !== "undefined") {
            // Flujo implícito: Supabase redirige con #access_token=xxx&type=recovery
            const urlHash = window.location.hash.substring(1);
            const params = new URLSearchParams(urlHash);
            const at = params.get("access_token");
            const hashType = params.get("type");
            if (at && hashType === "recovery") {
                setAccessToken(at);
                // Limpiar el hash de la URL para no exponer el token
                window.history.replaceState(null, "", window.location.pathname);
            } else {
                setTokenError("Enlace de recuperación inválido o expirado. Solicita uno nuevo.");
            }
        }
    }, [searchParams]);

    // ─── Countdown tras éxito ───
    useEffect(() => {
        if (!success) return;
        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    router.replace("/");
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [success, router]);

    // ─── Submit ───
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid) return;
        setLoading(true);
        setError("");

        try {
            const body = accessToken
                ? { access_token: accessToken, new_password: newPassword }
                : { token_hash: tokenHash, new_password: newPassword };

            const res = await fetch(`${API_URL}/api/v1/user/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error al restablecer contraseña");
            setSuccess(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full text-sm text-white px-3 py-2.5 rounded-lg outline-none font-mono transition-all duration-200";
    const inputStyle: React.CSSProperties = {
        backgroundColor: "transparent",
        border: "1px solid rgba(255,255,255,0.1)",
        caretColor: CYAN,
    };

    // ─── Pantalla de error de token ───
    if (tokenError) {
        return (
            <main className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0A0A0A" }}>
                <div
                    className="w-full max-w-sm rounded-2xl p-8 text-center"
                    style={{
                        background: "rgba(15,15,15,0.98)",
                        border: `1px solid ${RED}20`,
                        boxShadow: `0 0 40px ${RED}08`,
                    }}
                >
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                        style={{ background: `linear-gradient(135deg, ${GOLD}, #8A2BE2)` }}>
                        <span className="text-lg font-black text-[#0A0A0A]">B</span>
                    </div>
                    <h2 className="text-base font-bold text-white mb-2 uppercase tracking-wide">
                        Enlace Inválido
                    </h2>
                    <p className="text-sm text-gray-400 font-mono mb-6 leading-relaxed">{tokenError}</p>
                    <button
                        onClick={() => router.replace("/")}
                        className="w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white"
                        style={{ background: `linear-gradient(135deg, ${GOLD}, #8A2BE2)` }}
                    >
                        Volver al Inicio
                    </button>
                </div>
            </main>
        );
    }

    // ─── Pantalla de éxito ───
    if (success) {
        return (
            <main className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0A0A0A" }}>
                <div
                    className="w-full max-w-sm rounded-2xl p-8 text-center"
                    style={{
                        background: "rgba(15,15,15,0.98)",
                        border: `1px solid ${GOLD}25`,
                        boxShadow: `0 0 40px ${GOLD}08`,
                    }}
                >
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                        style={{ background: `linear-gradient(135deg, ${GOLD}, #8A2BE2)`, boxShadow: `0 0 20px ${GOLD}40` }}>
                        <span className="text-lg font-black text-[#0A0A0A]">B</span>
                    </div>
                    <div
                        className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
                        style={{ color: GOLD, backgroundColor: `${GOLD}10`, border: `1px solid ${GOLD}30` }}
                    >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                        </svg>
                    </div>
                    <h2 className="text-base font-bold uppercase tracking-wide mb-2" style={{ color: GOLD }}>
                        ¡Contraseña Actualizada!
                    </h2>
                    <p className="text-sm text-gray-400 font-mono mb-4 leading-relaxed">
                        Tu contraseña fue restablecida correctamente. Ya puedes iniciar sesión.
                    </p>
                    <p className="text-[10px] font-mono mb-6" style={{ color: CYAN }}>
                        Redirigiendo al inicio en <span className="font-bold">{countdown}s</span>...
                    </p>
                    <button
                        onClick={() => router.replace("/")}
                        className="w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white"
                        style={{ background: `linear-gradient(135deg, ${GOLD}, #8A2BE2)` }}
                    >
                        Ir al Inicio
                    </button>
                </div>
            </main>
        );
    }

    // ─── Formulario principal ───
    return (
        <main className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0A0A0A" }}>
            {/* Grid decorativo */}
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(0,229,255,0.012) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0,229,255,0.012) 1px, transparent 1px)
                    `,
                    backgroundSize: "40px 40px",
                }}
            />

            <div
                className="relative w-full max-w-sm rounded-2xl overflow-hidden"
                style={{
                    background: "rgba(15,15,15,0.98)",
                    border: `1px solid ${GOLD}25`,
                    boxShadow: `0 0 40px ${GOLD}08, 0 24px 48px rgba(0,0,0,0.5)`,
                }}
            >
                {/* Glow top */}
                <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-[280px] h-[2px]"
                    style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }}
                />

                <div className="px-8 pt-8 pb-8 space-y-5">
                    {/* Header */}
                    <div className="text-center">
                        <div
                            className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                            style={{
                                background: `linear-gradient(135deg, ${GOLD}, #8A2BE2)`,
                                boxShadow: `0 0 20px ${GOLD}40`,
                            }}
                        >
                            <span className="text-lg font-black text-[#0A0A0A]">B</span>
                        </div>
                        <h1 className="text-base font-bold text-white tracking-wide uppercase">
                            Nueva Contraseña
                        </h1>
                        <p className="text-[10px] text-gray-500 mt-1 font-mono uppercase tracking-widest">
                            Restablecimiento de Acceso
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Nueva contraseña */}
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Nueva Contraseña *
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    minLength={8}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Mínimo 8 caracteres"
                                    className={`${inputClass} pr-10`}
                                    style={inputStyle}
                                    onFocus={(e) => e.target.style.borderColor = `${CYAN}60`}
                                    onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2"
                                    style={{ color: showPassword ? CYAN : "#555" }}
                                    tabIndex={-1}
                                >
                                    <EyeIcon open={showPassword} />
                                </button>
                            </div>

                            {/* Indicadores de complejidad */}
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
                        </div>

                        {/* Confirmar contraseña */}
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Confirmar Contraseña *
                            </label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? "text" : "password"}
                                    required
                                    minLength={8}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repite tu nueva contraseña"
                                    className={`${inputClass} pr-10`}
                                    style={{
                                        ...inputStyle,
                                        borderColor: confirmPassword.length > 0
                                            ? confirmPassword === newPassword ? `${GOLD}40` : `${RED}60`
                                            : "rgba(255,255,255,0.1)",
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2"
                                    style={{ color: showConfirm ? CYAN : "#555" }}
                                    tabIndex={-1}
                                >
                                    <EyeIcon open={showConfirm} />
                                </button>
                            </div>
                            {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                                <p className="text-[9px] font-mono mt-1" style={{ color: RED }}>
                                    Las contraseñas no coinciden
                                </p>
                            )}
                        </div>

                        {/* Error */}
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

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading || !isFormValid}
                            className="w-full py-3 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white transition-all duration-300 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                            style={{
                                background: isFormValid
                                    ? `linear-gradient(135deg, ${GOLD}, #8A2BE2)`
                                    : "rgba(50,50,50,0.5)",
                                boxShadow: isFormValid ? `0 0 20px ${GOLD}20` : "none",
                            }}
                        >
                            {loading ? "Actualizando..." : "Establecer Nueva Contraseña"}
                        </button>

                        <p className="text-center text-[9px] text-gray-600 font-mono">
                            ¿Recordaste tu contraseña?{" "}
                            <button
                                type="button"
                                onClick={() => router.replace("/")}
                                className="hover:text-white transition-colors"
                                style={{ color: CYAN }}
                            >
                                Volver al inicio
                            </button>
                        </p>
                    </form>
                </div>
            </div>
        </main>
    );
}

// ─── Export con Suspense (requerido por useSearchParams) ───
export default function ResetPasswordPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0A" }}>
                    <p className="text-gray-500 font-mono text-sm">Cargando...</p>
                </main>
            }
        >
            <ResetPasswordContent />
        </Suspense>
    );
}
