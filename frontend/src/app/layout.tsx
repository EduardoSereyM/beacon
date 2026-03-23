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
    default: "Beacon Protocol — Motor de Integridad Digital",
    template: "%s | Beacon Protocol",
  },
  description:
    "Evalúa políticos, empresarios y personajes públicos de Chile. " +
    "Verificación humana forense. La verdad validada.",
  keywords: [
    "beacon",
    "integridad",
    "reputación",
    "votación",
    "verificación",
    "políticos Chile",
    "empresarios Chile",
    "transparencia",
    "accountability",
    "Motor de Integridad Digital",
  ],
  authors: [{ name: "Beacon Protocol", url: "https://www.beaconchile.cl" }],
  creator: "Beacon Protocol",
  publisher: "Beacon Protocol",

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
    siteName: "Beacon Protocol",
    title: "Beacon Protocol — Motor de Integridad Digital",
    description:
      "Evalúa políticos, empresarios y personajes públicos de Chile. " +
      "Verificación humana forense. La verdad validada.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Beacon Protocol — Motor de Integridad Digital",
        type: "image/png",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Beacon Protocol — Motor de Integridad Digital",
    description:
      "Evalúa políticos, empresarios y personajes públicos de Chile. " +
      "Verificación humana forense. La verdad validada.",
    images: ["/og-image.png"],
    site: "@beaconprotocol",
  },

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
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
              BEACON PROTOCOL v1.0 — &quot;Lo que no es íntegro, no existe.&quot;
            </p>
            <p className="text-xs text-foreground-muted">
              Desarrollo ESM; 2026
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
