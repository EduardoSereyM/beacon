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
      <body className="antialiased min-h-screen">
        {/* ─── Navbar Glassmorphism ─── */}
        <nav className="glass-strong fixed top-0 left-0 right-0 z-50 px-6 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-beacon-gold flex items-center justify-center glow-gold">
              <span className="text-beacon-black text-sm font-black">B</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground tracking-wide uppercase">
                Beacon Protocol
              </h1>
              <p className="text-[10px] text-foreground-muted tracking-[0.2em] uppercase">
                Motor de Integridad
              </p>
            </div>
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-beacon-green pulse-live" />
              <span className="text-xs text-foreground-muted font-mono score-display">
                SECURITY: GREEN
              </span>
            </div>
          </div>
        </nav>

        {/* ─── Main Content ─── */}
        <main className="pt-16 min-h-screen">
          {children}
        </main>

        {/* ─── Footer ─── */}
        <footer className="border-t border-beacon-border px-6 py-4 text-center">
          <p className="text-xs text-foreground-muted">
            Beacon Protocol v0.1.0 — &quot;Lo que no es íntegro, no existe.&quot;
          </p>
        </footer>
      </body>
    </html>
  );
}
