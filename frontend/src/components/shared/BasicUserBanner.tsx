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

import { useState } from "react";
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

    const isBasicUser = !!user && (user.rank === "BASIC" || user.rank === "BRONZE");

    const handleDismiss = () => {
        sessionStorage.setItem("beacon_banner_dismissed", "true");
        setDismissed(true);
    };

    if (!isBasicUser || dismissed) return null;

    return (
        <div
            role="banner"
            style={{
                position: "sticky",
                top: 0,
                zIndex: 999,
                background: `linear-gradient(90deg, rgba(255,140,0,0.15), rgba(212,175,55,0.15), rgba(255,140,0,0.15))`,
                borderBottom: `1px solid ${AMBER}40`,
                backdropFilter: "blur(8px)",
                padding: "10px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
            }}
        >
            {/* Mensaje principal */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "200px" }}>
                <span style={{ fontSize: "18px" }}>🔒</span>
                <span style={{ color: "#E0E0E0", fontSize: "13px", lineHeight: "1.4" }}>
                    <strong style={{ color: AMBER }}>Tu voto vale 0.5x</strong>
                    {" "}como ciudadano BÁSICO.{" "}
                    <span style={{ color: "#BDBDBD" }}>
                        Verifica RUT + datos personales y tu voto valdrá{" "}
                        <strong style={{ color: GOLD }}>el doble (1.0x)</strong>.
                    </span>
                </span>
            </div>

            {/* Acciones */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                    onClick={onVerifyClick}
                    style={{
                        background: `linear-gradient(135deg, ${AMBER}, ${GOLD})`,
                        color: "#000",
                        border: "none",
                        borderRadius: "6px",
                        padding: "7px 16px",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer",
                        letterSpacing: "0.5px",
                        whiteSpace: "nowrap",
                        transition: "opacity 0.2s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                    Verificar identidad →
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
