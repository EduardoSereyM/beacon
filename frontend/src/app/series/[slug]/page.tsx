/**
 * BEACON CHILE — /series/[slug] (Server Component)
 * =================================================
 * Tendencia pública de una serie de encuestas recurrentes.
 * API: GET /api/v1/series/{slug}/trend (revalidada cada 60 s, igual que su Cache-Control).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeriesTrendClient from "./SeriesTrendClient";
import { cadenceLabel } from "@/lib/series";
import { fetchSegments, fetchTrend } from "@/lib/seriesApi";

const BASE_URL = "https://www.beaconchile.cl";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const trend = await fetchTrend(slug);
  if (!trend) return { title: "Serie — Beacon Chile" };
  const image = `${BASE_URL}/api/og/serie/${encodeURIComponent(slug)}?format=wide`;
  return {
    title: `${trend.series.title} — tendencia ${cadenceLabel(trend.series.cadence)} | Beacon Chile`,
    description: `Cómo cambia en el tiempo la opinión de los ciudadanos verificados de Beacon Chile. Serie ${cadenceLabel(trend.series.cadence)}, resultados abiertos.`,
    openGraph: { images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [trend, segments] = await Promise.all([fetchTrend(slug), fetchSegments(slug)]);
  if (!trend) notFound();
  return <SeriesTrendClient trend={trend} segments={segments} />;
}
