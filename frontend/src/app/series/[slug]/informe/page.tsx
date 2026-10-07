/**
 * BEACON CHILE — /series/[slug]/informe (Server Component)
 * =========================================================
 * Informe imprimible de una edición: portada con titular descriptivo y ficha técnica, y una lámina por
 * pregunta con su tendencia y sus segmentos. Se genera solo con datos públicos de la API; el PDF se
 * obtiene imprimiendo la página («Guardar como PDF»). `?edition=2026-W41` elige una edición pasada.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PrintButton from "./PrintButton";
import AgendaView from "@/components/series/AgendaView";
import SegmentStrip from "@/components/series/SegmentStrip";
import TrendChart, { lineColor } from "@/components/series/TrendChart";
import {
  buildChartData,
  buildSegmentChart,
  cadenceLabel,
  casesSummary,
  eventPointIndex,
  optionsFromSegments,
  selectableQuestions,
  weightingSummary,
  type ChartData,
  type SeriesTrend,
} from "@/lib/series";
import { fetchSegments, fetchTrend } from "@/lib/seriesApi";
import { seriesHeadline } from "@/lib/seriesReport";

export const revalidate = 60;

const BASE_URL = "https://www.beaconchile.cl";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ edition?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const trend = await fetchTrend(slug);
  return {
    title: trend ? `Informe ${trend.series.title} | Beacon Chile` : "Informe — Beacon Chile",
    robots: { index: false },
    alternates: { canonical: `${BASE_URL}/series/${slug}` },
  };
}

const page = { background: "#0A0A0A", color: "#f5f5f5" } as const;
const card = { background: "rgba(17,17,17,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 18 } as const;
const muted = { color: "rgba(255,255,255,0.55)" } as const;

function Legend({ chart }: { chart: ChartData }) {
  return (
    <ul style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", listStyle: "none", padding: 0, margin: "8px 0 0" }}>
      {chart.lines.map((line, index) => (
        <li key={line.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: lineColor(line.muted, index) }} />
          {line.label}
        </li>
      ))}
    </ul>
  );
}

export default async function InformePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { edition } = await searchParams;
  const full = await fetchTrend(slug);
  if (!full || full.points.length === 0) notFound();

  const index = edition ? full.points.findIndex((p) => p.edition === edition) : full.points.length - 1;
  if (index < 0) notFound();
  const trend: SeriesTrend = { ...full, points: full.points.slice(0, index + 1) };
  const segments = await fetchSegments(slug, trend.points[index].edition);

  const { series, points, events, min_n: minN } = trend;
  const latest = points[points.length - 1];
  const headline = seriesHeadline(trend);
  const weighting = weightingSummary(points);
  const questions = selectableQuestions(points);
  const plottedEvents = events
    .map((event, number) => ({ ...event, number: number + 1, shown: eventPointIndex(points, event.date) !== null }))
    .filter((event) => event.shown);
  const isAgenda = series.kind === "agenda";
  const generated = new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" });

  return (
    <main className="informe mx-auto w-full max-w-4xl px-4 py-8" style={page}>
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        @media print {
          html, body { background: #0A0A0A !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          header, footer, nav, .no-print { display: none !important; }
          .informe { max-width: none !important; padding: 0 !important; }
          .informe-section { break-before: page; break-inside: avoid; }
        }
      `}</style>

      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <PrintButton />
        <Link href={`/series/${series.slug}`} style={{ color: "#00E5FF", fontSize: 13 }}>← Volver a la serie</Link>
      </div>

      <section aria-label="Portada">
        <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#00E5FF", fontFamily: "monospace", margin: "0 0 8px" }}>
          Beacon Chile · Informe de serie {cadenceLabel(series.cadence)}
        </p>
        <h1 className="text-2xl sm:text-4xl" style={{ fontWeight: 900, letterSpacing: "-0.02em", margin: "0 0 8px" }}>{series.title}</h1>
        <p style={{ fontSize: 16, margin: "0 0 4px", color: "#D4AF37", fontWeight: 700 }}>{latest.label}{latest.is_open ? " (en curso)" : ""}</p>
        <p style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35, margin: "18px 0 6px" }}>{headline.text}</p>
        {headline.previous && <p style={{ fontSize: 14, margin: 0, ...muted }}>{headline.previous}</p>}
        {headline.n !== null && <p style={{ fontSize: 13, margin: "6px 0 0", ...muted }}>Casos verificados en esa pregunta: {headline.n.toLocaleString("es-CL")}</p>}

        <div style={{ ...card, marginTop: 22 }} aria-label="Ficha técnica">
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 10px" }}>Ficha técnica</h2>
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", fontSize: 13, margin: 0 }}>
            <dt style={muted}>Técnica</dt><dd style={{ margin: 0 }}>Participación voluntaria online; los votos verificados corresponden a identidades validadas (una persona, un voto por edición).</dd>
            <dt style={muted}>Universo</dt><dd style={{ margin: 0 }}>Personas que participan en Beacon Chile. No es una muestra probabilística ni representa por sí sola a toda la población; no se publica margen de error.</dd>
            <dt style={muted}>Casos</dt><dd style={{ margin: 0 }}>{latest.verified_votes.toLocaleString("es-CL")} verificados · {latest.total_votes.toLocaleString("es-CL")} totales</dd>
            <dt style={muted}>Terreno</dt><dd style={{ margin: 0 }}>{latest.label}</dd>
            <dt style={muted}>Ponderación</dt>
            <dd style={{ margin: 0 }}>
              {weighting.latest?.status === "ok"
                ? `Por zona, sexo y edad a la población de 18 años o más (Censo 2024, INE). ${weighting.latest.n_complete} votantes con todos los datos, equivalentes a ${Math.round(weighting.latest.n_eff ?? 0)}.`
                : `No disponible: ${weighting.reason ?? "aún no hay datos suficientes."}`}
            </dd>
            <dt style={muted}>Mínimo para publicar</dt><dd style={{ margin: 0 }}>{minN} respuestas por grupo y pregunta; con menos, el resultado no se muestra.</dd>
            <dt style={muted}>Metodología</dt><dd style={{ margin: 0 }}>{BASE_URL.replace("https://", "")}/metodologia</dd>
          </dl>
        </div>
      </section>

      {questions.map((question) => {
        const chart = buildChartData(points, question.id, "verified", "average");
        if (!chart) return null;
        const cases = casesSummary(points, chart, "verified");
        const segmentChart = segments
          ? buildSegmentChart(segments, question.id, "average", isAgenda ? optionsFromSegments(segments, question.id) : chart.lines.filter((l) => !l.muted).map((l) => l.key))
          : null;
        return (
          <section key={question.id} className="informe-section" style={{ ...card, marginTop: 24 }} aria-label={question.text}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>{question.text}</h2>
            <p style={{ fontSize: 12, margin: "0 0 10px", ...muted }}>Votos verificados, sin ponderar{chart.unit === "nota" ? " · promedio de la nota" : ""}.</p>
            {isAgenda ? (
              <AgendaView points={points} group="verified" minN={minN} limit={4} />
            ) : (
              <>
            <TrendChart points={points} chart={chart} events={events} cadence={series.cadence} />
            <Legend chart={chart} />
            {cases && (
              <p style={{ fontSize: 12, margin: "10px 0 0", ...muted }}>
                <strong style={{ color: "rgba(255,255,255,0.8)" }}>Casos:</strong> {cases.n.toLocaleString("es-CL")} · <strong style={{ color: "rgba(255,255,255,0.8)" }}>Terreno:</strong> {cases.label}
              </p>
            )}
            {plottedEvents.length > 0 && (
              <ol style={{ listStyle: "none", padding: 0, margin: "8px 0 0", fontSize: 12, ...muted }}>
                {plottedEvents.map((event) => (
                  <li key={`${event.number}-${event.date}`}><strong style={{ color: "#f5f5f5" }}>{event.number}</strong> · {event.date.split("-").reverse().join("-")} — {event.label}</li>
                ))}
              </ol>
            )}
              </>
            )}
            {segmentChart && segments && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 6px" }}>Por segmento · {segments.label}</h3>
                <SegmentStrip chart={segmentChart} minN={segments.min_n} />
              </div>
            )}
          </section>
        );
      })}

      <p style={{ fontSize: 12, lineHeight: 1.6, margin: "24px 0 0", ...muted }}>
        Informe generado automáticamente el {generated} a partir de los resultados públicos de Beacon Chile. Los hitos numerados sobre los gráficos no implican causalidad.
        Este informe describe resultados; no los interpreta.
      </p>
    </main>
  );
}
