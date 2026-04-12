/**
 * BEACON PROTOCOL — /encuestas/[slug] (Server wrapper)
 * ======================================================
 * Genera Open Graph tags dinámicos con datos en vivo:
 *   título + votos actuales + resultado parcial
 * Delega el render al cliente EncuestaDetailClient.
 *
 * URL canónica: beaconchile.cl/encuestas/{slug}
 * API:          GET /api/v1/polls/by-slug/{slug}
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
  const { id: slug } = await params;
  try {
    const res = await fetch(`${API_URL}/api/v1/polls/by-slug/${slug}`, {
      next: { revalidate: 30 },   // 30s — datos en vivo para el OG
    });
    if (!res.ok) return { title: "Encuesta — BEACON" };
    const poll = await res.json();

    const title = poll.title ?? "Encuesta Ciudadana";
    const votes = poll.total_votes ?? 0;

    // OG con datos en vivo: votos actuales dan sensación de urgencia
    const description =
      `${votes.toLocaleString("es-CL")} votos · ` +
      (poll.description || "Participa en esta encuesta ciudadana verificada. Tu voto cuenta.");

    const image  = poll.header_image || DEFAULT_OG;
    const url    = `${BASE_URL}/encuestas/${slug}`;

    return {
      title: `${title} — Beacon`,
      description,
      alternates: { canonical: url },
      openGraph: {
        title,
        description,
        url,
        type:     "website",
        siteName: "Beacon Chile",
        images:   [{ url: image, width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card:        "summary_large_image",
        title,
        description,
        images:      [image],
        site:        "@beaconchile",
      },
    };
  } catch {
    return { title: "Encuesta — Beacon" };
  }
}

export default function EncuestaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EncuestaDetailClient params={params} />;
}
