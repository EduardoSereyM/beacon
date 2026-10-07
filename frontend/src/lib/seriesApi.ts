/**
 * BEACON CHILE — Lecturas de la API pública de series (servidor)
 * ===============================================================
 * Compartidas por la página de tendencia, el informe y la imagen para compartir. Revalidan cada
 * 60 s, igual que el Cache-Control del backend. Devuelven null ante cualquier error (cold start incluido).
 */

import type { SegmentsData, SeriesTrend } from "@/lib/series";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1${path}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const fetchTrend = (slug: string) => getJson<SeriesTrend>(`/series/${encodeURIComponent(slug)}/trend`);

export const fetchSegments = (slug: string, edition?: string) =>
  getJson<SegmentsData>(`/series/${encodeURIComponent(slug)}/segments${edition ? `?edition=${encodeURIComponent(edition)}` : ""}`);
