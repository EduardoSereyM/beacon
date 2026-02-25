/**
 * BEACON PROTOCOL — Root Layout (Arquitectura Sovereign)
 * ========================================================
 * Navbar glassmorphism con:
 *   - Logo Oro Líquido (#D4AF37) a la izquierda con glow neón
 *   - Buscador minimalista central (borde inferior cian #00E5FF)
 *   - Links de navegación + botón "Acceso al Búnker" con
 *     gradiente Gold → Purple (#D4AF37 → #8A2BE2)
 *
 * "La estructura es el búnker. El contenido es el oro."
 */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beacon Protocol — Motor de Integridad Digital",
  description:
    "Infraestructura de confianza humana verificada. " +
    "Donde tu voz tiene peso y tu integridad tiene valor.",
  keywords: ["beacon", "integridad", "reputación", "votación", "verificación"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen">
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
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* ─── Logo (Oro Líquido) ─── */}
            <a href="/" className="flex items-center gap-3 group">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center neon-gold transition-all duration-300 group-hover:scale-105"
                style={{
                  background: "linear-gradient(135deg, #D4AF37, #f5d374)",
                }}
              >
                <span className="text-[#0A0A0A] text-sm font-black tracking-tighter">
                  B
                </span>
              </div>
              <div>
                <h1
                  className="text-sm font-bold tracking-wide uppercase"
                  style={{ color: "#D4AF37" }}
                >
                  Beacon Protocol
                </h1>
                <p className="text-[9px] text-foreground-muted tracking-[0.25em] uppercase">
                  Motor de Integridad
                </p>
              </div>
            </a>

            {/* ─── Buscador Minimalista (borde inferior cian) ─── */}
            <div className="hidden md:flex items-center flex-1 max-w-sm mx-8">
              <div className="relative w-full">
                <input
                  type="text"
                  placeholder="Buscar entidades, personas, eventos..."
                  className="w-full bg-transparent text-sm text-foreground placeholder-foreground-muted px-3 py-2 outline-none font-mono"
                  style={{
                    borderBottom: "1px solid #00E5FF",
                    caretColor: "#00E5FF",
                  }}
                />
                <div
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: "#00E5FF" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
              </div>
            </div>

            {/* ─── Navigation Links ─── */}
            <div className="flex items-center gap-5">
              <a
                href="/events"
                className="hidden sm:block text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium"
              >
                Eventos
              </a>
              <a
                href="/entities"
                className="hidden sm:block text-xs text-foreground-muted hover:text-foreground transition-colors uppercase tracking-wider font-medium"
              >
                Empresas
              </a>

              {/* Botón Acceso al Búnker (gradiente Gold → Purple) */}
              <a
                href="/dashboard"
                className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white transition-all duration-300 hover:scale-105 hover:shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #D4AF37, #8A2BE2)",
                  boxShadow:
                    "0 0 12px rgba(212, 175, 55, 0.2), 0 0 12px rgba(138, 43, 226, 0.2)",
                }}
              >
                Acceso al Búnker
              </a>
            </div>
          </div>
        </nav>

        {/* ═══ Main Content ═══ */}
        <main className="pt-16 min-h-screen">{children}</main>

        {/* ═══ Footer ═══ */}
        <footer className="border-t border-beacon-border px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <p className="text-[10px] text-foreground-muted font-mono">
              BEACON PROTOCOL v1.0 — &quot;Lo que no es íntegro, no existe.&quot;
            </p>
            <p className="text-[10px] text-foreground-muted">
              Sang​re y Código &copy; 2026
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
