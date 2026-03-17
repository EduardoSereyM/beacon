/**
 * BEACON PROTOCOL — Encuesta Detail Page
 * ========================================
 * Ruta dinámica: /encuestas/[id]
 * Participación en encuesta pública con QR compartible.
 * Multi-pregunta: opción múltiple y/o escala numérica por pregunta.
 */

"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import ShareQR from "@/components/shared/ShareQR";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Question {
    id: string;
    question_text: string;
    question_type: "multiple_choice" | "numeric_scale";
    options: string[] | null;
    scale_min: number;
    scale_max: number;
    order_index: number;
}

interface Poll {
    id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    end_at: string | null;
    poll_questions: Question[];
}

interface EncuestaPageProps {
    params: Promise<{ id: string }>;
}

export default function EncuestaDetailPage({ params }: EncuestaPageProps) {
    const { id } = use(params);

    const [poll, setPoll] = useState<Poll | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    // Respuestas: question_id → answer
    const [answers, setAnswers] = useState<Record<string, { option?: string; value?: number }>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${API_URL}/api/v1/encuestas/${id}`)
            .then((r) => {
                if (r.status === 404) { setNotFound(true); return null; }
                return r.json();
            })
            .then((d) => { if (d) setPoll(d); })
            .finally(() => setLoading(false));
    }, [id]);

    function setOption(qid: string, option: string) {
        setAnswers((prev) => ({ ...prev, [qid]: { option } }));
    }

    function setScale(qid: string, value: number) {
        setAnswers((prev) => ({ ...prev, [qid]: { value } }));
    }

    async function handleSubmit() {
        if (!poll) return;
        const token = localStorage.getItem("beacon_token");
        if (!token) { setError("Debes iniciar sesión para participar."); return; }

        // Verificar todas las preguntas respondidas
        const missing = poll.poll_questions.find((q) => !answers[q.id]);
        if (missing) { setError(`Responde la pregunta: "${missing.question_text}"`); return; }

        setSubmitting(true);
        setError(null);

        const payload = {
            answers: poll.poll_questions.map((q) => ({
                question_id: q.id,
                answer: answers[q.id],
            })),
        };

        try {
            const res = await fetch(`${API_URL}/api/v1/encuestas/${id}/respond`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error enviando respuesta");
            setSubmitted(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error de conexión");
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <p className="text-foreground-muted font-mono animate-pulse text-sm">Cargando encuesta...</p>
        </div>
    );

    if (notFound || !poll) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <p className="text-4xl mb-4">📊</p>
                <p className="text-sm text-foreground-muted mb-4">Encuesta no encontrada o inactiva.</p>
                <Link href="/encuestas" className="text-xs font-mono" style={{ color: "#00E5FF" }}>← Volver a encuestas</Link>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen pt-20 pb-12 px-6">
            <div className="max-w-2xl mx-auto">
                {/* Breadcrumb */}
                <div className="flex items-center gap-3 mb-6">
                    <Link href="/encuestas" className="text-foreground-muted hover:text-foreground text-xs font-mono transition-colors">
                        ← Encuestas
                    </Link>
                    <span className="text-foreground-muted text-xs">/</span>
                    <span className="text-xs font-mono tracking-wider" style={{ color: "#39FF14" }}>
                        POLL:{id.slice(0, 8).toUpperCase()}
                    </span>
                    <div className="ml-auto">
                        <ShareQR
                            url={`${typeof window !== "undefined" ? window.location.origin : "https://www.beaconchile.cl"}/encuestas/${id}`}
                            title={poll.title}
                            label="Compartir"
                        />
                    </div>
                </div>

                {/* Card encuesta */}
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(57,255,20,0.12)" }}>
                    {/* Imagen cabecera */}
                    {poll.cover_image_url && (
                        <div className="relative w-full h-48">
                            <Image src={poll.cover_image_url} alt={poll.title} fill className="object-cover" />
                            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(10,10,10,0.9))" }} />
                        </div>
                    )}

                    <div className="p-6" style={{ background: "rgba(57,255,20,0.02)" }}>
                        <h1 className="text-xl font-bold text-foreground mb-2">{poll.title}</h1>
                        {poll.description && <p className="text-sm text-foreground-muted mb-1">{poll.description}</p>}
                        {poll.end_at && (
                            <p className="text-[10px] text-foreground-muted font-mono mb-4">
                                Cierra: {new Date(poll.end_at).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}
                            </p>
                        )}

                        {/* Estado respondido */}
                        {submitted ? (
                            <div
                                className="rounded-xl p-6 text-center"
                                style={{ background: "rgba(57,255,20,0.06)", border: "1px solid rgba(57,255,20,0.2)" }}
                            >
                                <p className="text-2xl mb-2">✅</p>
                                <p className="font-bold text-sm" style={{ color: "#39FF14" }}>¡Gracias por participar!</p>
                                <p className="text-xs text-foreground-muted mt-1">Tu respuesta fue registrada con ponderación por integridad.</p>
                            </div>
                        ) : (
                            <>
                                {/* Preguntas */}
                                <div className="space-y-6 mb-6">
                                    {poll.poll_questions.map((q, idx) => (
                                        <div key={q.id} className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                            <p className="text-[10px] font-mono text-foreground-muted uppercase mb-2">
                                                Pregunta {idx + 1}
                                            </p>
                                            <p className="text-sm font-semibold text-foreground mb-4">{q.question_text}</p>

                                            {/* Opción múltiple */}
                                            {q.question_type === "multiple_choice" && q.options && (
                                                <div className="space-y-2">
                                                    {q.options.map((opt) => (
                                                        <button
                                                            key={opt}
                                                            onClick={() => setOption(q.id, opt)}
                                                            className="w-full text-left px-4 py-3 rounded-lg text-sm transition-all"
                                                            style={{
                                                                background: answers[q.id]?.option === opt
                                                                    ? "rgba(212,175,55,0.15)"
                                                                    : "rgba(255,255,255,0.02)",
                                                                border: `1px solid ${answers[q.id]?.option === opt
                                                                    ? "rgba(212,175,55,0.5)"
                                                                    : "rgba(255,255,255,0.06)"}`,
                                                                color: answers[q.id]?.option === opt ? "#D4AF37" : "rgba(255,255,255,0.7)",
                                                            }}
                                                        >
                                                            {answers[q.id]?.option === opt && <span className="mr-2">✓</span>}
                                                            {opt}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Escala numérica */}
                                            {q.question_type === "numeric_scale" && (
                                                <div>
                                                    <div className="flex gap-2 flex-wrap">
                                                        {Array.from({ length: q.scale_max - q.scale_min + 1 }, (_, i) => q.scale_min + i).map((n) => (
                                                            <button
                                                                key={n}
                                                                onClick={() => setScale(q.id, n)}
                                                                className="w-10 h-10 rounded-lg text-sm font-bold transition-all hover:scale-110"
                                                                style={{
                                                                    background: answers[q.id]?.value === n
                                                                        ? "rgba(57,255,20,0.2)"
                                                                        : "rgba(255,255,255,0.04)",
                                                                    border: `1px solid ${answers[q.id]?.value === n
                                                                        ? "rgba(57,255,20,0.5)"
                                                                        : "rgba(255,255,255,0.08)"}`,
                                                                    color: answers[q.id]?.value === n ? "#39FF14" : "rgba(255,255,255,0.5)",
                                                                }}
                                                            >
                                                                {n}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="flex justify-between mt-2">
                                                        <span className="text-[9px] text-foreground-muted font-mono">{q.scale_min} — Mín</span>
                                                        <span className="text-[9px] text-foreground-muted font-mono">Máx — {q.scale_max}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Error */}
                                {error && (
                                    <div
                                        className="rounded-lg p-3 mb-4 text-xs font-mono"
                                        style={{ background: "rgba(255,7,58,0.08)", border: "1px solid rgba(255,7,58,0.2)", color: "#FF073A" }}
                                    >
                                        {error}
                                    </div>
                                )}

                                {/* Botón enviar */}
                                <button
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all hover:scale-[1.02]"
                                    style={{
                                        background: submitting ? "rgba(212,175,55,0.3)" : "linear-gradient(135deg, #D4AF37, #B8860B)",
                                        color: "#0A0A0A",
                                        opacity: submitting ? 0.7 : 1,
                                    }}
                                >
                                    {submitting ? "Enviando..." : "Enviar respuesta"}
                                </button>
                                <p className="text-[9px] text-foreground-muted font-mono text-center mt-2">
                                    Tu voto se pondera por tu rango de integridad (BASIC 0.5x · VERIFIED 1.0x)
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
