/**
 * BEACON PROTOCOL — Auth Callback (La Puerta de Verificación)
 * ===========================================================
 * Página que Supabase redirige después de que el usuario
 * hace clic en el enlace de confirmación de email.
 *
 * Flujo:
 *   1. El usuario hace clic en el link del email de Supabase.
 *   2. Supabase redirige a /auth/callback con token_hash + type en URL.
 *   3. Esta página detecta los parámetros y confirma al backend.
 *   4. Muestra estado: verificando → éxito → redirección al inicio.
 */

"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

// ───────────────────────────────────
//  ÍCONOS SVG
// ───────────────────────────────────

function CheckIcon() {
    return (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
        </svg>
    );
}

function SpinnerIcon() {
    return (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: "spin 1s linear infinite" }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
}

function ErrorIcon() {
    return (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
    );
}

// ───────────────────────────────────
//  COMPONENTE INTERNO (usa useSearchParams)
// ───────────────────────────────────

type Status = "loading" | "success" | "error";

function CallbackContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [status, setStatus] = useState<Status>("loading");
    const [message, setMessage] = useState("Verificando tu identidad en el Búnker...");
    const [countdown, setCountdown] = useState(5);

    const CYAN = "#00E5FF";
    const GOLD = "#D4AF37";
    const RED = "#FF073A";

    useEffect(() => {
        const verifyToken = async () => {
            // Supabase puede enviar el token de dos formas:
            // 1. ?token_hash=xxx&type=signup  (modo PKCE / OTP)
            // 2. #access_token=xxx&type=signup (modo implícito — legado)
            const tokenHash = searchParams.get("token_hash");
            const type = searchParams.get("type");
            const errorDescription = searchParams.get("error_description");

            // Si Supabase devolvió error en la URL
            if (errorDescription) {
                setStatus("error");
                setMessage(decodeURIComponent(errorDescription));
                return;
            }

            if (tokenHash && type) {
                // ─── Modo OTP/PKCE (recomendado por Supabase) ───
                // Llamamos al backend para verificar el token
                try {
                    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                    const res = await fetch(`${API_URL}/api/v1/user/auth/confirm-email`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token_hash: tokenHash, type }),
                    });

                    if (res.ok) {
                        setStatus("success");
                        setMessage("¡Email confirmado! Tu cuenta en el Búnker está activa.");
                    } else {
                        const data = await res.json().catch(() => ({}));
                        setStatus("error");
                        setMessage(data.detail || "El enlace de confirmación no es válido o ya expiró.");
                    }
                } catch {
                    setStatus("error");
                    setMessage("Error de conexión al verificar tu identidad. Intenta nuevamente.");
                }
            } else if (typeof window !== "undefined") {
                // ─── Modo implícito: verificar si hay hash en la URL ───
                const hash = window.location.hash;
                if (hash.includes("access_token") && hash.includes("type=signup")) {
                    // El token de Supabase ya está en el hash — sesión auto-activada
                    setStatus("success");
                    setMessage("¡Email confirmado! Tu cuenta en el Búnker está activa.");
                } else if (hash.includes("type=recovery")) {
                    // Flujo de recuperación de contraseña — redirigir
                    router.replace("/");
                    return;
                } else {
                    // Llegó sin parámetros válidos
                    setStatus("error");
                    setMessage("Enlace de confirmación inválido o ya utilizado.");
                }
            }
        };

        verifyToken();
    }, [searchParams, router]);

    // Countdown y redirección automática en éxito
    useEffect(() => {
        if (status !== "success") return;
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
    }, [status, router]);

    const iconColor = status === "loading" ? CYAN : status === "success" ? GOLD : RED;
    const icon = status === "loading" ? <SpinnerIcon /> : status === "success" ? <CheckIcon /> : <ErrorIcon />;

    return (
        <main
            className="min-h-screen flex items-center justify-center px-4"
            style={{ background: "radial-gradient(ellipse at center, #0a0a0f 0%, #050508 100%)" }}
        >
            {/* Fondo decorativo */}
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(0,229,255,0.015) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0,229,255,0.015) 1px, transparent 1px)
                    `,
                    backgroundSize: "40px 40px",
                }}
            />

            <div
                className="relative w-full max-w-sm rounded-2xl overflow-hidden text-center"
                style={{
                    background: "rgba(15, 15, 15, 0.98)",
                    border: `1px solid ${iconColor}20`,
                    boxShadow: `0 0 60px ${iconColor}10, 0 24px 48px rgba(0,0,0,0.6)`,
                }}
            >
                {/* Línea superior */}
                <div
                    className="absolute top-0 left-0 right-0 h-[2px]"
                    style={{
                        background: `linear-gradient(90deg, transparent, ${iconColor}, transparent)`,
                    }}
                />

                <div className="px-8 py-12">
                    {/* Logo */}
                    <div
                        className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-6"
                        style={{
                            background: `linear-gradient(135deg, ${GOLD}, #8A2BE2)`,
                            boxShadow: `0 0 20px ${GOLD}40`,
                        }}
                    >
                        <span className="text-lg font-black text-[#0A0A0A]">B</span>
                    </div>

                    {/* Ícono de estado */}
                    <div
                        className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
                        style={{
                            color: iconColor,
                            backgroundColor: `${iconColor}10`,
                            border: `1px solid ${iconColor}30`,
                        }}
                    >
                        {icon}
                    </div>

                    {/* Título */}
                    <h1
                        className="text-lg font-bold tracking-wider uppercase mb-2"
                        style={{ color: iconColor }}
                    >
                        {status === "loading"
                            ? "Verificando..."
                            : status === "success"
                                ? "¡Identidad Confirmada!"
                                : "Error de Verificación"}
                    </h1>

                    {/* Mensaje */}
                    <p className="text-sm text-gray-400 font-mono leading-relaxed mb-6">
                        {message}
                    </p>

                    {/* Countdown (solo en éxito) */}
                    {status === "success" && (
                        <p className="text-[10px] font-mono" style={{ color: CYAN }}>
                            Redirigiendo al inicio en{" "}
                            <span className="font-bold">{countdown}s</span>...
                        </p>
                    )}

                    {/* Botón de reintento (solo en error) */}
                    {status === "error" && (
                        <div className="space-y-3">
                            <button
                                onClick={() => router.replace("/")}
                                className="w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white transition-all duration-300 hover:scale-[1.02]"
                                style={{
                                    background: `linear-gradient(135deg, ${GOLD}, #8A2BE2)`,
                                    boxShadow: `0 0 20px ${GOLD}20`,
                                }}
                            >
                                Volver al Inicio
                            </button>
                            <p className="text-[9px] font-mono text-gray-600">
                                ¿El enlace expiró? Regístrate nuevamente.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    className="px-8 py-3 text-center"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                >
                    <p className="text-[9px] font-mono text-gray-700 uppercase tracking-widest">
                        Beacon Protocol · Puerta de Verificación
                    </p>
                </div>
            </div>

            {/* Estilos globales para la animación del spinner */}
            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </main>
    );
}

// ───────────────────────────────────
//  EXPORT con Suspense (requerido por useSearchParams)
// ───────────────────────────────────

export default function AuthCallbackPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen flex items-center justify-center"
                    style={{ background: "#050508" }}>
                    <p className="text-gray-500 font-mono text-sm">Cargando verificación...</p>
                </main>
            }
        >
            <CallbackContent />
        </Suspense>
    );
}
