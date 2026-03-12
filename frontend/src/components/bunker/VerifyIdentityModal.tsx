/**
 * BEACON PROTOCOL — VerifyIdentityModal (P5)
 * =============================================
 * Modal de verificación de identidad via RUT chileno.
 * Valida módulo 11 en el cliente y envía POST /verify-identity al backend.
 * En éxito actualiza el store Zustand y el localStorage legacy.
 */

"use client";

import { useState } from "react";
import { useAuthStore } from "@/store";

// ─── Utilidades RUT Módulo 11 ────────────────────────────────────────────────

function cleanRut(rut: string): string {
    return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

function formatRut(raw: string): string {
    const clean = cleanRut(raw);
    if (clean.length < 2) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${formatted}-${dv}`;
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

// ─── Componente ──────────────────────────────────────────────────────────────

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function VerifyIdentityModal({ isOpen, onClose }: Props) {
    const { token, user, setAuth } = useAuthStore();

    const [rut, setRut] = useState("");
    const [rutError, setRutError] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<{ new_rank: string; message: string } | null>(null);
    const [serverError, setServerError] = useState("");

    if (!isOpen) return null;

    const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setRut(formatRut(raw));
        setRutError("");
        setServerError("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setRutError("");
        setServerError("");

        const clean = cleanRut(rut);
        if (!validateRut(clean)) {
            setRutError("RUT inválido. Verifica el dígito verificador.");
            return;
        }

        if (!token) {
            setServerError("Sesión expirada. Vuelve a iniciar sesión.");
            return;
        }

        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
            const res = await fetch(`${apiUrl}/api/v1/user/auth/verify-identity`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ rut }),
            });

            const data = await res.json();

            if (!res.ok) {
                setServerError(data.detail ?? "Error al verificar. Intenta más tarde.");
                return;
            }

            // Actualiza store Zustand + localStorage legacy
            if (user) {
                const updatedUser = { ...user, rank: data.new_rank as typeof user.rank };
                setAuth(token, updatedUser);
                try {
                    localStorage.setItem("beacon_user", JSON.stringify(updatedUser));
                } catch {
                    // SSR guard
                }
            }

            setSuccess({ new_rank: data.new_rank, message: data.message });
            setTimeout(() => {
                setSuccess(null);
                setRut("");
                onClose();
            }, 3000);

        } catch {
            setServerError("Error de conexión. Intenta más tarde.");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setRut("");
        setRutError("");
        setServerError("");
        setSuccess(null);
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
            onClick={handleClose}
        >
            <div
                className="relative w-full max-w-md rounded-2xl p-8 shadow-2xl"
                style={{
                    background: "rgba(10,10,10,0.95)",
                    border: "1px solid rgba(212,175,55,0.25)",
                    boxShadow: "0 0 40px rgba(212,175,55,0.08)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Cerrar */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-5 text-foreground-muted hover:text-foreground text-xl transition-colors"
                    aria-label="Cerrar"
                >
                    ×
                </button>

                {/* Éxito */}
                {success ? (
                    <div className="text-center py-4">
                        <div className="text-5xl mb-4">✅</div>
                        <h2 className="text-xl font-bold text-white mb-2">
                            {success.new_rank === "VERIFIED" ? "¡Identidad Verificada!" : "RUT registrado"}
                        </h2>
                        <p className="text-sm text-foreground-muted mb-1">{success.message}</p>
                        {success.new_rank === "VERIFIED" && (
                            <p className="text-sm font-semibold" style={{ color: "#4dff83" }}>
                                Tu voto ahora vale <strong>1.0x</strong> 🎉
                            </p>
                        )}
                        {success.new_rank !== "VERIFIED" && (
                            <p className="text-xs text-amber-400 mt-2">
                                Completa año de nacimiento, país, región y comuna en tu perfil para subir a VERIFIED.
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="text-center mb-6">
                            <div className="text-4xl mb-3">🔏</div>
                            <h2 className="text-xl font-bold text-white">Verificar Identidad</h2>
                            <p className="text-xs text-foreground-muted mt-1">
                                Tu RUT se almacena solo como hash irreversible. Nunca lo vemos en texto plano.
                            </p>
                        </div>

                        {/* Formulario */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-foreground-muted mb-1 uppercase tracking-wider">
                                    RUT chileno
                                </label>
                                <input
                                    type="text"
                                    value={rut}
                                    onChange={handleRutChange}
                                    placeholder="12.345.678-9"
                                    maxLength={12}
                                    className="w-full px-4 py-3 rounded-lg text-sm font-mono text-white bg-transparent outline-none transition-all"
                                    style={{
                                        border: rutError
                                            ? "1px solid rgba(255,80,80,0.6)"
                                            : "1px solid rgba(255,255,255,0.12)",
                                        background: "rgba(255,255,255,0.04)",
                                    }}
                                    autoComplete="off"
                                    autoFocus
                                />
                                {rutError && (
                                    <p className="text-xs mt-1" style={{ color: "#ff5050" }}>
                                        {rutError}
                                    </p>
                                )}
                            </div>

                            {serverError && (
                                <p className="text-xs text-center" style={{ color: "#ff5050" }}>
                                    {serverError}
                                </p>
                            )}

                            <p className="text-[10px] text-foreground-muted text-center">
                                Al verificar aceptas que BEACON almacene tu hash de identidad para prevenir votos duplicados.
                            </p>

                            <button
                                type="submit"
                                disabled={loading || !rut}
                                className="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-widest transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                                style={{
                                    background: "linear-gradient(135deg, #D4AF37, #B8860B)",
                                    color: "#0a0a0a",
                                }}
                            >
                                {loading ? "Verificando..." : "Verificar identidad"}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
