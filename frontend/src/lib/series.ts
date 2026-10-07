/**
 * BEACON CHILE — Series de encuestas: tipos y datos del gráfico de tendencia
 * ==========================================================================
 * Funciones puras (sin React, sin red). Contrato: GET /api/v1/series/{slug}/trend.
 *
 * Reglas que el gráfico respeta:
 *  - Un grupo con menos de `min_n` respuestas llega `suppressed` y sin resultados:
 *    ese punto no se dibuja (queda un hueco), solo se informa su n.
 *  - Si `template_version` cambia entre dos ediciones, la línea se corta: las
 *    preguntas ya no son comparables.
 */

export type Cadence = "monthly" | "weekly";
export type Group = "verified" | "total";

export interface ResultRow {
  option: string;
  count: number;
  pct: number;
  average?: number;
}

export interface GroupResult {
  n: number;
  suppressed: boolean;
  results: ResultRow[] | null;
}

export interface TrendQuestion {
  question_id: string;
  text: string;
  type: "multiple_choice" | "scale";
  verified: GroupResult;
  total: GroupResult;
  scale_min?: number;
  scale_max?: number;
}

export interface TrendPoint {
  edition: string;
  label: string;
  poll_slug: string;
  starts_at: string;
  ends_at: string;
  is_open: boolean;
  template_version: number;
  total_votes: number;
  verified_votes: number;
  questions: TrendQuestion[];
}

export interface TrendEvent {
  date: string;
  label: string;
}

export interface SeriesTrend {
  series: {
    slug: string;
    title: string;
    cadence: Cadence;
    context: string | null;
    category: string | null;
    is_active: boolean;
  };
  min_n: number;
  points: TrendPoint[];
  events: TrendEvent[];
}

export interface LineSeries {
  key: string;
  label: string;
  muted: boolean;
  /** Un valor por edición; null = no se dibuja (n insuficiente, sin esa pregunta u opción). */
  values: (number | null)[];
}

export interface ChartData {
  question: { id: string; text: string; type: "multiple_choice" | "scale" };
  unit: "%" | "nota";
  domain: [number, number];
  lines: LineSeries[];
  /** n de la pregunta en cada edición (para tooltips y tabla). */
  ns: (number | null)[];
  /** Índices i tales que template_version[i] != template_version[i-1]. */
  versionBreaks: number[];
}

const NO_ANSWER = /^no (sabe|responde)/i;
const MIN_SPAN = 40;

/** Preguntas elegibles: las de la edición más reciente (los ids se conservan por posición). */
export function selectableQuestions(points: TrendPoint[]): { id: string; text: string }[] {
  const latest = points[points.length - 1];
  return latest ? latest.questions.map((q) => ({ id: q.question_id, text: q.text })) : [];
}

function findQuestion(point: TrendPoint, questionId: string): TrendQuestion | undefined {
  return point.questions.find((q) => q.question_id === questionId);
}

/** Eje Y en múltiplos de 10 con al menos 40 puntos de rango, para que 1 punto no parezca un terremoto. */
function paddedDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 100];
  let low = Math.max(0, Math.floor((Math.min(...values) - 10) / 10) * 10);
  let high = Math.min(100, Math.ceil((Math.max(...values) + 10) / 10) * 10);
  if (high - low < MIN_SPAN) {
    high = Math.min(100, low + MIN_SPAN);
    low = Math.max(0, high - MIN_SPAN);
  }
  return [low, high];
}

export function buildChartData(points: TrendPoint[], questionId: string, group: Group): ChartData | null {
  const latest = points[points.length - 1];
  const latestQuestion = latest && findQuestion(latest, questionId);
  if (!latestQuestion) return null;

  const perPoint = points.map((p) => findQuestion(p, questionId)?.[group] ?? null);
  const ns = perPoint.map((g) => (g ? g.n : null));
  const versionBreaks = points
    .map((p, i) => (i > 0 && p.template_version !== points[i - 1].template_version ? i : -1))
    .filter((i) => i >= 0);

  if (latestQuestion.type === "scale") {
    const low = latestQuestion.scale_min ?? 1;
    const high = latestQuestion.scale_max ?? 5;
    return {
      question: { id: questionId, text: latestQuestion.text, type: "scale" },
      unit: "nota",
      domain: [low, high],
      ns,
      versionBreaks,
      lines: [
        {
          key: "average",
          label: "Promedio",
          muted: false,
          values: perPoint.map((g) => (g && !g.suppressed ? g.results?.[0]?.average ?? null : null)),
        },
      ],
    };
  }

  const options: string[] = [];
  for (const g of perPoint) {
    for (const row of g?.results ?? []) if (!options.includes(row.option)) options.push(row.option);
  }
  const lines: LineSeries[] = options.map((option) => ({
    key: option,
    label: option,
    muted: NO_ANSWER.test(option),
    values: perPoint.map((g) => (g && !g.suppressed ? g.results?.find((r) => r.option === option)?.pct ?? null : null)),
  }));
  const drawn = lines.filter((l) => !l.muted).flatMap((l) => l.values.filter((v): v is number => v !== null));
  const domain = paddedDomain(drawn);
  // "No sabe / No responde" suele quedar fuera del eje: si es así no se dibuja ni aparece en la leyenda.
  const visible = lines.filter(
    (l) => !l.muted || l.values.every((v) => v === null || (v >= domain[0] && v <= domain[1])),
  );
  return {
    question: { id: questionId, text: latestQuestion.text, type: "multiple_choice" },
    unit: "%",
    domain,
    ns,
    versionBreaks,
    lines: visible,
  };
}

/** Tramos continuos de una línea: se corta en los huecos (null) y en cambios de versión. */
export function lineSegments(values: (number | null)[], versionBreaks: number[]): { i: number; v: number }[][] {
  const segments: { i: number; v: number }[][] = [];
  let current: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v === null || versionBreaks.includes(i)) {
      if (current.length) segments.push(current);
      current = [];
    }
    if (v !== null) current.push({ i, v });
  });
  if (current.length) segments.push(current);
  return segments;
}

/** Índice de la edición en cuya ventana cae la fecha (AAAA-MM-DD); null si queda fuera del rango. */
export function eventPointIndex(points: TrendPoint[], date: string): number | null {
  const day = Date.parse(`${date}T12:00:00-03:00`);
  if (Number.isNaN(day) || points.length === 0) return null;
  if (day < Date.parse(points[0].starts_at) || day > Date.parse(points[points.length - 1].ends_at)) return null;
  const index = points.findIndex((p) => day <= Date.parse(p.ends_at));
  return index >= 0 ? index : null;
}

/** Slug de la serie a partir de la encuesta-edición (`<serie>-<edición en minúsculas>`); null si no calza. */
export function seriesSlugFromPoll(pollSlug: string, edition: string): string | null {
  const suffix = `-${edition.toLowerCase()}`;
  return pollSlug.endsWith(suffix) && pollSlug.length > suffix.length ? pollSlug.slice(0, -suffix.length) : null;
}

export function cadenceLabel(cadence: Cadence): string {
  return cadence === "weekly" ? "semanal" : "mensual";
}
