/**
 * BEACON PROTOCOL — /personajes (Personajes Públicos)
 * ====================================================
 * Server Component Híbrido: SEO + hidratación server-side.
 * Agrupa: periodistas, artistas, empresarios y toda figura pública.
 *
 * ISR: revalida cada 60s.
 */

import type { Metadata } from "next";
import EntitiesListPage from "@/components/shared/EntitiesListPage";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Personajes Públicos — Beacon Protocol",
  description:
    "Periodistas, presentadores, artistas y otras figuras evaluadas por su audiencia real y verificada. Accountability ciudadano con votos ponderados por integridad.",
  openGraph: {
    title: "Personajes Públicos — Beacon Protocol",
    description:
      "¿Quién informa, entretiene o lidera tu industria? Evalúalos con el Protocolo Beacon.",
    type: "website",
  },
  keywords: [
    "personajes públicos", "periodistas", "presentadores", "artistas",
    "figuras públicas", "Chile", "integridad", "reputación",
  ],
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Categorías que aparecen en /personajes (excluye politico y empresa)
const PERSONAJES_CATEGORIES = ["periodista", "artista", "presentador", "otro"];

async function fetchInitialEntities() {
  try {
    const query = new URLSearchParams({
      categories: PERSONAJES_CATEGORIES.join(","),
      limit: "24",
      offset: "0",
    });
    const res = await fetch(`${API_URL}/api/v1/entities?${query.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { entities: [], total: 0 };
    return await res.json();
  } catch {
    return { entities: [], total: 0 };
  }
}

export default async function PersonajesPage() {
  const initialData = await fetchInitialEntities();

  return (
    <EntitiesListPage
      title="Personajes Públicos"
      subtitle="Periodistas, presentadores, artistas y otras figuras que moldean la conversación pública. Evalúalos con el Protocolo Beacon."
      allowedCategories={PERSONAJES_CATEGORIES}
      initialData={initialData}
    />
  );
}
