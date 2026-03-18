/**
 * BEACON PROTOCOL — /encuestas/[id] (Server wrapper)
 * =====================================================
 * Genera Open Graph tags dinámicos para preview en RRSS
 * (WhatsApp, Twitter/X, iMessage, Telegram, etc.)
 * y delega el render al cliente EncuestaDetailClient.
 */

import type { Metadata } from "next";
import EncuestaDetailClient from "./EncuestaDetailClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const BASE_URL = "https://www.beaconchile.cl";
const DEFAULT_OG = `${BASE_URL}/og-default.jpg`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_URL}/api/v1/polls/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { title: "Encuesta — BEACON" };
    const poll = await res.json();

    const title = poll.title ?? "Encuesta Ciudadana";
    const description =
      poll.description ||
      `Participa en esta encuesta ciudadana verificada. ${poll.total_votes ?? 0} votos. Tu voz ponderada por integridad.`;
    const image = poll.header_image || DEFAULT_OG;
    const url = `${BASE_URL}/encuestas/${id}`;

    return {
      title: `${title} — Encuesta BEACON`,
      description,
      openGraph: {
        title,
        description,
        url,
        type: "website",
        siteName: "BEACON Protocol",
        images: [{ url: image, width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [image],
        site: "@beaconchile",
      },
    };
  } catch {
    return { title: "Encuesta — BEACON" };
  }
}

export default function EncuestaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EncuestaDetailClient params={params} />;
}
