/**
 * BEACON PROTOCOL — BasicUserBanner (La Llamada a la Verificación)
 * =================================================================
 * Banner sticky que aparece para usuarios BASIC.
 * Desaparece automáticamente cuando el usuario alcanza VERIFIED.
 *
 * UX: No es molesto — es informativo y tiene un CTA claro.
 * "🔒 Tu voto vale 0.5x. Verifica tu identidad y valdrá el doble."
 */

"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store";

const GOLD   = "#D4AF37";
const AMBER  = "#FF8C00";

interface BasicUserBannerProps {
    /** Callback para abrir el modal de perfil/verificación */
    onVerifyClick?: () => void;
}

export default function BasicUserBanner({ onVerifyClick }: BasicUserBannerProps) {
    const { user } = useAuthStore();
    // Lazy: leer sessionStorage una sola vez en mount para evitar setState-in-effect
    const [dismissed, setDismissed] = useState(
        () => typeof window !== "undefined" && sessionStorage.getItem("beacon_banner_dismissed") === "true"
    );
    const [isMobile, setIsMobile] = useState(false);

    // Detectar mobile sin hydration mismatch
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const isBasicUser = !!user && user.rank === "BASIC";

    const handleDismiss = () => {
        sessionStorage.setItem("beacon_banner_dismissed", "true");
        setDismissed(true);
    };

    if (!isBasicUser || dismissed) return null;

    return (
        <div
            role="banner"
            style={{
                position: "fixed",
                top: "68px",
                left: 0,
                right: 0,
                zIndex: 45,
                background: `linear-gradient(90deg, rgba(255,140,0,0.15), rgba(212,175,55,0.15), rgba(255,140,0,0.15))`,
                borderBottom: `1px solid ${AMBER}40`,
                backdropFilter: "blur(8px)",
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
            }}
        >
            {/* Mensaje principal */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "auto" }}>
                <span style={{ fontSize: "16px", flexShrink: 0 }}>🔒</span>
                <span style={{ color: "#E0E0E0", fontSize: "12px", lineHeight: "1.3" }}>
                    <strong style={{ color: AMBER }}>Tu voto aparece en el conteo público</strong>
                    {" — "}
                    <strong style={{ color: GOLD }}>verifica RUT al 100%</strong>
                </span>
            </div>

            {/* Acciones */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                <button
                    onClick={onVerifyClick}
                    style={{
                        background: `linear-gradient(135deg, ${AMBER}, ${GOLD})`,
                        color: "#000",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px 12px",
                        fontSize: "11px",
                        fontWeight: "700",
                        cursor: "pointer",
                        letterSpacing: "0.3px",
                        whiteSpace: "nowrap",
                        transition: "opacity 0.2s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                    Verificar →
                </button>

                <button
                    onClick={handleDismiss}
                    aria-label="Cerrar aviso"
                    style={{
                        background: "transparent",
                        color: "#757575",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "18px",
                        lineHeight: "1",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        transition: "color 0.2s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#E0E0E0")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#757575")}
                >
                    ×
                </button>
            </div>
        </div>
    );
}
