/**
 * BEACON PROTOCOL — Admin Layout (Búnker de Control)
 * =====================================================
 * Layout protegido que verifica JWT con role: admin
 * antes de renderizar cualquier contenido admin.
 *
 * Si no hay token o no es admin, redirige al login.
 * Incluye sidebar de navegación del Sovereign Dashboard.
 *
 * "El Búnker de Control es inexpugnable."
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Menú lateral del Overlord */
const ADMIN_NAV = [
    { href: "/admin",              label: "Dashboard",   icon: "🛡️" },
    { href: "/admin/entities",     label: "Entidades",   icon: "⚖️" },
    { href: "/admin/dimensions",   label: "Dimensiones", icon: "🎚️" },
    { href: "/admin/encuestas",    label: "Encuestas",   icon: "📊" },
    { href: "/admin/audit",        label: "Audit Log",   icon: "📜" },
];

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [adminEmail, setAdminEmail] = useState("");

    useEffect(() => {
        const token = localStorage.getItem("beacon_token");
        const userRaw = localStorage.getItem("beacon_user");

        if (!token || !userRaw) {
            router.push("/");
            setLoading(false);
            return;
        }

        try {
            const user = JSON.parse(userRaw);

            if (user.role !== "admin") {
                router.push("/");
                return;
            }

            setAdminEmail(user.email || "Overlord");
            setIsAdmin(true);
        } catch {
            router.push("/");
        } finally {
            setLoading(false);
        }
    }, [router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0A" }}>
                <div className="text-center">
                    <div
                        className="w-10 h-10 rounded-lg mx-auto mb-4 animate-pulse"
                        style={{ background: "linear-gradient(135deg, #D4AF37, #FF073A)" }}
                    />
                    <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#D4AF37" }}>
                        Verificando credenciales del Overlord...
                    </p>
                </div>
            </div>
        );
    }

    if (!isAdmin) return null;

    return (
        <div className="min-h-screen flex" style={{ background: "#080808" }}>
            {/* ─── Sidebar del Overlord ─── */}
            <aside
                className="w-56 flex-shrink-0 flex flex-col"
                style={{
                    background: "rgba(10, 10, 10, 0.95)",
                    borderRight: "1px solid rgba(212, 175, 55, 0.1)",
                }}
            >
                {/* Logo */}
                <div className="p-4 pt-6">
                    <div className="flex items-center gap-2 mb-1">
                        <div
                            className="w-6 h-6 rounded flex items-center justify-center"
                            style={{ background: "linear-gradient(135deg, #D4AF37, #FF073A)" }}
                        >
                            <span className="text-xs">🛡️</span>
                        </div>
                        <span
                            className="text-xs font-bold uppercase tracking-wider"
                            style={{ color: "#D4AF37" }}
                        >
                            Overlord
                        </span>
                    </div>
                    <p className="text-[8px] font-mono text-foreground-muted truncate mt-1">
                        {adminEmail}
                    </p>
                </div>

                {/* Semáforo de Seguridad */}
                <div className="px-4 py-3">
                    <div
                        className="rounded-lg p-3"
                        style={{
                            background: "rgba(57, 255, 20, 0.05)",
                            border: "1px solid rgba(57, 255, 20, 0.15)",
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2 h-2 rounded-full pulse-live"
                                style={{ backgroundColor: "#39FF14" }}
                            />
                            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#39FF14" }}>
                                Sistema Operativo
                            </span>
                        </div>
                    </div>
                </div>

                {/* Navegación */}
                <nav className="flex-1 px-3 mt-2">
                    {ADMIN_NAV.map((item) => (
                        <a
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 mb-1"
                            style={{
                                color: "rgba(255, 255, 255, 0.6)",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "rgba(212, 175, 55, 0.08)";
                                e.currentTarget.style.color = "#D4AF37";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                                e.currentTarget.style.color = "rgba(255, 255, 255, 0.6)";
                            }}
                        >
                            <span className="text-sm">{item.icon}</span>
                            {item.label}
                        </a>
                    ))}
                </nav>

                {/* Volver al sitio */}
                <div className="p-4 pt-0">
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider transition-colors"
                        style={{ color: "rgba(136, 136, 136, 0.5)" }}
                    >
                        ← Volver al Protocolo
                    </Link>
                </div>
            </aside>

            {/* ─── Contenido Principal ─── */}
            <main className="flex-1 overflow-y-auto p-6">
                {children}
            </main>
        </div>
    );
}
