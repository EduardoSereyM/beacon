/**
 * BEACON PROTOCOL — Verdict Button (Botón de Veredicto)
 * ======================================================
 * Comportamiento visual diferenciado por rango:
 *
 * 🔒 DISPLACED  → Bloqueado con candado. "Tu voz no tiene peso aquí."
 * 🥉 BRONZE     → Botón estándar, sin efecto especial.
 * 🥈 SILVER     → Botón con check de identidad verificada.
 * 🥇 GOLD       → Masivo, borde #D4AF37, pulso, partículas doradas.
 * 💎 DIAMOND    → Igual que Gold pero con aura cyan.
 *
 * "El peso de tu voto depende del peso de tu integridad."
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type UserRank = "DISPLACED" | "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

interface VerdictButtonProps {
    rank: UserRank;
    onVerdict?: () => void;
    entityName?: string;
}

/** Partícula dorada para la animación Gold */
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
}: VerdictButtonProps) {
    const [isAnimating, setIsAnimating] = useState(false);
    const [particles, setParticles] = useState<Particle[]>([]);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const animFrameRef = useRef<number>(0);

    /** Dispara partículas doradas (solo Gold/Diamond) */
    const fireParticles = useCallback(() => {
        const newParticles: Particle[] = Array.from({ length: 24 }, (_, i) => ({
            id: Date.now() + i,
            x: 0,
            y: 0,
            angle: (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.5,
            speed: 2 + Math.random() * 4,
            size: 3 + Math.random() * 5,
            opacity: 1,
            life: 1,
        }));

        setParticles(newParticles);
        setIsAnimating(true);

        // Animar partículas
        let frame = 0;
        const animate = () => {
            frame++;
            setParticles((prev) =>
                prev
                    .map((p) => ({
                        ...p,
                        x: p.x + Math.cos(p.angle) * p.speed,
                        y: p.y + Math.sin(p.angle) * p.speed - 0.5, // Gravedad inversa
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
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, []);

    const handleClick = () => {
        if (rank === "DISPLACED") return;
        if (rank === "GOLD" || rank === "DIAMOND") {
            fireParticles();
        }
        onVerdict?.();
    };

    // ─── DISPLACED: Bloqueado ───
    if (rank === "DISPLACED") {
        return (
            <div className="relative">
                <button
                    disabled
                    className="w-full py-4 px-6 rounded-xl text-sm font-medium cursor-not-allowed transition-all displaced-box"
                    style={{
                        border: "1px solid rgba(255, 255, 255, 0.03)",
                        color: "rgba(136, 136, 136, 0.5)",
                    }}
                >
                    <div className="flex items-center justify-center gap-3">
                        <span className="text-lg">🔒</span>
                        <div className="text-left">
                            <p className="text-xs font-semibold displaced-text">
                                Tu voz no tiene peso aquí.
                            </p>
                            <p className="text-[9px] displaced-text mt-0.5">
                                Alíneate con el búnker para votar.
                            </p>
                        </div>
                    </div>
                </button>
            </div>
        );
    }

    // ─── BRONZE: Estándar ───
    if (rank === "BRONZE") {
        return (
            <button
                onClick={handleClick}
                className="w-full py-3 px-6 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all hover:bg-beacon-surface"
                style={{
                    border: "1px solid rgba(205, 127, 50, 0.3)",
                    color: "#cd7f32",
                    backgroundColor: "rgba(205, 127, 50, 0.05)",
                }}
            >
                Emitir Voto Estándar
            </button>
        );
    }

    // ─── SILVER: Con check verificado ───
    if (rank === "SILVER") {
        return (
            <button
                onClick={handleClick}
                className="w-full py-3.5 px-6 rounded-lg text-sm font-bold uppercase tracking-wider transition-all hover:shadow-lg"
                style={{
                    border: "1px solid rgba(192, 192, 192, 0.3)",
                    color: "#C0C0C0",
                    backgroundColor: "rgba(192, 192, 192, 0.05)",
                }}
            >
                <span className="flex items-center justify-center gap-2">
                    ✓ Emitir Veredicto Certificado
                </span>
            </button>
        );
    }

    // ─── GOLD / DIAMOND: Masivo con partículas ───
    const isGold = rank === "GOLD";
    const accentColor = isGold ? "#D4AF37" : "#b9f2ff";
    const neonClass = isGold ? "neon-gold" : "neon-diamond";

    return (
        <div className="relative">
            {/* Partículas doradas/cyan */}
            {particles.length > 0 && (
                <div className="absolute inset-0 pointer-events-none overflow-visible z-10">
                    {particles.map((p) => (
                        <div
                            key={p.id}
                            className="absolute rounded-full"
                            style={{
                                left: `calc(50% + ${p.x}px)`,
                                top: `calc(50% + ${p.y}px)`,
                                width: p.size,
                                height: p.size,
                                backgroundColor: accentColor,
                                opacity: p.opacity,
                                boxShadow: `0 0 ${p.size * 2}px ${accentColor}80`,
                                transform: "translate(-50%, -50%)",
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Botón masivo */}
            <button
                ref={buttonRef}
                onClick={handleClick}
                className={`w-full py-5 px-8 rounded-xl text-base font-black uppercase tracking-[0.15em] transition-all duration-300 pulse-live ${neonClass} ${isAnimating ? "scale-95" : "hover:scale-[1.02]"
                    }`}
                style={{
                    border: `2px solid ${accentColor}`,
                    color: isAnimating ? "#0A0A0A" : accentColor,
                    backgroundColor: isAnimating
                        ? accentColor
                        : `${accentColor}10`,
                    boxShadow: `0 0 20px ${accentColor}30, 0 0 40px ${accentColor}10`,
                }}
            >
                <span className="flex items-center justify-center gap-3">
                    <span className="text-xl">{isGold ? "⚖️" : "💎"}</span>
                    <div>
                        <p>Emitir Veredicto Magistral</p>
                        <p
                            className="text-[9px] font-normal mt-0.5 tracking-wider"
                            style={{ color: `${accentColor}99` }}
                        >
                            Peso 2.5x · Anclado al inicio · Resaltado en {isGold ? "oro" : "diamante"}
                        </p>
                    </div>
                </span>
            </button>
        </div>
    );
}
