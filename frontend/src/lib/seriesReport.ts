/**
 * BEACON CHILE — Titular y comparación del informe de una serie
 * ==============================================================
 * Funciones puras. El titular es DESCRIPTIVO: muestra los valores y los de la edición anterior, sin
 * adjetivos («sube», «récord», «nivel más bajo») ni afirmaciones de cambio: sin margen de error no hay
 * cómo sostener que una diferencia de unos puntos sea más que azar.
 */

import type { SeriesTrend, TrendPoint, TrendQuestion } from "@/lib/series";

const NO_ANSWER = /^no (sabe|responde)/i;
const FIXED_OPTION = /^(otra|no sabe|no responde)/i;
export const NOT_ENOUGH = "Aún no hay suficientes respuestas verificadas para publicar resultados (mínimo 30).";

export interface Headline {
  text: string;
  /** Valores de la edición anterior, o null si no hay una comparable. */
  previous: string | null;
  /** Casos verificados de la pregunta del titular. */
  n: number | null;
  edition: string | null;
  edition_label: string | null;
  available: boolean;
}

const pct = (value: number) => `${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;

function lead(question: TrendQuestion, agenda: boolean): { label: string; value: number }[] | null {
  const results = question.verified.suppressed ? null : question.verified.results;
  if (!results) return null;
  if (question.type === "scale") {
    const average = results[0]?.average;
    return average == null ? null : [{ label: "Nota promedio", value: average }];
  }
  // Agenda: las dos opciones más elegidas de la semana (las fijas «Otra…» y «No sabe» no titulan).
  const options = agenda
    ? results.filter((r) => !FIXED_OPTION.test(r.option)).sort((a, b) => b.pct - a.pct).slice(0, 2)
    : results.filter((r) => !NO_ANSWER.test(r.option)).slice(0, 2);
  return options.length ? options.map((r) => ({ label: r.option, value: r.pct })) : null;
}

const formatLead = (items: { label: string; value: number }[], isScale: boolean) =>
  items.map((i) => `${i.label} ${isScale ? i.value.toLocaleString("es-CL", { maximumFractionDigits: 2 }) : pct(i.value)}`).join(", ");

/** Primera pregunta de la serie: la que titula el informe. */
function leadQuestionId(points: TrendPoint[]): string | null {
  return points[points.length - 1]?.questions[0]?.question_id ?? null;
}

export function seriesHeadline(trend: SeriesTrend): Headline {
  const { points, series } = trend;
  const questionId = leadQuestionId(points);
  const empty: Headline = { text: NOT_ENOUGH, previous: null, n: null, edition: null, edition_label: null, available: false };
  if (!questionId) return empty;

  const agenda = series.kind === "agenda";
  const withData = points
    .map((point) => ({ point, question: point.questions.find((q) => q.question_id === questionId) }))
    .filter((entry): entry is { point: TrendPoint; question: TrendQuestion } => Boolean(entry.question && lead(entry.question, agenda)));
  const current = withData[withData.length - 1];
  if (!current) return empty;

  const isScale = current.question.type === "scale";
  const items = lead(current.question, agenda)!;
  const before = withData.length > 1 ? withData[withData.length - 2] : null;
  // En una agenda las opciones cambian cada semana: no hay edición anterior comparable.
  const sameVersion = !agenda && before && before.point.template_version === current.point.template_version;
  const previousItems = sameVersion ? lead(before.question, agenda) : null;

  return {
    text: `${series.title} · ${current.point.label}: ${formatLead(items, isScale)}`,
    previous: before && previousItems ? `Edición anterior (${before.point.label}): ${formatLead(previousItems, isScale)}` : null,
    n: current.question.verified.n,
    edition: current.point.edition,
    edition_label: current.point.label,
    available: true,
  };
}
