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
/** tracker: mismas opciones cada edición (se compara en el tiempo). agenda: las opciones cambian cada edición. */
export type SeriesKind = "tracker" | "agenda";
export type Group = "verified" | "total" | "weighted";
/** Métrica de una escala: promedio, o % de notas 5 a 7 (solo escalas de 7 puntos, como en el colegio). */
export type ScaleMetric = "average" | "top3";

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
  weighted: GroupResult;
  scale_min?: number;
  scale_max?: number;
}

export interface WeightingMeta {
  status: "ok" | "unavailable";
  reasons: string[];
  n_input: number;
  n_complete: number;
  n_excluded: number;
  n_eff: number | null;
  design_effect: number | null;
  targets_version: string;
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
  /** null en ediciones anteriores a la ponderación. */
  weighting: WeightingMeta | null;
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
    kind?: SeriesKind;
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
  /** Por qué un punto queda en blanco: depende del grupo elegido. */
  holeReason: string;
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

/** ¿Se puede mostrar «% notas 5 a 7»? Solo en escalas de 1 a 7. */
export function supportsTop3(points: TrendPoint[], questionId: string): boolean {
  const latest = points[points.length - 1];
  const question = latest && findQuestion(latest, questionId);
  return Boolean(question && question.type === "scale" && question.scale_min === 1 && question.scale_max === 7);
}

const TOP3_OPTIONS = ["5", "6", "7"];

export function buildChartData(
  points: TrendPoint[],
  questionId: string,
  group: Group,
  metric: ScaleMetric = "average",
): ChartData | null {
  const latest = points[points.length - 1];
  const latestQuestion = latest && findQuestion(latest, questionId);
  if (!latestQuestion) return null;

  const perPoint = points.map((p) => findQuestion(p, questionId)?.[group] ?? null);
  const ns = perPoint.map((g) => (g ? g.n : null));
  const holeReason = group === "weighted" ? "ponderación no disponible" : "n insuficiente";
  const versionBreaks = points
    .map((p, i) => (i > 0 && p.template_version !== points[i - 1].template_version ? i : -1))
    .filter((i) => i >= 0);

  if (latestQuestion.type === "scale" && metric === "top3" && supportsTop3(points, questionId)) {
    const values = perPoint.map((g) =>
      g && !g.suppressed && g.results
        ? Math.round(g.results.filter((r) => TOP3_OPTIONS.includes(r.option)).reduce((sum, r) => sum + r.pct, 0) * 10) / 10
        : null,
    );
    return {
      question: { id: questionId, text: latestQuestion.text, type: "scale" },
      unit: "%",
      domain: paddedDomain(values.filter((v): v is number => v !== null)),
      holeReason,
      ns,
      versionBreaks,
      lines: [{ key: "top3", label: "% notas 5 a 7", muted: false, values }],
    };
  }

  if (latestQuestion.type === "scale") {
    const low = latestQuestion.scale_min ?? 1;
    const high = latestQuestion.scale_max ?? 5;
    return {
      question: { id: questionId, text: latestQuestion.text, type: "scale" },
      unit: "nota",
      domain: [low, high],
      holeReason,
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
    holeReason,
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

/** Estado de la ponderación en la edición más reciente que la tenga calculada. */
export function weightingSummary(points: TrendPoint[]): { available: boolean; latest: WeightingMeta | null; reason: string | null } {
  const latest = [...points].reverse().find((p) => p.weighting)?.weighting ?? null;
  const available = points.some((p) => p.weighting?.status === "ok");
  // Con pocos votantes todos los motivos dicen lo mismo: se muestra el primero.
  const reason = latest && latest.status !== "ok" ? latest.reasons[0] ?? "Aún no hay datos suficientes." : null;
  return { available, latest, reason: available ? null : reason ?? "Aún no hay datos suficientes." };
}

export interface CasesSummary {
  /** Edición a la que se refiere el resumen (la más reciente con datos para la pregunta). */
  label: string;
  n: number;
  isOpen: boolean;
  /** Para el grupo ponderado: votantes «equivalentes» tras ponderar. */
  nEff: number | null;
}

/** «Casos» de la edición más reciente para la pregunta y el grupo elegidos (el pie de cada lámina de Cadem). */
export function casesSummary(points: TrendPoint[], chart: ChartData, group: Group): CasesSummary | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const n = chart.ns[i];
    if (n !== null && n !== undefined) {
      const weighting = points[i].weighting;
      return {
        label: points[i].label,
        n,
        isOpen: points[i].is_open,
        nEff: group === "weighted" && weighting?.status === "ok" ? weighting.n_eff : null,
      };
    }
  }
  return null;
}

// ─── Segmentos de una edición (GET /series/{slug}/segments) ───

export interface SegmentQuestion {
  question_id: string;
  type: "multiple_choice" | "scale";
  n: number;
  suppressed: boolean;
  results: ResultRow[] | null;
  scale_min?: number;
  scale_max?: number;
}

export interface SegmentGroup {
  key: string;
  label: string;
  n: number;
  questions: SegmentQuestion[];
}

export interface Segment {
  variable: string;
  label: string;
  groups: SegmentGroup[];
}

export interface SegmentsData {
  series: { slug: string; title: string; cadence: Cadence; kind?: SeriesKind };
  edition: string;
  label: string;
  is_open: boolean;
  min_n: number;
  segments: Segment[];
}

export const DEMOGRAPHIC_VIEW = "demographics";

export interface SegmentView {
  id: string;
  label: string;
}

/** Formas de ver una pregunta por segmento: demografía, o según la respuesta a otra pregunta de la edición. */
export function segmentViews(data: SegmentsData, questionId: string): SegmentView[] {
  const views: SegmentView[] = [{ id: DEMOGRAPHIC_VIEW, label: "Sexo, edad y zona" }];
  for (const segment of data.segments) {
    // Cruzar una pregunta consigo misma no dice nada.
    if (segment.variable.startsWith("q:") && segment.variable !== `q:${questionId}`) {
      views.push({ id: segment.variable, label: segment.label });
    }
  }
  return views;
}

/** Segmentos de la vista elegida; una vista que ya no aplica a la pregunta vuelve a la demografía. */
export function segmentsForView(data: SegmentsData, viewId: string, questionId: string): SegmentsData {
  const valid = segmentViews(data, questionId).some((v) => v.id === viewId) ? viewId : DEMOGRAPHIC_VIEW;
  const segments = data.segments.filter((s) =>
    valid === DEMOGRAPHIC_VIEW ? !s.variable.startsWith("q:") : s.variable === valid,
  );
  return { ...data, segments };
}

export interface SegmentColumn {
  variable: string;
  variableLabel: string;
  label: string;
  n: number;
  suppressed: boolean;
  /** Un valor por opción (preguntas de opción) o uno solo (escala); null si el grupo no publica. */
  values: (number | null)[];
}

export interface SegmentChart {
  unit: "%" | "nota";
  /** Etiquetas de las series de barras (opciones, o la métrica de la escala). */
  seriesLabels: string[];
  domain: [number, number];
  columns: SegmentColumn[];
}

function rowValue(row: SegmentQuestion, metric: ScaleMetric): number | null {
  if (row.suppressed || !row.results) return null;
  if (row.type === "scale") {
    if (metric === "top3") {
      return Math.round(row.results.filter((r) => TOP3_OPTIONS.includes(r.option)).reduce((sum, r) => sum + r.pct, 0) * 10) / 10;
    }
    return row.results[0]?.average ?? null;
  }
  return null;
}

/**
 * Columnas de la franja de segmentos para una pregunta.
 * `options` son las opciones que el gráfico de tendencia ya dibuja (mismo orden y colores).
 */
export function buildSegmentChart(data: SegmentsData, questionId: string, metric: ScaleMetric, options: string[]): SegmentChart | null {
  const sample = data.segments.flatMap((s) => s.groups).flatMap((g) => g.questions).find((q) => q.question_id === questionId);
  if (!sample) return null;

  const isScale = sample.type === "scale";
  const useTop3 = isScale && metric === "top3" && sample.scale_min === 1 && sample.scale_max === 7;

  const columns: SegmentColumn[] = data.segments.flatMap((segment) =>
    segment.groups.map((group) => {
      const row = group.questions.find((q) => q.question_id === questionId);
      const hidden = !row || row.suppressed || !row.results;
      let values: (number | null)[];
      if (hidden) values = isScale ? [null] : options.map(() => null);
      else if (isScale) values = [rowValue(row, useTop3 ? "top3" : "average")];
      else values = options.map((option) => row.results!.find((r) => r.option === option)?.pct ?? null);
      return { variable: segment.variable, variableLabel: segment.label, label: group.label, n: row?.n ?? 0, suppressed: hidden, values };
    }),
  );

  const drawn = columns.flatMap((c) => c.values).filter((v): v is number => v !== null);
  if (isScale && !useTop3) {
    return { unit: "nota", seriesLabels: ["Promedio"], domain: [sample.scale_min ?? 1, sample.scale_max ?? 5], columns };
  }
  const top = Math.max(60, Math.ceil(Math.max(0, ...drawn) / 10) * 10);
  return {
    unit: "%",
    seriesLabels: isScale ? ["% notas 5 a 7"] : options,
    domain: [0, Math.min(100, top)],
    columns,
  };
}

/** Opciones de una pregunta tomadas de los segmentos (las de la edición actual; sirve a las series agenda). */
export function optionsFromSegments(data: SegmentsData, questionId: string): string[] {
  for (const segment of data.segments) {
    for (const group of segment.groups) {
      const row = group.questions.find((q) => q.question_id === questionId);
      if (row?.results && row.type === "multiple_choice") {
        return row.results.filter((r) => !/^(otra|no sabe|no responde)/i.test(r.option)).map((r) => r.option);
      }
    }
  }
  return [];
}
