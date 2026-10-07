/**
 * SeriesTrendLink — enlace desde una edición a la tendencia de su serie.
 * No renderiza nada si la encuesta no es una edición o su slug no calza con el de la serie.
 */

import Link from "next/link";
import { seriesSlugFromPoll } from "@/lib/series";

export default function SeriesTrendLink({ pollSlug, edition }: { pollSlug: string; edition?: string | null }) {
  const seriesSlug = edition ? seriesSlugFromPoll(pollSlug, edition) : null;
  if (!seriesSlug) return null;
  return (
    <Link
      href={`/series/${seriesSlug}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 12, fontWeight: 700, color: "#00E5FF", textDecoration: "none" }}
    >
      Edición de una serie recurrente · Ver la tendencia →
    </Link>
  );
}
