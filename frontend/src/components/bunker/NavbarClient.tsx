/**
 * BEACON PROTOCOL — Navbar Client (Componente Interactivo)
 * =========================================================
 * Navbar glassmorphism + AuthModal + BasicUserBanner + VerifyIdentityModal.
 * "use client" porque maneja estado (isModalOpen, isVerifyOpen).
 */

"use client";

import { useState, useEffect } from "react";
import AuthModal from "./AuthModal";
import NotificationBell from "./NotificationBell";
import VerifyIdentityModal from "./VerifyIdentityModal";
import BasicUserBanner from "@/components/shared/BasicUserBanner";
import usePermissions from "@/hooks/usePermissions";
import Image from "next/image";
import Link from "next/link";
import logoDorado from "@/asset/brand/logo.png";
import { ShieldAlert, UserCircle, LogOut, ShieldCheck, Shield } from "lucide-react";

export default function NavbarClient() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isVerifyOpen, setIsVerifyOpen] = useState(false);
    const [verifyMode, setVerifyMode] = useState<"onboarding" | "intro">("intro");
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [sessionExpiredMsg, setSessionExpiredMsg] = useState(false);
    const { user, isAuthenticated, isBasic, isAdmin, logout } = usePermissions();
    const rank = user.rank;

    // Limpiar banner de sesión expirada cuando el usuario se autentica
    useEffect(() => {
        if (isAuthenticated) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSessionExpiredMsg(false);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsModalOpen(false);
        }
    }, [isAuthenticated]);

    // Primer login BRONZE sin onboarding visto → mostrar los 4 slides automáticamente
    useEffect(() => {
        if (!isAuthenticated || rank === "VERIFIED") return;
        try {
            if (!localStorage.getItem("beacon_onboarding_seen")) {
                setVerifyMode("onboarding");
                setTimeout(() => setIsVerifyOpen(true), 800);
            }
        } catch { /* SSR */ }
    }, [isAuthenticated, rank]);

    // Eventos custom desde otros componentes
    useEffect(() => {
        const openAuth = () => setIsModalOpen(true);
        const openVerify = () => { setVerifyMode("intro"); setIsVerifyOpen(true); };
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

    // Abrir modal de login si el usuario viene del callback de confirmación de email
    useEffect(() => {
        const shouldOpen = sessionStorage.getItem("beacon_open_login");
        if (shouldOpen === "1") {
            sessionStorage.removeItem("beacon_open_login");
            setTimeout(() => setIsModalOpen(true), 0);
        }
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
                <div className="max-w-7xl mx-auto">

                    {/* ══ Fila 1: Logo | Nav Links | Hamburger (mobile) ══ */}
                    <div className="flex items-center justify-between">

                        {/* ─── Logo ─── */}
                        <Link href="/" className="flex items-center gap-2 sm:gap-3 group flex-shrink-0">
                            <Image
                                src={logoDorado}
                                alt="Beacon Logo"
                                className="w-7 h-7 sm:w-9 sm:h-9 object-contain transition-all duration-300 group-hover:scale-105"
                            />
                            <div className="flex flex-col">
                                <h1
                                    className="text-[11px] sm:text-sm font-bold tracking-wide uppercase whitespace-nowrap"
                                    style={{ color: "#D4AF37", lineHeight: "1.1" }}
                                >
                                    Beacon
                                </h1>
                                <p className="text-[10px] sm:text-[10px] text-foreground-muted tracking-[0.1em] sm:tracking-[0.25em] uppercase whitespace-nowrap hidden sm:block mt-0.5" style={{ lineHeight: "1" }}>
                                    Opinión ciudadana verificada
                                </p>
                            </div>
                        </Link>

                        {/* ─── Navigation Links (Desktop lg+) ─── */}
                        <div className="hidden lg:flex items-center gap-3 xl:gap-5">
                            <Link href="/encuestas" className="text-xs font-bold uppercase tracking-wider transition-colors px-2.5 py-1 rounded-lg" style={{ color: "#D4AF37", background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)" }}>Encuestas</Link>
                            <Link href="/entities" className="flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">
                                Directorio
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.2)", color: "#D4AF37" }}>🚧</span>
                            </Link>
                            <Link href="/versus" className="text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">Versus</Link>
                            <Link href="/events" className="text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium">Eventos</Link>
                        </div>

                        {/* ─── Hamburger Button (Mobile < lg) ─── */}
                        <div className="flex lg:hidden items-center gap-3">
                            {isAuthenticated ? (
                                <span
                                    className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider"
                                    style={{
                                        backgroundColor: rank === "VERIFIED" ? "rgba(77,255,131,0.12)" : "rgba(255,140,0,0.12)",
                                        color: rank === "VERIFIED" ? "#4DFF83" : "#FF8C00",
                                        border: `1px solid ${rank === "VERIFIED" ? "rgba(77,255,131,0.25)" : "rgba(255,140,0,0.25)"}`,
                                    }}
                                >
                                    {rank}
                                </span>
                            ) : (
                                <button
                                    onClick={() => setIsModalOpen(true)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:bg-[#D4AF37]/10 whitespace-nowrap"
                                    style={{ background: "rgba(212,175,55,0.05)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.3)" }}
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

                    {/* ══ Fila 2: Auth — Desktop lg+, siempre a la derecha ══ */}
                    <div className="hidden lg:flex justify-end items-center gap-3 mt-1.5 pt-1.5 border-t border-white/[0.06]">
                        {isAuthenticated ? (
                            <>
                                {isAdmin && <NotificationBell />}

                                {/* ─── Bloque 1: Avatar + Email + Badge ─── */}
                                <div className="flex items-center gap-2.5">
                                    {/* Círculo avatar */}
                                    <div
                                        className="flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-black flex-shrink-0"
                                        style={{
                                            background: isAdmin
                                                ? "rgba(212,175,55,0.20)"
                                                : rank === "VERIFIED"
                                                ? "rgba(77,255,131,0.15)"
                                                : "rgba(255,140,0,0.15)",
                                            border: `1.5px solid ${isAdmin ? "#D4AF37" : rank === "VERIFIED" ? "#4DFF83" : "#FF8C00"}`,
                                            color: isAdmin ? "#D4AF37" : rank === "VERIFIED" ? "#4DFF83" : "#FF8C00",
                                        }}
                                    >
                                        {(user.full_name || user.email || "?")[0].toUpperCase()}
                                    </div>

                                    {/* Email */}
                                    <span className="text-xs font-mono text-foreground" style={{ letterSpacing: "0.02em" }}>
                                        {user.email || user.full_name}
                                    </span>

                                    {/* Badge de rango */}
                                    <span
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                        style={{
                                            backgroundColor: isAdmin ? "rgba(212,175,55,0.12)" : rank === "VERIFIED" ? "rgba(77,255,131,0.12)" : "rgba(255,140,0,0.12)",
                                            color: isAdmin ? "#D4AF37" : rank === "VERIFIED" ? "#4DFF83" : "#FF8C00",
                                            border: `1px solid ${isAdmin ? "rgba(212,175,55,0.3)" : rank === "VERIFIED" ? "rgba(77,255,131,0.3)" : "rgba(255,140,0,0.3)"}`,
                                        }}
                                    >
                                        {isAdmin
                                            ? <Shield size={11} strokeWidth={2} />
                                            : rank === "VERIFIED"
                                            ? <ShieldCheck size={11} strokeWidth={2} />
                                            : <ShieldAlert size={11} strokeWidth={2} />}
                                        {isAdmin ? "ADMIN" : rank === "VERIFIED" ? "VERIFIED" : "BASIC"}
                                    </span>
                                </div>

                                {/* ─── Barra separadora vertical ─── */}
                                <div className="h-4 w-px bg-white/15 flex-shrink-0 mx-2" />

                                {/* ─── Bloque 2: Acciones ─── */}
                                {isAdmin && (
                                    <Link
                                        href="/admin"
                                        className="flex items-center gap-1.5 text-xs font-mono text-foreground-muted hover:text-[#D4AF37] transition-colors duration-200"
                                    >
                                        <Shield size={13} strokeWidth={1.5} />
                                        <span>Admin</span>
                                    </Link>
                                )}

                                {isBasic && (
                                    <button
                                        onClick={() => { setVerifyMode("intro"); setIsVerifyOpen(true); }}
                                        className="flex items-center gap-1.5 text-xs font-mono transition-colors duration-200"
                                        style={{ color: "#8A8A8A" }}
                                        onMouseEnter={e => (e.currentTarget.style.color = "#FF8C00")}
                                        onMouseLeave={e => (e.currentTarget.style.color = "#8A8A8A")}
                                        title="Tu voto aparece en público, pero solo los verificados cuentan en informes oficiales"
                                    >
                                        <ShieldAlert size={13} strokeWidth={1.5} />
                                        <span>Verificar cuenta</span>
                                    </button>
                                )}

                                <span className="text-white/20 select-none">·</span>

                                <a
                                    href="/profile"
                                    className="flex items-center gap-1.5 text-xs font-mono text-foreground-muted hover:text-white transition-colors duration-200"
                                >
                                    <UserCircle size={14} strokeWidth={1.5} />
                                    <span>Mi Perfil</span>
                                </a>

                                <span className="text-white/20 select-none">·</span>

                                <button
                                    onClick={logout}
                                    className="flex items-center gap-1.5 text-xs font-mono text-foreground-muted hover:text-red-400 transition-colors duration-200"
                                >
                                    <LogOut size={13} strokeWidth={1.5} />
                                    <span>Salir</span>
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:bg-[#D4AF37]/10"
                                style={{ background: "rgba(212,175,55,0.05)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.3)", boxShadow: "0 0 10px rgba(212,175,55,0.1)" }}
                            >
                                Acceso
                            </button>
                        )}
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
                                            onClick={() => { setVerifyMode("intro"); setIsVerifyOpen(true); setIsMobileMenuOpen(false); }}
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
                        <Link href="/encuestas" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-bold uppercase tracking-widest" style={{ color: "#D4AF37" }}>Encuestas</Link>
                        <Link href="/entities" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center justify-center gap-2 text-xl font-bold text-foreground hover:text-white tracking-widest uppercase">
                            Directorio
                            <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.2)", color: "#D4AF37" }}>🚧</span>
                        </Link>
                        <Link href="/versus" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-bold text-foreground hover:text-white tracking-widest uppercase">Versus</Link>
                        <Link href="/events" onClick={() => setIsMobileMenuOpen(false)} className="text-xl font-bold text-foreground hover:text-white tracking-widest uppercase">Eventos</Link>
                    </div>
                </div>
            )}

            {/* ═══ Banner BASIC — fixed justo bajo la navbar (z-40) ═══ */}
            {isAuthenticated && isBasic && (
                <BasicUserBanner onVerifyClick={() => { setVerifyMode("intro"); setIsVerifyOpen(true); }} />
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
                initialStep={verifyMode}
            />
        </>
    );
}
