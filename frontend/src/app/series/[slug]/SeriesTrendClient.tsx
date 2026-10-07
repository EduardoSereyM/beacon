"use client";

/**
 * SeriesTrendClient — vista interactiva de la tendencia de una serie
 * ===================================================================
 * Estado local: pregunta elegida y grupo (verificados / todos). El gráfico, la
 * tabla de datos y las notas se derivan de `buildChartData`.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import TrendChart, { lineColor } from "@/components/series/TrendChart";
import {
  buildChartData,
  cadenceLabel,
  eventPointIndex,
  selectableQuestions,
  type Group,
  type SeriesTrend,
} from "@/lib/series";

const GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: "verified", label: "Verificados", hint: "Solo votos con identidad verificada" },
  { id: "total", label: "Todos", hint: "Verificados y básicos" },
];

const card = {
  background: "rgba(17,17,17,0.9)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
} as const;

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "America/Santiago" });

export default function SeriesTrendClient({ trend }: { trend: SeriesTrend }) {
  const { series, points, events, min_n: minN } = trend;
  const questions = useMemo(() => selectableQuestions(points), [points]);
  const [questionId, setQuestionId] = useState(questions[0]?.id ?? "");
  const [group, setGroup] = useState<Group>("verified");

  const chart = useMemo(() => buildChartData(points, questionId, group), [points, questionId, group]);
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
              {GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  title={g.hint}
                  aria-pressed={group === g.id}
                  onClick={() => setGroup(g.id)}
                  style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${group === g.id ? "#00E5FF" : "rgba(255,255,255,0.15)"}`, background: group === g.id ? "rgba(0,229,255,0.12)" : "transparent", color: group === g.id ? "#00E5FF" : "rgba(255,255,255,0.6)" }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <TrendChart points={points} chart={chart} events={events} cadence={series.cadence} />

          <ul aria-label="Leyenda" style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", listStyle: "none", padding: 0, margin: "10px 0 0" }}>
            {chart.lines.map((line, index) => (
              <li key={line.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: lineColor(line.muted, index) }} />
                {line.label}
              </li>
            ))}
          </ul>

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
                              ? chart.ns[i] !== null && chart.ns[i]! < minN ? "n insuficiente" : "—"
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
        </section>
      )}

      <aside style={{ marginTop: 20, fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>
        <strong style={{ color: "rgba(255,255,255,0.75)" }}>Cómo leer estos datos.</strong> Son respuestas de quienes participan en
        Beacon Chile, sin ponderar: no representan a toda la población. Cada persona vota una vez por edición. Solo se
        muestran grupos con al menos {minN} respuestas en esa pregunta; con menos, el punto queda en blanco. Si la pregunta
        cambia, la línea se corta.
      </aside>
    </main>
  );
}
