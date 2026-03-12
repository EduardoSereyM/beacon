/**
 * BEACON PROTOCOL — Navbar Client (Componente Interactivo)
 * =========================================================
 * Navbar glassmorphism + AuthModal + VerifyIdentityModal + BasicUserBanner.
 * "use client" porque maneja estado (modals, banner).
 */

"use client";

import { useState, useEffect } from "react";
import AuthModal from "./AuthModal";
import VerifyIdentityModal from "./VerifyIdentityModal";
import BasicUserBanner from "@/components/shared/BasicUserBanner";
import usePermissions from "@/hooks/usePermissions";
import Image from "next/image";
import Link from "next/link";
import logoDorado from "@/asset/brand/LogoBeaconCian.png";

export default function NavbarClient() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isVerifyOpen, setIsVerifyOpen] = useState(false);
    const { user, isAuthenticated, isAdmin, rank, logout } = usePermissions();

    const isBasicUser = rank === "BASIC" || rank === "BRONZE";
    const rankColor = rank === "VERIFIED" ? "#4dff83" : "#D4AF37";

    // Eventos custom desde otros componentes
    useEffect(() => {
        const openAuth = () => setIsModalOpen(true);
        const openVerify = () => setIsVerifyOpen(true);
        window.addEventListener("beacon:open-auth-modal", openAuth);
        window.addEventListener("beacon:open-verify-modal", openVerify);
        return () => {
            window.removeEventListener("beacon:open-auth-modal", openAuth);
            window.removeEventListener("beacon:open-verify-modal", openVerify);
        };
    }, []);

    return (
        <>
            {/* ═══ Navbar Glassmorphism ═══ */}
            <nav
                className="fixed top-0 left-0 right-0 z-50 px-6 py-3"
                style={{
                    background: "rgba(10, 10, 10, 0.70)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                }}
            >
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    {/* ─── Logo ─── */}
                    <Link href="/" className="flex items-center gap-3 group">
                        <Image
                            src={logoDorado}
                            alt="Beacon Protocol Logo"
                            className="w-9 h-9 object-contain transition-all duration-300 group-hover:scale-105"
                        />
                        <div>
                            <h1
                                className="text-sm font-bold tracking-wide uppercase"
                                style={{ color: "#D4AF37" }}
                            >
                                Beacon Protocol
                            </h1>
                            <p className="text-[9px] text-foreground-muted tracking-[0.25em] uppercase">
                                Motor de Integridad
                            </p>
                        </div>
                    </Link>

                    {/* ─── Navigation Links ─── */}
                    <div className="flex items-center gap-4">
                        <Link href="/entities" className="hidden lg:block text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Entidades
                        </Link>
                        <Link href="/politicos" className="hidden lg:block text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Políticos
                        </Link>
                        <Link href="/empresas" className="hidden lg:block text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Empresas
                        </Link>
                        <Link href="/personajes" className="hidden lg:block text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Personajes
                        </Link>
                        <Link href="/eventos" className="hidden lg:block text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Eventos
                        </Link>
                        <Link
                            href="/versus"
                            className="hidden md:block text-xs hover:text-foreground transition-colors uppercase tracking-wider font-medium"
                            style={{ color: "#D4AF37" }}
                        >
                            VS
                        </Link>

                        {/* ─── Auth Section ─── */}
                        {isAuthenticated ? (
                            <div className="flex items-center gap-3">
                                <div
                                    className="hidden sm:block w-px h-5 self-center"
                                    style={{ backgroundColor: "rgba(77, 255, 131, 1)" }}
                                />

                                {isAdmin && (
                                    <Link
                                        href="/admin"
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 hover:scale-105"
                                        style={{
                                            background: "rgba(212,175,55,0.12)",
                                            border: "1px solid rgba(212,175,55,0.35)",
                                            color: "#D4AF37",
                                        }}
                                    >
                                        🛡️ Admin
                                    </Link>
                                )}

                                {/* Botón Verificar — solo para usuarios BASIC */}
                                {isBasicUser && (
                                    <button
                                        onClick={() => setIsVerifyOpen(true)}
                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105"
                                        style={{
                                            background: "rgba(212,175,55,0.10)",
                                            border: "1px solid rgba(212,175,55,0.30)",
                                            color: "#D4AF37",
                                        }}
                                    >
                                        🔒 Verificar
                                    </button>
                                )}

                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-foreground" style={{ letterSpacing: "0.03em" }}>
                                        {user.email || user.full_name}
                                    </span>
                                    <span
                                        className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                        style={{
                                            backgroundColor: `${rankColor}18`,
                                            color: rankColor,
                                            border: `1px solid ${rankColor}40`,
                                        }}
                                    >
                                        {rank}
                                    </span>
                                </div>
                                <button
                                    onClick={logout}
                                    className="text-[10px] text-foreground hover:text-white transition-colors font-mono"
                                >
                                    Salir
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white transition-all duration-300 hover:scale-105 hover:shadow-lg"
                                style={{
                                    background: "linear-gradient(135deg, #D4AF37, #8A2BE2)",
                                    boxShadow: "0 0 12px rgba(212,175,55,0.2), 0 0 12px rgba(138,43,226,0.2)",
                                }}
                            >
                                Acceso al Búnker
                            </button>
                        )}
                    </div>
                </div>
            </nav>

            {/* ═══ Banner BASIC (bajo el navbar) ═══ */}
            <BasicUserBanner onVerifyClick={() => setIsVerifyOpen(true)} />

            {/* ═══ Modales ═══ */}
            <AuthModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
            <VerifyIdentityModal isOpen={isVerifyOpen} onClose={() => setIsVerifyOpen(false)} />
        </>
    );
}
