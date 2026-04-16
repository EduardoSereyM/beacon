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
import { IdCardLanyard } from "lucide-react";
import { useAuthStore } from "@/store";

const GOLD   = "#D4AF37";
const AMBER  = "#FF8C00";
const NEON  = "#00E5FF";
const RED    = "#FF0000";
const GREEN  = "#00FF00";


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

    // ── MOBILE layout ──────────────────────────────────────────────
    if (isMobile) {
        return (
            <div
                role="banner"
                style={{
                    position: "fixed",
                    top: "115px",
                    left: "12px",
                    right: "12px",
                    zIndex: 45,
                    background: `linear-gradient(90deg, rgba(255,140,0,0.08), rgba(212,175,55,0.08), rgba(255,140,0,0.08))`,
                    border: `1.5px solid ${NEON}60`,
                    borderRadius: "12px",
                    backdropFilter: "blur(12px)",
                    padding: "10px 12px",
                    boxShadow: `0 8px 32px rgba(255, 140, 0, 0.15), 0 2px 8px rgba(212, 175, 55, 0.2)`,
                    display: "flex",
                    gap: "10px",
                    alignItems: "stretch",
                }}
            >
                {/* Columna izquierda: icono */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <IdCardLanyard size={32} color={GREEN} strokeWidth={1.5} />
                </div>

                {/* Columna central: texto */}
                <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                    <span style={{ color: "#E0E0E0", fontSize: "12px", lineHeight: "1.5" }}>
                        <strong style={{ color: "#E0E0E0" }}>Verifica tu cuenta aquí</strong>
                        <br />
                        <strong style={{ color: AMBER }}> - Tu voto valdrá al 100%</strong>
                        <br />
                        <strong style={{ color: AMBER }}> - Se incluirá en informes oficiales</strong>
                    </span>
                </div>

                {/* Columna derecha: X arriba, Verificar abajo */}
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    flexShrink: 0,
                    gap: "8px",
                }}>
                    <button
                        onClick={handleDismiss}
                        aria-label="Cerrar aviso"
                        style={{
                            background: "rgba(255, 140, 0, 0.1)",
                            color: "#ff0000",
                            border: `1px solid ${AMBER}40`,
                            cursor: "pointer",
                            fontSize: "16px",
                            lineHeight: "1",
                            width: "28px",
                            height: "28px",
                            padding: "0",
                            borderRadius: "6px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                        }}
                    >
                        ×
                    </button>
                    <button
                        onClick={onVerifyClick}
                        style={{
                            background: "var(--beacon-neon)",
                            color: "#000",
                            border: "none",
                            borderRadius: "4px",
                            padding: "5px 12px",
                            fontSize: "11px",
                            fontWeight: "700",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                        }}
                    >
                        Verificar →
                    </button>
                </div>
            </div>
        );
    }

    // ── DESKTOP layout (sin cambios) ────────────────────────────────
    return (
        <div
            role="banner"
            style={{
                position: "fixed",
                top: "115px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 45,
                maxWidth: "850px",
                width: "100%",
                background: `linear-gradient(90deg, rgba(255,140,0,0.08), rgba(212,175,55,0.08), rgba(255,140,0,0.08))`,
                border: `1.5px solid ${NEON}60`,
                borderRadius: "12px",
                backdropFilter: "blur(12px)",
                padding: "16px 25px",
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
                <IdCardLanyard size={32} color={GREEN} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <span style={{ color: "#E0E0E0", fontSize: "13px", lineHeight: "1.4" }}>
                    <strong style={{ color: "#E0E0E0" }}>Tu voto solo aparece en el conteo público,</strong>
                    <strong style={{ color: "#FFFFFF" }}>{" solo los votos de usuarios verificados cuentan en los informes oficiales. "}</strong>
                    <strong style={{ color: AMBER }}>Verifica tu identidad y tu voz contará </strong>
                    {""}
                    <strong style={{ color: AMBER }}>al 100%.</strong>
                </span>
            </div>

            {/* Acciones */}
            <div style={{ display: "flex", alignItems: "center", gap: "20px", flexShrink: 0, paddingLeft: "10px" }}>
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
