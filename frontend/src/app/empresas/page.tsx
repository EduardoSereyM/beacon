/**
 * BEACON PROTOCOL — /empresas (Sección Empresas)
 * =================================================
 * Server Component Híbrido: SEO + hidratación server-side.
 * Categoría pre-fijada: empresario.
 *
 * ISR: revalida cada 60s.
 */

import type { Metadata } from "next";
import EntitiesListPage from "@/components/shared/EntitiesListPage";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Empresas — Beacon Protocol",
  description:
    "Empresas y conglomerados bajo el escrutinio ciudadano verificado. Transparencia y responsabilidad corporativa en tiempo real.",
  openGraph: {
    title: "Empresas — Beacon Protocol",
    description:
      "Evaluación ciudadana de empresas. Solo votos de usuarios verificados con integridad real.",
    type: "website",
  },
  keywords: ["empresas", "corrupción corporativa", "responsabilidad", "Chile", "transparencia"],
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

export default async function EmpresasPage() {
  const initialData = await fetchInitialEntities("empresario");

  return (
    <EntitiesListPage
      defaultCategory="empresario"
      title="Empresas"
      subtitle="Empresas y conglomerados bajo el escrutinio ciudadano. Transparencia verificada."
      initialData={initialData}
    />
  );
}
