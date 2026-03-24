/**
 * BEACON PROTOCOL — NotificationBell (El Heraldo del Búnker)
 * ===========================================================
 * Campana de notificaciones para admin. Solo visible con rol 'admin'.
 *
 * - Consulta GET /admin/notifications (últimas 10)
 * - Badge rojo con conteo de no-leídas
 * - Estado de lectura persiste en localStorage (beacon_notif_read)
 * - Dropdown con tipo / fecha / mensaje
 */

"use client";

import { useEffect, useRef, useState } from "react";

interface Notification {
    id: string;
    action: string;
    label: string;
    subject: string;
    message: string;
    entity_id: string;
    created_at: string;
}

const ACTION_ICON: Record<string, string> = {
    NEW_USER_REGISTERED: "👤",
    SHADOW_BAN_APPLIED:  "🚫",
    POLL_CREATED:        "📊",
};

const LS_KEY = "beacon_notif_read";

function getReadIds(): Set<string> {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

function saveReadIds(ids: Set<string>): void {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
    } catch { /* ignore */ }
}

function formatDate(iso: string): string {
    try {
        return new Intl.DateTimeFormat("es-CL", {
            day:    "2-digit",
            month:  "short",
            hour:   "2-digit",
            minute: "2-digit",
        }).format(new Date(iso));
    } catch {
        return iso.slice(0, 16);
    }
}

export default function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [readIds, setReadIds]             = useState<Set<string>>(new Set());
    const [open, setOpen]                   = useState(false);
    const [loading, setLoading]             = useState(false);
    const dropdownRef                       = useRef<HTMLDivElement>(null);

    // ── Fetch ──────────────────────────────────────────────────────────────
    const fetchNotifications = async () => {
        const token = localStorage.getItem("beacon_token");
        if (!token) return;

        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const res = await fetch(`${apiUrl}/api/v1/admin/notifications?limit=10`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            setNotifications(data.items || []);
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    };

    // ── Init: cargar read IDs y fetch inicial ──────────────────────────────
    useEffect(() => {
        setReadIds(getReadIds());
        fetchNotifications();
        // Polling cada 60 s para notificaciones nuevas
        const interval = setInterval(fetchNotifications, 60_000);
        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Cerrar al click fuera ──────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    // ── Al abrir: marcar todas como leídas ────────────────────────────────
    const handleOpen = () => {
        if (!open) {
            fetchNotifications();
        }
        setOpen((prev) => !prev);
    };

    const markAllRead = () => {
        const newRead = new Set(readIds);
        notifications.forEach((n) => newRead.add(n.id));
        setReadIds(newRead);
        saveReadIds(newRead);
    };

    const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

    return (
        <div className="relative" ref={dropdownRef}>
            {/* ── Bell button ── */}
            <button
                onClick={handleOpen}
                className="relative flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-white/10"
                title="Notificaciones del sistema"
                aria-label="Notificaciones"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18" height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={unreadCount > 0 ? "#D4AF37" : "rgba(255,255,255,0.55)"}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>

                {/* Badge */}
                {unreadCount > 0 && (
                    <span
                        className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold leading-none"
                        style={{ background: "#E53E3E", color: "#fff" }}
                    >
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {/* ── Dropdown ── */}
            {open && (
                <div
                    className="absolute right-0 top-10 z-[60] w-80 rounded-xl overflow-hidden shadow-2xl"
                    style={{
                        background:    "rgba(14,14,14,0.97)",
                        border:        "1px solid rgba(212,175,55,0.18)",
                        backdropFilter: "blur(16px)",
                    }}
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-4 py-2.5 border-b"
                        style={{ borderColor: "rgba(255,255,255,0.07)" }}
                    >
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#D4AF37" }}>
                            Notificaciones
                        </span>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-[10px] text-foreground-muted hover:text-white transition-colors uppercase tracking-wider"
                            >
                                Marcar leídas
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="max-h-80 overflow-y-auto">
                        {loading && notifications.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-foreground-muted">
                                Cargando…
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-foreground-muted">
                                Sin notificaciones
                            </div>
                        ) : (
                            notifications.map((n) => {
                                const isRead = readIds.has(n.id);
                                return (
                                    <div
                                        key={n.id}
                                        className="flex gap-3 px-4 py-3 border-b transition-colors hover:bg-white/[0.03]"
                                        style={{
                                            borderColor:       "rgba(255,255,255,0.05)",
                                            background:        isRead ? "transparent" : "rgba(212,175,55,0.04)",
                                        }}
                                    >
                                        {/* Icon */}
                                        <span className="text-base flex-shrink-0 mt-0.5">
                                            {ACTION_ICON[n.action] ?? "🔔"}
                                        </span>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2 mb-0.5">
                                                <span
                                                    className="text-xs font-bold uppercase tracking-wide truncate"
                                                    style={{ color: isRead ? "rgba(255,255,255,0.5)" : "#D4AF37" }}
                                                >
                                                    {n.label}
                                                </span>
                                                {!isRead && (
                                                    <span
                                                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                        style={{ background: "#E53E3E" }}
                                                    />
                                                )}
                                            </div>
                                            <p
                                                className="text-xs leading-snug"
                                                style={{ color: "rgba(255,255,255,0.65)" }}
                                            >
                                                {n.message}
                                            </p>
                                            <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                                                {formatDate(n.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div
                        className="px-4 py-2 text-center border-t"
                        style={{ borderColor: "rgba(255,255,255,0.07)" }}
                    >
                        <a
                            href="/admin"
                            className="text-[10px] uppercase tracking-widest transition-colors"
                            style={{ color: "rgba(212,175,55,0.6)" }}
                        >
                            Ver panel admin
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
