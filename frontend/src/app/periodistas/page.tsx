/**
 * BEACON PROTOCOL — /periodistas (Personajes Públicos)
 * =====================================================
 * Server Component Híbrido: SEO + hidratación server-side.
 * Categoría pre-fijada: periodista.
 *
 * ISR: revalida cada 60s.
 */

import type { Metadata } from "next";
import EntitiesListPage from "@/components/shared/EntitiesListPage";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Personajes Públicos — Beacon Protocol",
  description:
    "Figuras mediáticas y líderes de opinión evaluados por su audiencia real y verificada. Periodistas, influencers y comunicadores.",
  openGraph: {
    title: "Personajes Públicos — Beacon Protocol",
    description:
      "Accountability mediático con votos ponderados por integridad. Quién informa y qué tan confiable es.",
    type: "website",
  },
  keywords: ["periodistas", "medios", "comunicadores", "Chile", "integridad", "opinión"],
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchInitialEntities(category: string) {
  try {
    const query = new URLSearchParams({ category, limit: "24", offset: "0" });
    const res = await fetch(`${API_URL}/api/v1/entities?${query.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { entities: [], total: 0 };
    return await res.json();
  } catch {
    return { entities: [], total: 0 };
  }
}

export default async function PeriodistasPage() {
  const initialData = await fetchInitialEntities("periodista");

  return (
    <EntitiesListPage
      defaultCategory="periodista"
      title="Personajes Públicos"
      subtitle="Figuras mediáticas y líderes de opinión evaluados por su audiencia real."
      initialData={initialData}
    />
  );
}
