/**
 * BEACON PROTOCOL — /versus (Arena de Enfrentamientos)
 * =====================================================
 * Server Component con metadata SEO.
 * P3 pendiente: VS en tiempo real con votación ponderada.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Arena VS — Beacon Protocol",
  description:
    "Enfrentamientos directos entre entidades públicas. Compara lado a lado y emite tu veredicto ponderado por integridad.",
  openGraph: {
    title: "Arena VS — Beacon Protocol",
    description:
      "Duelos de integridad en tiempo real. Tu peso de voto depende de tu rango verificado.",
    type: "website",
  },
};

export default function VersusPage() {
  return (
    <div className="min-h-screen pt-20 pb-12 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="pt-16 pb-8">
          <p className="text-6xl mb-6">⚔️</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            <span className="text-foreground">Arena </span>
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #D4AF37, #8A2BE2)" }}
            >
              VS
            </span>
          </h1>
          <p className="text-sm text-foreground-muted max-w-md mx-auto leading-relaxed">
            Enfrentamientos directos entre entidades. Compara lado a lado y emite tu
            veredicto. El Protocolo pondera tu voto por tu nivel de integridad.
          </p>
        </div>

        <div
          className="rounded-xl p-10 mt-8"
          style={{
            background:
              "linear-gradient(135deg, rgba(212,175,55,0.05) 0%, rgba(138,43,226,0.05) 100%)",
            border: "1px solid rgba(212,175,55,0.15)",
          }}
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6"
            style={{
              border: "1px solid rgba(212,175,55,0.3)",
              backgroundColor: "rgba(212,175,55,0.08)",
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "#D4AF37" }}
            />
            <span
              className="text-[10px] tracking-[0.2em] uppercase font-mono"
              style={{ color: "#D4AF37" }}
            >
              En Desarrollo — P3
            </span>
          </div>

          <h2 className="text-lg font-bold text-foreground mb-3">
            Enfrentamientos en Tiempo Real
          </h2>
          <p className="text-xs text-foreground-muted font-mono max-w-sm mx-auto mb-6">
            Vota en duelos directos. Tu peso depende de tu rango: DIAMOND 4x,
            GOLD 2.5x, SILVER 1.5x, BRONZE 1x.
          </p>

          <Link
            href="/"
            className="inline-block text-[11px] font-mono uppercase tracking-wider px-5 py-2.5 rounded-lg transition-all hover:scale-105"
            style={{
              backgroundColor: "rgba(0,229,255,0.08)",
              border: "1px solid rgba(0,229,255,0.25)",
              color: "#00E5FF",
            }}
          >
            Volver al Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
