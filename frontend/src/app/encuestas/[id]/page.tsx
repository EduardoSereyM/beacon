/**
 * BEACON CHILE — /encuestas/[slug] (Server Component)
 * ======================================================
 * - generateMetadata: OG tags dinámicos con datos en vivo
 * - JSON-LD Schema.org SurveyResults: solo en encuestas cerradas
 * - Render: delega al Client Component
 *
 * Next.js deduplica automáticamente el fetch cuando la URL es idéntica
 * en generateMetadata y en el default export (misma request).
 *
 * URL canónica: beaconchile.cl/encuestas/{slug}
 * API:          GET /api/v1/polls/by-slug/{slug}
 */

import type { Metadata } from "next";
import EncuestaDetailClient from "./EncuestaDetailClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const BASE_URL = "https://www.beaconchile.cl";

// ── Fetch compartido (deduplicado por Next.js dentro de la misma request) ──────
async function fetchPollForServer(slug: string) {
  try {
    const res = await fetch(`${API_URL}/api/v1/polls/by-slug/${slug}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Metadata dinámica ──────────────────────────────────────────────────────────
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const { id: slug } = await params;
  const sp = await searchParams;
  const poll = await fetchPollForServer(slug);
  if (!poll) return { title: "Encuesta — Beacon Chile" };

  const title  = poll.title ?? "Encuesta Ciudadana";
  const votes  = poll.total_votes ?? 0;

  const voteLabel =
    votes === 0
      ? "Sé el primero en votar"
      : votes === 1
      ? "1 ciudadano ya votó"
      : `${votes.toLocaleString("es-CL")} ciudadanos ya votaron`;

  const description =
    `${voteLabel}. ¿Cuál es tu opinión? Vota y ve los resultados en tiempo real.`;

  // ?resultado=1 → preview muestra imagen de resultados (compartir post-voto)
  const ogImage = sp.resultado === "1"
    ? `${BASE_URL}/api/og/resultado/${slug}`
    : `${BASE_URL}/api/og/encuesta/${slug}`;
  const url     = `${BASE_URL}/encuestas/${slug}`;

  return {
    title: `${title} — Beacon Chile`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type:     "website",
      locale:   "es_CL",
      siteName: "Beacon Chile",
      images:   [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description,
      images:      [ogImage],
      site:        "@beaconchile",
    },
  };
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default async function EncuestaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  const poll = await fetchPollForServer(slug);

  // JSON-LD solo para encuestas cerradas — datos estables, útil para SEO
  const jsonLd =
    poll && !poll.is_open
      ? {
          "@context": "https://schema.org",
          "@type": "SurveyResults",
          name: poll.title,
          about: {
            "@type": "Thing",
            name:
              poll.category && poll.category !== "general"
                ? poll.category
                : poll.tags?.[0] ?? "Opinión ciudadana",
          },
          numberOfParticipants: poll.total_votes ?? 0,
          // ends_at es la fecha de cierre; datePublished = cuando quedó cerrada
          datePublished: poll.ends_at
            ? new Date(poll.ends_at).toISOString().split("T")[0]
            : undefined,
          url: `${BASE_URL}/encuestas/${slug}`,
          publisher: {
            "@type": "Organization",
            name: "Beacon Chile",
            url: BASE_URL,
          },
        }
      : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <EncuestaDetailClient params={params} />
    </>
  );
}
