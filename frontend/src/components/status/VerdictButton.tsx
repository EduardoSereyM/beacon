/**
 * BEACON PROTOCOL — Verdict Button (Botón de Veredicto)
 * ======================================================
 * Comportamiento visual diferenciado por rango.
 * Soporta estados: idle | loading | voted | error
 *
 * Sistema v1: BASIC (0.5x) | VERIFIED (1.0x) | DISPLACED (bloqueado)
 *
 * "El peso de tu voto depende del peso de tu integridad."
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type UserRank = "DISPLACED" | "BASIC" | "VERIFIED";
type VoteStatus = "idle" | "loading" | "voted" | "error";

interface VerdictButtonProps {
    rank: UserRank;
    onVerdict?: () => Promise<void>;
    entityName?: string;
    voteStatus?: VoteStatus;
    voteMessage?: string;
}

interface Particle {
    id: number;
    x: number;
    y: number;
    angle: number;
    speed: number;
    size: number;
    opacity: number;
    life: number;
}

export default function VerdictButton({
    rank,
    onVerdict,
    entityName = "esta entidad",
    voteStatus = "idle",
    voteMessage = "",
}: VerdictButtonProps) {
    const [particles, setParticles] = useState<Particle[]>([]);
    const [isAnimating, setIsAnimating] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const animFrameRef = useRef<number>(0);

    const fireParticles = useCallback(() => {
        const newParticles: Particle[] = Array.from({ length: 24 }, (_, i) => ({
            id: Date.now() + i,
            x: 0, y: 0,
            angle: (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.5,
            speed: 2 + Math.random() * 4,
            size: 3 + Math.random() * 5,
            opacity: 1,
            life: 1,
        }));
        setParticles(newParticles);
        setIsAnimating(true);
        let frame = 0;
        const animate = () => {
            frame++;
            setParticles((prev) =>
                prev
                    .map((p) => ({
                        ...p,
                        x: p.x + Math.cos(p.angle) * p.speed,
                        y: p.y + Math.sin(p.angle) * p.speed - 0.5,
                        opacity: Math.max(0, p.opacity - 0.02),
                        life: p.life - 0.02,
                        speed: p.speed * 0.97,
                    }))
                    .filter((p) => p.life > 0)
            );
            if (frame < 60) {
                animFrameRef.current = requestAnimationFrame(animate);
            } else {
                setIsAnimating(false);
                setParticles([]);
            }
        };
        animFrameRef.current = requestAnimationFrame(animate);
    }, []);

    useEffect(() => {
        return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
    }, []);

    const handleClick = async () => {
        if (rank === "DISPLACED" || voteStatus === "loading" || voteStatus === "voted") return;
        if (rank === "VERIFIED") fireParticles();
        await onVerdict?.();
    };

    const isDisabled = voteStatus === "loading" || voteStatus === "voted";

    // ─── DISPLACED: Bloqueado ───
    if (rank === "DISPLACED") {
        return (
            <div className="relative">
                <button disabled className="w-full py-4 px-6 rounded-xl text-sm font-medium cursor-not-allowed transition-all displaced-box"
                    style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(136,136,136,0.6)" }}>
                    <div className="flex items-center justify-center gap-3">
                        <span className="text-lg">🔒</span>
                        <div className="text-left">
                            <p className="text-xs font-semibold displaced-text">Tu voz no tiene peso aquí.</p>
                            <p className="text-[11px] displaced-text mt-0.5">Alíneate con el búnker para votar.</p>
                        </div>
                    </div>
                </button>
            </div>
        );
    }

    // ─── Feedback de voto emitido ───
    const feedbackBlock = voteMessage ? (
        <div
            className="mt-3 px-3 py-2 rounded-lg text-xs font-mono text-center"
            style={{
                backgroundColor: voteStatus === "voted" ? "rgba(57,255,20,0.08)" : "rgba(255,7,58,0.08)",
                color: voteStatus === "voted" ? "#39FF14" : "#FF073A",
                border: `1px solid ${voteStatus === "voted" ? "rgba(57,255,20,0.2)" : "rgba(255,7,58,0.2)"}`,
            }}
        >
            {voteMessage}
        </div>
    ) : null;

    // ─── BASIC: Voto Estándar (0.5x) ───
    if (rank === "BASIC") {
        return (
            <div>
                <button
                    ref={buttonRef}
                    onClick={handleClick}
                    disabled={isDisabled}
                    className="w-full py-3 px-6 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all hover:bg-beacon-surface disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                        border: `1px solid ${voteStatus === "voted" ? "rgba(57,255,20,0.4)" : "rgba(150,150,150,0.3)"}`,
                        color: voteStatus === "voted" ? "#39FF14" : "#aaaaaa",
                        backgroundColor: voteStatus === "voted" ? "rgba(57,255,20,0.05)" : "rgba(150,150,150,0.05)",
                    }}
                >
                    {voteStatus === "loading" ? "Enviando veredicto..." : voteStatus === "voted" ? "✓ Voto Registrado" : "Emitir Voto"}
                </button>
                {feedbackBlock}
            </div>
        );
    }

    // ─── VERIFIED: Veredicto Certificado con partículas (1.0x) ───
    const accentColor = "#C0C0C0";

    return (
        <div className="relative">
            {particles.length > 0 && (
                <div className="absolute inset-0 pointer-events-none overflow-visible z-10">
                    {particles.map((p) => (
                        <div key={p.id} className="absolute rounded-full"
                            style={{
                                left: `calc(50% + ${p.x}px)`, top: `calc(50% + ${p.y}px)`,
                                width: p.size, height: p.size,
                                backgroundColor: accentColor, opacity: p.opacity,
                                boxShadow: `0 0 ${p.size * 2}px ${accentColor}80`,
                                transform: "translate(-50%, -50%)",
                            }}
                        />
                    ))}
                </div>
            )}
            <button
                ref={buttonRef}
                onClick={handleClick}
                disabled={isDisabled}
                className={`w-full py-4 px-8 rounded-xl text-sm font-bold uppercase tracking-[0.12em] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed ${isAnimating ? "scale-95" : "hover:scale-[1.01]"}`}
                style={{
                    border: `1px solid ${voteStatus === "voted" ? "rgba(57,255,20,0.4)" : "rgba(192,192,192,0.4)"}`,
                    color: isAnimating ? "#0A0A0A" : voteStatus === "voted" ? "#39FF14" : accentColor,
                    backgroundColor: isAnimating ? accentColor : voteStatus === "voted" ? "rgba(57,255,20,0.05)" : "rgba(192,192,192,0.06)",
                    boxShadow: `0 0 12px rgba(192,192,192,0.15)`,
                }}
            >
                <span className="flex items-center justify-center gap-2">
                    <span>{voteStatus === "voted" ? "✓" : "✔"}</span>
                    <div>
                        <p>{voteStatus === "loading" ? "Enviando..." : voteStatus === "voted" ? "Veredicto Certificado Registrado" : "Emitir Veredicto Certificado"}</p>
                        {voteStatus === "idle" && (
                            <p className="text-[11px] font-normal mt-0.5 tracking-wider" style={{ color: `${accentColor}bb` }}>
                                Identidad verificada · Peso 1.0x
                            </p>
                        )}
                    </div>
                </span>
            </button>
            {feedbackBlock}
        </div>
    );
}
