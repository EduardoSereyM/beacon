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
const NEON  = "#00E5FF";


interface BasicUserBannerProps {
    /** Callback para abrir el modal de perfil/verificación */
    onVerifyClick?: () => void;
}

export default function BasicUserBanner({ onVerifyClick }: BasicUserBannerProps) {
    const { user } = useAuthStore();
    // Solo estado local: el banner reaparece en cada refresh (no persiste en sessionStorage)
    const [dismissed, setDismissed] = useState(false);
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
        setDismissed(true);
    };

    if (!isBasicUser || dismissed) return null;

    return (
        <div
            role="banner"
            style={{
                position: "fixed",
                top: "115px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 45,
                maxWidth: isMobile ? "calc(100% - 24px)" : "850px",
                width: "100%",
                background: `linear-gradient(90deg, rgba(255,140,0,0.08), rgba(212,175,55,0.08), rgba(255,140,0,0.08))`,
                border: `1.5px solid ${NEON}60`,
                borderRadius: "12px",
                backdropFilter: "blur(12px)",
                padding: isMobile ? "16px 14px" : "16px 25px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                flexWrap: "wrap",
                boxShadow: `0 8px 32px rgba(255, 140, 0, 0.15), 0 2px 8px rgba(212, 175, 55, 0.2)`,
            }}
        >
            {/* Mensaje principal */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "auto" }}>
                <span style={{ fontSize: isMobile ? "20px" : "16px", flexShrink: 0 }}>🔒</span>
                <span style={{ color: "#E0E0E0", fontSize: isMobile ? "14px" : "13px", lineHeight: isMobile ? "1.6" : "1.4" }}>
                    <strong style={{ color: AMBER }}>Tu voto solo aparece en el conteo público</strong>
                    <strong style={{ color: "#FFFFFF" }}>{", pero solo los votos de usuarios verificados cuentan en los informes oficiales. "}</strong>
                    <strong style={{ color: NEON }}>Verifica tu identidad con RUT y tu voz contará </strong>
                    {""}
                    <strong style={{ color: NEON }}>al 100%.</strong> 
                </span>
            </div>

            {/* Acciones */}
            <div style={{ display: "flex", alignItems: "center", gap: "30px", flexShrink: 0 }}>
                <button
                    onClick={onVerifyClick}
                    style={{
                        background: "var(--beacon-neon)",
                        color: "#000",
                        border: `1.5px solid ${AMBER}60`,
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
                        background: "rgba(255, 140, 0, 0.1)",
                        color: "#ff0000",
                        border: `1px solid ${AMBER}40`,
                        cursor: "pointer",
                        fontSize: "20px",
                        lineHeight: "1",
                        width: "40px",
                        height: "40px",
                        padding: "0",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s ease",
                        flexShrink: 0,
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = `rgba(255, 140, 0, 0.2)`;
                        e.currentTarget.style.color = "#ff0000";
                        e.currentTarget.style.transform = "scale(1.1)";
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = "rgba(255, 140, 0, 0.1)";
                        e.currentTarget.style.color = "#ff0000";
                        e.currentTarget.style.transform = "scale(1)";
                    }}
                >
                    ×
                </button>
            </div>
        </div>
    );
}
