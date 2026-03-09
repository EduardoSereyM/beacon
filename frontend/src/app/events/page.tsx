/**
 * BEACON PROTOCOL — /events (Eventos en Vivo)
 * =============================================
 * Server Component con metadata SEO.
 * Placeholder para votaciones en eventos temporales.
 * Los votos aquí van a event_votes, NO al ranking histórico de entidades.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Eventos en Vivo — Beacon Protocol",
  description:
    "Evalúa eventos en tiempo real: discursos, debates, conferencias. La audiencia verificada emite su juicio colectivo.",
  openGraph: {
    title: "Eventos en Vivo — Beacon Protocol",
    description:
      "El Efecto Kahoot aplicado a la política real. Reacciones verificadas, ponderadas por integridad ciudadana.",
    type: "website",
  },
};

export default function EventsPage() {
  return (
    <div className="min-h-screen pt-20 pb-12 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="pt-16 pb-8">
          <p className="text-6xl mb-6">📡</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            <span className="text-foreground">Eventos </span>
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #00E5FF, #39FF14)" }}
            >
              en Vivo
            </span>
          </h1>
          <p className="text-sm text-foreground-muted max-w-md mx-auto leading-relaxed">
            Evalúa eventos en tiempo real. Discursos, debates, conferencias: la
            audiencia verificada emite su juicio colectivo. Los votos no afectan el
            ranking histórico de entidades.
          </p>
        </div>

        <div
          className="rounded-xl p-10 mt-8"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,229,255,0.05) 0%, rgba(57,255,20,0.05) 100%)",
            border: "1px solid rgba(0,229,255,0.15)",
          }}
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6"
            style={{
              border: "1px solid rgba(0,229,255,0.3)",
              backgroundColor: "rgba(0,229,255,0.08)",
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "#00E5FF" }}
            />
            <span
              className="text-[10px] tracking-[0.2em] uppercase font-mono"
              style={{ color: "#00E5FF" }}
            >
              Próximamente
            </span>
          </div>

          <h2 className="text-lg font-bold text-foreground mb-3">
            Evaluación de Eventos en Directo
          </h2>
          <p className="text-xs text-foreground-muted font-mono max-w-sm mx-auto mb-6">
            El Efecto Kahoot aplicado a la política real. Reacciones verificadas,
            ponderadas por integridad ciudadana. Tabla separada{" "}
            <code className="text-[#D4AF37]">event_votes</code> — el ranking
            histórico permanece inmutable.
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
