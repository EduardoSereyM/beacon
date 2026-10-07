"use client";

/**
 * SeriesTrendClient — vista interactiva de la tendencia de una serie
 * ===================================================================
 * Estado local: pregunta elegida y grupo (verificados / todos). El gráfico, la
 * tabla de datos y las notas se derivan de `buildChartData`.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import AgendaView from "@/components/series/AgendaView";
import SegmentStrip from "@/components/series/SegmentStrip";
import TrendChart, { lineColor } from "@/components/series/TrendChart";
import {
  buildChartData,
  buildSegmentChart,
  cadenceLabel,
  casesSummary,
  DEMOGRAPHIC_VIEW,
  eventPointIndex,
  optionsFromSegments,
  segmentsForView,
  segmentViews,
  selectableQuestions,
  supportsTop3,
  weightingSummary,
  type Group,
  type ScaleMetric,
  type SegmentsData,
  type SeriesTrend,
} from "@/lib/series";

const GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: "verified", label: "Verificados", hint: "Solo votos con identidad verificada, sin ponderar" },
  { id: "weighted", label: "Ponderado", hint: "Votos verificados ajustados a la población por zona, sexo y edad" },
  { id: "total", label: "Todos", hint: "Verificados y básicos, sin ponderar" },
];

const card = {
  background: "rgba(17,17,17,0.9)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
} as const;

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "America/Santiago" });

export default function SeriesTrendClient({ trend, segments }: { trend: SeriesTrend; segments: SegmentsData | null }) {
  const { series, points, events, min_n: minN } = trend;
  const questions = useMemo(() => selectableQuestions(points), [points]);
  const [questionId, setQuestionId] = useState(questions[0]?.id ?? "");
  const [group, setGroup] = useState<Group>("verified");
  const [metric, setMetric] = useState<ScaleMetric>("average");
  const [view, setView] = useState(DEMOGRAPHIC_VIEW);
  // Serie agenda: las opciones cambian cada edición; no hay línea de tendencia sino un ranking por edición.
  const isAgenda = series.kind === "agenda";

  const top3 = useMemo(() => supportsTop3(points, questionId), [points, questionId]);
  // Al cambiar a una pregunta que no admite «% notas 5 a 7», la métrica efectiva vuelve a promedio.
  const activeMetric: ScaleMetric = top3 ? metric : "average";
  const chart = useMemo(() => buildChartData(points, questionId, group, activeMetric), [points, questionId, group, activeMetric]);
  const cases = useMemo(() => (chart ? casesSummary(points, chart, group) : null), [points, chart, group]);
  const views = useMemo(() => (segments ? segmentViews(segments, questionId) : []), [segments, questionId]);
  const activeView = views.some((v) => v.id === view) ? view : DEMOGRAPHIC_VIEW;
  const segmentChart = useMemo(
    () =>
      segments && chart
        ? buildSegmentChart(
            segmentsForView(segments, activeView, questionId),
            questionId,
            activeMetric,
            isAgenda ? optionsFromSegments(segments, questionId) : chart.lines.filter((l) => !l.muted).map((l) => l.key),
          )
        : null,
    [segments, chart, questionId, activeMetric, activeView, isAgenda],
  );
  const weighting = useMemo(() => weightingSummary(points), [points]);
  const latest = points[points.length - 1];
  const plottedEvents = events
    .map((event, index) => ({ ...event, number: index + 1, plotted: eventPointIndex(points, event.date) !== null }))
    .filter((event) => event.plotted);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8" style={{ color: "#f5f5f5" }}>
      <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#00E5FF", fontFamily: "monospace", marginBottom: 8 }}>
        Serie {cadenceLabel(series.cadence)}
      </p>
      <h1 className="text-2xl sm:text-3xl" style={{ fontWeight: 900, letterSpacing: "-0.02em", marginBottom: 8 }}>
        {series.title}
      </h1>
      {series.context && (
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 16 }}>{series.context}</p>
      )}

      {latest?.is_open && (
        <Link
          href={`/encuestas/${latest.poll_slug}`}
          style={{ display: "inline-block", marginBottom: 20, padding: "10px 16px", borderRadius: 10, background: "rgba(57,255,20,0.1)", border: "1px solid rgba(57,255,20,0.3)", color: "#39FF14", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
        >
          Participa en la edición actual: {latest.label} →
        </Link>
      )}

      {latest && (
        <p style={{ display: "flex", flexWrap: "wrap", gap: 16, margin: "0 0 16px", fontSize: 13 }}>
          <Link href={`/series/${series.slug}/informe`} style={{ color: "#00E5FF" }}>Informe de la edición (PDF) →</Link>
          <a href={`/api/og/serie/${series.slug}?download=1`} style={{ color: "#00E5FF" }}>Descargar imagen para compartir →</a>
        </p>
      )}

      {points.length === 0 || !chart ? (
        <div style={{ ...card, padding: 24, color: "rgba(255,255,255,0.6)" }}>Esta serie aún no tiene ediciones publicadas.</div>
      ) : (
        <section style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", marginBottom: 12 }}>
            <label style={{ flex: "1 1 260px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              Pregunta
              <select
                value={questionId}
                onChange={(e) => setQuestionId(e.target.value)}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, background: "#111", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.15)", fontSize: 13 }}
              >
                {questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.text}
                  </option>
                ))}
              </select>
            </label>
            <div role="group" aria-label="Grupo de votantes" style={{ display: "flex", gap: 6, alignSelf: "flex-end" }}>
              {GROUPS.map((g) => {
                const locked = g.id === "weighted" && !weighting.available;
                return (
                  <button
                    key={g.id}
                    type="button"
                    title={locked ? weighting.reason ?? g.hint : g.hint}
                    aria-pressed={group === g.id}
                    disabled={locked}
                    onClick={() => setGroup(g.id)}
                    style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.45 : 1, border: `1px solid ${group === g.id ? "#00E5FF" : "rgba(255,255,255,0.15)"}`, background: group === g.id ? "rgba(0,229,255,0.12)" : "transparent", color: group === g.id ? "#00E5FF" : "rgba(255,255,255,0.6)" }}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          {!weighting.available && (
            <p style={{ fontSize: 12, color: "#D4AF37", margin: "0 0 10px", lineHeight: 1.5 }}>
              Vista ponderada no disponible: {weighting.reason} <Link href="/metodologia#ponderacion" style={{ color: "#00E5FF" }}>Por qué →</Link>
            </p>
          )}
          {group === "weighted" && weighting.latest?.status === "ok" && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "0 0 10px", lineHeight: 1.5 }}>
              Ajustado por zona, sexo y edad a la población de 18 años o más (Censo 2024). Última edición: {weighting.latest.n_complete} votantes con todos los datos,
              equivalentes a {Math.round(weighting.latest.n_eff ?? 0)} por el efecto de la ponderación.{" "}
              <Link href="/metodologia#ponderacion" style={{ color: "#00E5FF" }}>Cómo se calcula →</Link>
            </p>
          )}

          {isAgenda ? (
            <>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "0 0 12px", lineHeight: 1.5 }}>
                Las opciones de esta serie las define el equipo cada edición, así que no se comparan una a una: cada edición muestra su propio ranking.
              </p>
              <AgendaView points={points} group={group} minN={minN} />
            </>
          ) : (
            <>
          {top3 && (
            <div role="group" aria-label="Métrica de la escala" style={{ display: "flex", gap: 6, margin: "0 0 10px" }}>
              {([["average", "Promedio"], ["top3", "% notas 5 a 7"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={activeMetric === id}
                  onClick={() => setMetric(id)}
                  style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${activeMetric === id ? "#00E5FF" : "rgba(255,255,255,0.15)"}`, background: activeMetric === id ? "rgba(0,229,255,0.12)" : "transparent", color: activeMetric === id ? "#00E5FF" : "rgba(255,255,255,0.6)" }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <TrendChart points={points} chart={chart} events={events} cadence={series.cadence} />

          <ul aria-label="Leyenda" style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", listStyle: "none", padding: 0, margin: "10px 0 0" }}>
            {chart.lines.map((line, index) => (
              <li key={line.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: lineColor(line.muted, index) }} />
                {line.label}
              </li>
            ))}
          </ul>

          {cases && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "12px 0 0" }}>
              <strong style={{ color: "rgba(255,255,255,0.8)" }}>Casos:</strong> {cases.n.toLocaleString("es-CL")}
              {cases.nEff !== null && <> (equivalen a {Math.round(cases.nEff).toLocaleString("es-CL")} tras ponderar)</>}
              {" · "}
              <strong style={{ color: "rgba(255,255,255,0.8)" }}>Terreno:</strong> {cases.label}
              {cases.isOpen ? " (en curso)" : ""}
              {activeMetric === "top3" ? " · Notas de 1 a 7: «% notas 5 a 7» suma las notas 5, 6 y 7." : ""}
            </p>
          )}

          {plottedEvents.length > 0 && (
            <ol style={{ listStyle: "none", padding: 0, margin: "14px 0 0", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              {plottedEvents.map((event) => (
                <li key={`${event.number}-${event.date}`} style={{ marginTop: 4 }}>
                  <strong style={{ color: "#f5f5f5" }}>{event.number}</strong> · {formatDate(event.date)} — {event.label}
                </li>
              ))}
            </ol>
          )}

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, color: "#00E5FF" }}>Ver los datos de cada edición</summary>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.5)" }}>
                    <th style={{ padding: "6px 8px" }}>Edición</th>
                    <th style={{ padding: "6px 8px" }}>n</th>
                    {chart.lines.map((line) => (
                      <th key={line.key} style={{ padding: "6px 8px" }}>{line.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={p.edition} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{p.label}</td>
                      <td style={{ padding: "6px 8px" }}>{chart.ns[i] ?? "—"}</td>
                      {chart.lines.map((line) => {
                        const value = line.values[i];
                        return (
                          <td key={line.key} style={{ padding: "6px 8px", color: value === null ? "rgba(255,255,255,0.35)" : "#f5f5f5" }}>
                            {value === null
                              ? chart.ns[i] !== null ? chart.holeReason : "—"
                              : `${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })}${chart.unit === "%" ? "%" : ""}`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
            </>
          )}
        </section>
      )}

      {segments && segmentChart && (
        <section style={{ ...card, padding: 16, marginTop: 20 }} aria-label="Resultados por segmento">
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Por segmento · {segments.label}{segments.is_open ? " (en curso)" : ""}</h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "0 0 12px", lineHeight: 1.5 }}>
            Votos verificados de la edición, sin ponderar. Cada barra suma lo que respondieron las personas de ese grupo; con menos de {segments.min_n} respuestas el grupo no se muestra.
          </p>
          {views.length > 1 && (
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "0 0 10px" }}>
              Ver por
              <select
                value={activeView}
                onChange={(e) => setView(e.target.value)}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, background: "#111", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.15)", fontSize: 13 }}
              >
                {views.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </label>
          )}
          {chart && (
            <ul aria-label="Leyenda de segmentos" style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", listStyle: "none", padding: 0, margin: "0 0 8px" }}>
              {segmentChart.seriesLabels.map((label, index) => (
                <li key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: lineColor(false, index) }} />
                  {label}
                </li>
              ))}
            </ul>
          )}
          <SegmentStrip chart={segmentChart} minN={segments.min_n} />
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, color: "#00E5FF" }}>Ver los datos por segmento</summary>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.5)" }}>
                    <th style={{ padding: "6px 8px" }}>Segmento</th>
                    <th style={{ padding: "6px 8px" }}>n</th>
                    {segmentChart.seriesLabels.map((label) => (
                      <th key={label} style={{ padding: "6px 8px" }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {segmentChart.columns.map((column) => (
                    <tr key={`${column.variable}-${column.label}`} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{column.variableLabel}: {column.label}</td>
                      <td style={{ padding: "6px 8px" }}>{column.n}</td>
                      {column.values.map((value, index) => (
                        <td key={segmentChart.seriesLabels[index]} style={{ padding: "6px 8px", color: value === null ? "rgba(255,255,255,0.35)" : "#f5f5f5" }}>
                          {value === null ? (column.suppressed ? "n insuficiente" : "—") : `${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })}${segmentChart.unit === "%" ? "%" : ""}`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}

      <aside style={{ marginTop: 20, fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>
        <strong style={{ color: "rgba(255,255,255,0.75)" }}>Cómo leer estos datos.</strong> Son respuestas de quienes participan en
        Beacon Chile: no son una muestra probabilística ni representan por sí solas a toda la población. «Verificados» y «Todos» no
        están ponderados; «Ponderado» ajusta la composición por zona, sexo y edad, pero no corrige que participe quien quiere
        participar. Cada persona vota una vez por edición. Solo se muestran grupos con al menos {minN} respuestas en esa
        pregunta; con menos, el punto queda en blanco. Si la pregunta cambia, la línea se corta.{" "}
        <Link href="/metodologia" style={{ color: "#00E5FF" }}>Metodología completa →</Link>
      </aside>
    </main>
  );
}
