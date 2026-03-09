/**
 * BEACON PROTOCOL — /politicos (Sección Políticos)
 * ==================================================
 * Server Component Híbrido: SEO + hidratación server-side.
 * Categoría pre-fijada: politico.
 *
 * ISR: revalida cada 60s.
 */

import type { Metadata } from "next";
import EntitiesListPage from "@/components/shared/EntitiesListPage";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Políticos — Beacon Protocol",
  description:
    "Evalúa a los funcionarios públicos de Chile con el Protocolo Beacon. Tu voto pesa según tu nivel de integridad verificada.",
  openGraph: {
    title: "Políticos — Beacon Protocol",
    description:
      "Escrutinio ciudadano verificado. Diputados, senadores, alcaldes y ministros evaluados en tiempo real.",
    type: "website",
  },
  keywords: ["políticos", "corrupción", "integridad", "Chile", "transparencia", "evaluación"],
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

export default async function PoliticosPage() {
  const initialData = await fetchInitialEntities("politico");

  return (
    <EntitiesListPage
      defaultCategory="politico"
      title="Políticos"
      subtitle="Funcionarios públicos evaluados por la ciudadanía. Tu voto pesa según tu integridad."
      initialData={initialData}
    />
  );
}
