/**
 * BEACON CHILE — /series/[slug] (Server Component)
 * =================================================
 * Tendencia pública de una serie de encuestas recurrentes.
 * API: GET /api/v1/series/{slug}/trend (revalidada cada 60 s, igual que su Cache-Control).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeriesTrendClient from "./SeriesTrendClient";
import { cadenceLabel, type SegmentsData, type SeriesTrend } from "@/lib/series";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchTrend(slug: string): Promise<SeriesTrend | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/series/${encodeURIComponent(slug)}/trend`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as SeriesTrend;
  } catch {
    return null;
  }
}

async function fetchSegments(slug: string): Promise<SegmentsData | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/series/${encodeURIComponent(slug)}/segments`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as SegmentsData;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const trend = await fetchTrend(slug);
  if (!trend) return { title: "Serie — Beacon Chile" };
  return {
    title: `${trend.series.title} — tendencia ${cadenceLabel(trend.series.cadence)} | Beacon Chile`,
    description: `Cómo cambia en el tiempo la opinión de los ciudadanos verificados de Beacon Chile. Serie ${cadenceLabel(trend.series.cadence)}, resultados abiertos.`,
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [trend, segments] = await Promise.all([fetchTrend(slug), fetchSegments(slug)]);
  if (!trend) notFound();
  return <SeriesTrendClient trend={trend} segments={segments} />;
}
