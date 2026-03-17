/**
 * BEACON PROTOCOL — ShareQR (Componente de Compartir con QR)
 * ============================================================
 * Botón que abre un panel con QR generado a partir de una URL.
 * Incluye: QR descargable + botón copiar enlace.
 *
 * Props:
 *   url      — URL completa a codificar (default: window.location.href)
 *   title    — Texto descriptivo del item (para el modal)
 *   label    — Texto del botón (default: "Compartir")
 *   size     — Tamaño del QR en px (default: 200)
 */

"use client";

import { useState, useRef } from "react";
import QRCode from "react-qr-code";

interface ShareQRProps {
    url?: string;
    title?: string;
    label?: string;
    size?: number;
}

export default function ShareQR({
    url,
    title = "Enlace BEACON",
    label = "Compartir",
    size = 200,
}: ShareQRProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const qrRef = useRef<HTMLDivElement>(null);

    const shareUrl =
        url ?? (typeof window !== "undefined" ? window.location.href : "");

    function handleCopy() {
        navigator.clipboard.writeText(shareUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    function handleDownload() {
        const svg = qrRef.current?.querySelector("svg");
        if (!svg) return;

        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(svg);
        const canvas = document.createElement("canvas");
        const padding = 24;
        canvas.width = size + padding * 2;
        canvas.height = size + padding * 2;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const img = new Image();
        img.onload = () => {
            ctx.fillStyle = "#0A0A0A";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, padding, padding, size, size);
            const link = document.createElement("a");
            link.download = `beacon-qr-${Date.now()}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        };
        img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgStr)))}`;
    }

    return (
        <>
            {/* Botón disparador */}
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all hover:scale-105"
                style={{
                    backgroundColor: "rgba(0, 229, 255, 0.08)",
                    border: "1px solid rgba(0, 229, 255, 0.25)",
                    color: "#00E5FF",
                }}
            >
                <span>📲</span>
                {label}
            </button>

            {/* Overlay / Modal */}
            {open && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center"
                    style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
                    onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
                >
                    <div
                        className="rounded-2xl p-6 max-w-xs w-full mx-4 flex flex-col items-center gap-4"
                        style={{
                            background: "rgba(15,15,15,0.98)",
                            border: "1px solid rgba(0,229,255,0.2)",
                        }}
                    >
                        {/* Header */}
                        <div className="w-full flex items-center justify-between">
                            <p className="text-[11px] font-mono uppercase tracking-widest text-foreground-muted">
                                Compartir
                            </p>
                            <button
                                onClick={() => setOpen(false)}
                                className="text-foreground-muted hover:text-foreground text-lg leading-none"
                            >
                                ×
                            </button>
                        </div>

                        <p
                            className="text-sm font-bold text-center leading-tight"
                            style={{ color: "#D4AF37" }}
                        >
                            {title}
                        </p>

                        {/* QR */}
                        <div
                            ref={qrRef}
                            className="rounded-xl p-4"
                            style={{ backgroundColor: "#ffffff" }}
                        >
                            <QRCode
                                value={shareUrl}
                                size={size}
                                bgColor="#ffffff"
                                fgColor="#0A0A0A"
                            />
                        </div>

                        {/* URL truncada */}
                        <p
                            className="text-[9px] font-mono text-center break-all px-2"
                            style={{ color: "#00E5FF", opacity: 0.7 }}
                        >
                            {shareUrl}
                        </p>

                        {/* Acciones */}
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={handleCopy}
                                className="flex-1 py-2 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all"
                                style={{
                                    backgroundColor: copied
                                        ? "rgba(57,255,20,0.12)"
                                        : "rgba(255,255,255,0.05)",
                                    border: copied
                                        ? "1px solid rgba(57,255,20,0.4)"
                                        : "1px solid rgba(255,255,255,0.1)",
                                    color: copied ? "#39FF14" : "#fff",
                                }}
                            >
                                {copied ? "✓ Copiado" : "Copiar URL"}
                            </button>

                            <button
                                onClick={handleDownload}
                                className="flex-1 py-2 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all"
                                style={{
                                    backgroundColor: "rgba(212,175,55,0.08)",
                                    border: "1px solid rgba(212,175,55,0.3)",
                                    color: "#D4AF37",
                                }}
                            >
                                Descargar QR
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
