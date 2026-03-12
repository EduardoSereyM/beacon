/**
 * BEACON PROTOCOL — BasicUserBanner
 * ==================================
 * Banner fijo bajo el navbar que informa al usuario BASIC
 * que su voto vale 0.5x y lo invita a verificar su identidad.
 *
 * Posición: fixed top-16 (bajo el navbar de 64px), z-40.
 * Dismissible via sessionStorage.
 */

"use client";

import { useState, useEffect } from "react";
import usePermissions from "@/hooks/usePermissions";

const STORAGE_KEY = "beacon_banner_dismissed";

interface Props {
    onVerifyClick: () => void;
}

export default function BasicUserBanner({ onVerifyClick }: Props) {
    const { isAuthenticated, rank } = usePermissions();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const dismissed = sessionStorage.getItem(STORAGE_KEY);
        const isBasicRank = rank === "BASIC" || rank === "BRONZE";
        setVisible(isAuthenticated && isBasicRank && !dismissed);
    }, [isAuthenticated, rank]);

    const dismiss = () => {
        sessionStorage.setItem(STORAGE_KEY, "1");
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div
            className="fixed left-0 right-0 z-40 flex items-center justify-between gap-3 px-4 py-2 text-xs"
            style={{
                top: "64px",
                background: "linear-gradient(90deg, rgba(180,120,0,0.18), rgba(212,175,55,0.10))",
                borderBottom: "1px solid rgba(212,175,55,0.25)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
            }}
        >
            <p className="text-amber-300 font-medium">
                🔒 Tu voto vale <strong>0.5x</strong>. Verifica tu identidad y valdrá el doble.
            </p>
            <div className="flex items-center gap-3 flex-shrink-0">
                <button
                    onClick={onVerifyClick}
                    className="px-3 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-105"
                    style={{
                        background: "linear-gradient(135deg, #D4AF37, #B8860B)",
                        color: "#0a0a0a",
                    }}
                >
                    Verificar ahora
                </button>
                <button
                    onClick={dismiss}
                    className="text-foreground-muted hover:text-foreground transition-colors text-base leading-none"
                    aria-label="Cerrar"
                >
                    ×
                </button>
            </div>
        </div>
    );
}
