/**
 * BEACON PROTOCOL — /entities (Buscador Maestro)
 * ================================================
 * Server Component Híbrido: SEO + hidratación server-side.
 * El fetch va al Backend API (Frontend → Backend → Supabase).
 * La anon key nunca se expone. El DNA Scanner permanece activo.
 *
 * ISR: revalida cada 60s — contenido fresco sin cold-start.
 */

import type { Metadata } from "next";
import EntitiesListPage from "@/components/shared/EntitiesListPage";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Explorar Entidades — Beacon Protocol",
  description:
    "Evalúa políticos, empresas y personajes públicos con el Protocolo Beacon. Transparencia verificada por la ciudadanía.",
  openGraph: {
    title: "Explorar Entidades — Beacon Protocol",
    description:
      "Plataforma de integridad ciudadana. Vota con peso real según tu nivel de verificación.",
    type: "website",
  },
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchInitialEntities(params: Record<string, string> = {}) {
  try {
    const query = new URLSearchParams({ limit: "24", offset: "0", ...params });
    const res = await fetch(`${API_URL}/api/v1/entities?${query.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { entities: [], total: 0 };
    return await res.json();
  } catch {
    return { entities: [], total: 0 };
  }
}

export default async function EntitiesPage() {
  // Pre-carga server-side: Google indexa las primeras 24 entidades en el HTML
  const initialData = await fetchInitialEntities();

  return (
    <EntitiesListPage
      title="Explorar Entidades"
      subtitle="Busca políticos, empresas, personajes públicos y eventos evaluados por el Protocolo Beacon."
      initialData={initialData}
    />
  );
}
