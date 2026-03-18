/**
 * BEACON PROTOCOL — Navbar Client (Componente Interactivo)
 * =========================================================
 * Navbar glassmorphism + AuthModal + BasicUserBanner + VerifyIdentityModal.
 * "use client" porque maneja estado (isModalOpen, isVerifyOpen).
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
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [sessionExpiredMsg, setSessionExpiredMsg] = useState(false);
    const { user, isAuthenticated, isBasic, isAdmin, logout } = usePermissions();
    const rank = user.rank;

    // Limpiar banner de sesión expirada cuando el usuario se autentica
    useEffect(() => {
        if (isAuthenticated) {
            setSessionExpiredMsg(false);
            setIsModalOpen(false);
        }
    }, [isAuthenticated]);

    // Eventos custom desde otros componentes
    useEffect(() => {
        const openAuth = () => setIsModalOpen(true);
        const openVerify = () => setIsVerifyOpen(true);
        const onExpired = () => { setSessionExpiredMsg(true); setIsModalOpen(true); };
        window.addEventListener("beacon:open-auth-modal", openAuth);
        window.addEventListener("beacon:open-verify-modal", openVerify);
        window.addEventListener("beacon:session-expired", onExpired);
        return () => {
            window.removeEventListener("beacon:open-auth-modal", openAuth);
            window.removeEventListener("beacon:open-verify-modal", openVerify);
            window.removeEventListener("beacon:session-expired", onExpired);
        };
    }, []);

    // Limpiar banner de sesión expirada cuando el usuario se autentica
    useEffect(() => {
        if (isAuthenticated) {
            setSessionExpiredMsg(false);
            setIsModalOpen(false);
        }
    }, [isAuthenticated]);

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
                <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-2">
                    {/* ─── Logo ─── */}
                    <Link href="/" className="flex items-center gap-2 sm:gap-3 group flex-shrink-0">
                        <Image
                            src={logoDorado}
                            alt="Beacon Protocol Logo"
                            className="w-7 h-7 sm:w-9 sm:h-9 object-contain transition-all duration-300 group-hover:scale-105"
                        />
                        <div className="flex flex-col">
                            <h1
                                className="text-[11px] sm:text-sm font-bold tracking-wide uppercase whitespace-nowrap"
                                style={{ color: "#D4AF37", lineHeight: "1.1" }}
                            >
                                Beacon Protocol
                            </h1>
                            <p className="text-[7.5px] sm:text-[9px] text-foreground-muted tracking-[0.1em] sm:tracking-[0.25em] uppercase whitespace-nowrap hidden sm:block mt-0.5" style={{ lineHeight: "1" }}>
                                Motor de Integridad
                            </p>
                        </div>
                    </Link>

                    {/* ─── Navigation Links (Desktop lg+) ─── */}
                    <div className="hidden lg:flex xl:items-center gap-3 xl:gap-5 ml-auto">
                        <Link href="/entities" className="text-[10px] lg:text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Entidades
                        </Link>
                        <Link href="/politicos" className="text-[10px] lg:text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Políticos
                        </Link>
                        <Link href="/empresas" className="text-[10px] lg:text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Empresas
                        </Link>
                        <Link href="/personajes" className="text-[10px] lg:text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Personajes
                        </Link>
                        <Link href="/events" className="text-[10px] lg:text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Eventos
                        </Link>
                        <Link href="/encuestas" className="text-[10px] lg:text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Encuestas
                        </Link>
                        <Link href="/versus" className="text-[10px] lg:text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                            Versus
                        </Link>
                    </div>

                    {/* ─── Auth Section (Desktop lg+) ─── */}
                    <div className="hidden lg:flex items-center gap-3 w-full xl:w-auto xl:flex-shrink-0 justify-end mt-2 pt-3 border-t border-white/10 xl:border-none xl:mt-0 xl:pt-0 xl:pl-4 xl:ml-2 relative">
                        {/* Custom vertical divider only visible on XL (1 line layout) */}
                        <div
                            className="hidden xl:block absolute left-0 top-1/2 -translate-y-1/2 w-px h-5 bg-[#4DFF83]/40"
                        />
                        {isAuthenticated ? (
                            <>

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

                                {/* Botón verificar — solo para usuarios BASIC */}
                                {isBasic && (
                                    <button
                                        onClick={() => setIsVerifyOpen(true)}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 hover:scale-105"
                                        style={{
                                            background: "rgba(255,140,0,0.12)",
                                            border: "1px solid rgba(255,140,0,0.35)",
                                            color: "#FF8C00",
                                        }}
                                        title="Tu voto vale 0.5x — verificar para 1.0x"
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
                                            backgroundColor: rank === "VERIFIED"
                                                ? "rgba(77,255,131,0.12)"
                                                : "rgba(255,140,0,0.12)",
                                            color: rank === "VERIFIED" ? "#4DFF83" : "#FF8C00",
                                            border: `1px solid ${rank === "VERIFIED" ? "rgba(77,255,131,0.25)" : "rgba(255,140,0,0.25)"}`,
                                        }}
                                    >
                                        {rank}
                                    </span>
                                </div>
                                <a
                                    href="/profile"
                                    className="text-[10px] text-foreground hover:text-white transition-colors font-mono"
                                >
                                    Mi Perfil
                                </a>
                                <button
                                    onClick={logout}
                                    className="text-[10px] text-foreground hover:text-white transition-colors font-mono"
                                >
                                    Salir
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="hidden xl:block px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:bg-[#D4AF37]/10"
                                style={{
                                    background: "rgba(212,175,55,0.05)",
                                    color: "#D4AF37",
                                    border: "1px solid rgba(212,175,55,0.3)",
                                    boxShadow: "0 0 10px rgba(212,175,55,0.1)",
                                }}
                            >
                                Acceso
                            </button>
                        )}
                    </div>

                    {/* ─── Hamburger Button (Mobile < lg) ─── */}
                    <div className="flex lg:hidden items-center gap-3 ml-auto">
                        {isAuthenticated ? (
                            <span
                                className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                style={{
                                    backgroundColor: rank === "VERIFIED"
                                        ? "rgba(77,255,131,0.12)"
                                        : "rgba(255,140,0,0.12)",
                                    color: rank === "VERIFIED" ? "#4DFF83" : "#FF8C00",
                                    border: `1px solid ${rank === "VERIFIED" ? "rgba(77,255,131,0.25)" : "rgba(255,140,0,0.25)"}`,
                                }}
                            >
                                {rank}
                            </span>
                        ) : (
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 hover:bg-[#D4AF37]/10 flex-shrink-0 whitespace-nowrap"
                                style={{
                                    background: "rgba(212,175,55,0.05)",
                                    color: "#D4AF37",
                                    border: "1px solid rgba(212,175,55,0.3)",
                                }}
                            >
                                Entrar
                            </button>
                        )}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="text-foreground hover:text-white transition-colors p-2 -mr-2 focus:outline-none flex-shrink-0"
                        >
                            {isMobileMenuOpen ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                            )}
                        </button>
                    </div>
                </div>
            </nav>

            {/* ═══ Mobile Menu Overlay ═══ */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-xl xl:hidden flex flex-col pt-24 pb-8 px-6 overflow-y-auto w-full min-h-screen"
                >
                    <div className="flex flex-col items-center gap-6 mt-2 mb-4">
                        {isAuthenticated ? (
                            <div className="w-full max-w-[280px] mx-auto">
                                <div className="text-sm font-mono text-foreground-muted mb-4 text-center w-full break-all px-4">
                                    {user.email || user.full_name}
                                </div>

                                <div className="flex flex-wrap justify-center gap-4 mb-6">
                                    {isAdmin && (
                                        <Link
                                            href="/admin"
                                            onClick={() => setIsMobileMenuOpen(false)}
                                            className="px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider"
                                            style={{ background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.35)", color: "#D4AF37" }}
                                        >
                                            🛡️ Admin
                                        </Link>
                                    )}
                                    {isBasic && (
                                        <button
                                            onClick={() => { setIsVerifyOpen(true); setIsMobileMenuOpen(false); }}
                                            className="px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider"
                                            style={{ background: "rgba(255,140,0,0.12)", border: "1px solid rgba(255,140,0,0.35)", color: "#FF8C00" }}
                                        >
                                            🔒 Verificar
                                        </button>
                                    )}
                                </div>

                                <div className="flex w-full gap-4 justify-center">
                                    <Link
                                        href="/profile"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex-1 py-3 text-center border border-white/20 rounded-lg text-xs font-bold text-white tracking-widest uppercase hover:bg-white/10"
                                    >
                                        Mi Perfil
                                    </Link>
                                    <button
                                        onClick={() => { logout(); setIsMobileMenuOpen(false); }}
                                        className="flex-1 py-3 text-center border border-red-500/30 rounded-lg text-xs font-bold text-red-500 tracking-widest uppercase hover:bg-red-500/10"
                                    >
                                        Salir
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => { setIsModalOpen(true); setIsMobileMenuOpen(false); }}
                                className="w-full max-w-[280px] mx-auto py-4 rounded-xl text-sm font-bold uppercase tracking-widest transition-all duration-300 hover:bg-[#D4AF37]/10"
                                style={{
                                    background: "rgba(212,175,55,0.05)",
                                    color: "#D4AF37",
                                    border: "1px solid rgba(212,175,55,0.3)",
                                }}
                            >
                                Acceso
                            </button>
                        )}
                    </div>

                    <div className="w-full h-px bg-white/10 my-6 flex-shrink-0" />

                    <div className="flex flex-col gap-6 text-center mb-auto">
                        <Link href="/entities" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-bold text-foreground hover:text-white tracking-widest uppercase">Entidades</Link>
                        <Link href="/politicos" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-bold text-foreground hover:text-white tracking-widest uppercase">Políticos</Link>
                        <Link href="/empresas" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-bold text-foreground hover:text-white tracking-widest uppercase">Empresas</Link>
                        <Link href="/personajes" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-bold text-foreground hover:text-white tracking-widest uppercase">Personajes</Link>
                        <Link href="/events" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-bold text-foreground hover:text-white tracking-widest uppercase">Eventos</Link>
                        <Link href="/encuestas" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-bold text-foreground hover:text-white tracking-widest uppercase">Encuestas</Link>
                        <Link href="/versus" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-bold uppercase tracking-widest" style={{ color: "#D4AF37" }}>VS</Link>
                    </div>
                </div>
            )}

            {/* ═══ Banner BASIC — fixed justo bajo la navbar (z-40) ═══ */}
            {isAuthenticated && isBasic && (
                <BasicUserBanner onVerifyClick={() => setIsVerifyOpen(true)} />
            )}

            {/* ═══ Auth Modal ═══ */}
            <AuthModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setSessionExpiredMsg(false); }}
                sessionExpired={sessionExpiredMsg}
            />

            {/* ═══ Verify Identity Modal ═══ */}
            <VerifyIdentityModal
                isOpen={isVerifyOpen}
                onClose={() => setIsVerifyOpen(false)}
            />
        </>
    );
}
