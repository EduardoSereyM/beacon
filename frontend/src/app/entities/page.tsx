/**
 * BEACON PROTOCOL — /entities (En Construcción)
 * ================================================
 * El directorio de entidades está en desarrollo activo.
 * Prioridad actual: Encuestas ciudadanas.
 *
 * Retomar en v2.0+ cuando el flujo de encuestas esté consolidado.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Directorio de Entidades — Próximamente · Beacon",
  description:
    "El directorio de políticos, empresas y personajes públicos está en construcción. Mientras tanto, participa en nuestras encuestas ciudadanas.",
  robots: { index: false, follow: false },
};

export default function EntitiesPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-24">
      <div className="max-w-lg w-full text-center">

        {/* Icono */}
        <div className="flex items-center justify-center mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{
              background: "rgba(212,175,55,0.08)",
              border: "1px solid rgba(212,175,55,0.2)",
            }}
          >
            🏗️
          </div>
        </div>

        {/* Badge */}
        <div className="flex justify-center mb-4">
          <span
            className="text-[10px] font-mono uppercase tracking-[0.2em] px-3 py-1 rounded-full"
            style={{
              background: "rgba(212,175,55,0.08)",
              border: "1px solid rgba(212,175,55,0.2)",
              color: "#D4AF37",
            }}
          >
            En Construcción
          </span>
        </div>

        {/* Título */}
        <h1
          className="text-2xl sm:text-3xl font-bold uppercase tracking-wider mb-3"
          style={{ color: "#D4AF37" }}
        >
          Directorio de Entidades
        </h1>

        <p className="text-sm text-foreground-muted leading-relaxed mb-8">
          El módulo de evaluación de políticos, empresas y personajes públicos
          está en desarrollo activo. Estamos consolidando primero el sistema
          de encuestas ciudadanas para garantizar la mejor experiencia.
        </p>

        {/* Separador */}
        <div
          className="my-8 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(212,175,55,0.15), transparent)",
          }}
        />

        {/* CTA encuestas */}
        <p className="text-xs text-foreground-muted uppercase tracking-widest mb-4 font-mono">
          Mientras tanto
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/encuestas"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all hover:scale-105"
            style={{
              background: "rgba(0,229,255,0.08)",
              border: "1px solid rgba(0,229,255,0.25)",
              color: "#00E5FF",
            }}
          >
            📊 Ver Encuestas →
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-mono uppercase tracking-wider transition-all hover:opacity-80"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
