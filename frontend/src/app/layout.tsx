/**
 * BEACON PROTOCOL — Root Layout (Arquitectura Sovereign)
 * ========================================================
 * Navbar glassmorphism con:
 *   - Logo Oro Líquido (#D4AF37) a la izquierda con glow neón
 *   - Buscador minimalista central (borde inferior cian #00E5FF)
 *   - Links de navegación + botón "Acceso al Búnker" que abre AuthModal
 *
 * "La estructura es el búnker. El contenido es el oro."
 */

import type { Metadata } from "next";
import "./globals.css";
import NavbarClient from "@/components/bunker/NavbarClient";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.beaconchile.cl"),

  title: {
    default: "Beacon Chile — Opinión ciudadana verificada",
    template: "%s",
  },
  description:
    "Encuestas ciudadanas verificadas de Chile. Sin panel seleccionado, sin bots. " +
    "Vota, ve los resultados en tiempo real y propón preguntas.",
  keywords: [
    "encuestas Chile",
    "opinión ciudadana",
    "verificación identidad",
    "política Chile",
    "votación online",
    "datos reales",
    "beacon chile",
    "transparencia",
    "accountability",
  ],
  authors: [{ name: "Beacon Chile", url: "https://www.beaconchile.cl" }],
  creator: "Beacon Chile",
  publisher: "Beacon Chile",

  alternates: {
    canonical: "/",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  openGraph: {
    type: "website",
    locale: "es_CL",
    url: "https://www.beaconchile.cl",
    siteName: "Beacon Chile",
    title: "Beacon Chile — Opinión ciudadana verificada",
    description:
      "Encuestas ciudadanas verificadas de Chile. Sin panel seleccionado, sin bots. " +
      "Vota, ve los resultados en tiempo real y propón preguntas.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Beacon Chile — Opinión ciudadana verificada",
        type: "image/png",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Beacon Chile — Opinión ciudadana verificada",
    description:
      "Encuestas ciudadanas verificadas de Chile. Sin panel seleccionado, sin bots. " +
      "Vota, ve los resultados en tiempo real y propón preguntas.",
    images: ["/og-image.png"],
    site: "@beaconchile",
  },

  icons: {
    icon: "/favicon.ico?v=2",
    shortcut: "/favicon.ico?v=2",
    apple: "/favicon.ico?v=2",
  },
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
        {/* ═══ Navbar + AuthModal (Client Component) ═══ */}
        <NavbarClient />

        {/* ═══ Main Content ═══ */}
        <main className="pt-16 min-h-screen">{children}</main>

        {/* ═══ Footer ═══ */}
        <footer className="border-t border-beacon-border px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <p className="text-xs text-foreground-muted font-mono">
              BEACON CHILE — &quot;Lo que no es íntegro, no existe.&quot;
            </p>
            <p className="text-xs text-foreground-muted">
              © 2026 Beacon Chile
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
