import { describe, expect, it } from "vitest";
import {
  buildChartData,
  casesSummary,
  eventPointIndex,
  lineSegments,
  buildSegmentChart,
  DEMOGRAPHIC_VIEW,
  segmentsForView,
  segmentViews,
  selectableQuestions,
  seriesSlugFromPoll,
  supportsTop3,
  weightingSummary,
  type GroupResult,
  type SegmentsData,
  type TrendPoint,
  type WeightingMeta,
} from "@/lib/series";

const group = (n: number, pcts: [number, number, number] | null): GroupResult => ({
  n,
  suppressed: pcts === null,
  results: pcts && [
    { option: "Aprueba", count: 0, pct: pcts[0] },
    { option: "Desaprueba", count: 0, pct: pcts[1] },
    { option: "No sabe / No responde", count: 0, pct: pcts[2] },
  ],
});

const SCALE_ROWS = [
  { option: "1", count: 0, pct: 5, average: 4.5 },
  { option: "2", count: 0, pct: 10 },
  { option: "3", count: 0, pct: 15 },
  { option: "4", count: 0, pct: 20 },
  { option: "5", count: 0, pct: 25.04 },
  { option: "6", count: 0, pct: 15 },
  { option: "7", count: 0, pct: 10.01 },
];

const weighting = (status: "ok" | "unavailable", reasons: string[] = []): WeightingMeta => ({
  status,
  reasons,
  n_input: 100,
  n_complete: 90,
  n_excluded: 10,
  n_eff: status === "ok" ? 60 : null,
  design_effect: null,
  targets_version: "censo2024-18plus-v1",
});

function point(i: number, version: number, verified: [number, number, number] | null, total: [number, number, number] | null, weighted: GroupResult): TrendPoint {
  return {
    edition: `2026-W${40 + i}`,
    label: `S${40 + i}`,
    poll_slug: `x-2026-w${40 + i}`,
    starts_at: `2026-10-${String(5 + i * 7).padStart(2, "0")}T07:00:00+00:00`,
    ends_at: `2026-10-${String(12 + i * 7).padStart(2, "0")}T06:59:59+00:00`,
    is_open: i === 3,
    template_version: version,
    total_votes: 0,
    verified_votes: 0,
    weighting: weighted.suppressed ? weighting("unavailable", ["Pocos votantes."]) : weighting("ok"),
    questions: [
      { question_id: "q1", text: "¿Aprueba?", type: "multiple_choice", verified: group(verified ? 40 : 10, verified), total: group(total ? 60 : 10, total), weighted },
      {
        question_id: "q2", text: "Nota", type: "scale", scale_min: 1, scale_max: 7,
        verified: { n: 40, suppressed: false, results: SCALE_ROWS }, total: group(0, null), weighted: group(0, null),
      },
    ],
  };
}

const POINTS = [
  point(0, 1, [40, 50, 10], [38, 52, 10], group(40, [30, 60, 10])),
  point(1, 1, null, [41, 49, 10], group(0, null)),
  point(2, 1, [44, 46, 10], [42, 48, 10], group(40, [30, 60, 10])),
  point(3, 2, [45, 45, 10], [43, 47, 10], group(0, null)),
];

describe("buildChartData", () => {
  const chart = buildChartData(POINTS, "q1", "verified")!;

  it("deja huecos donde el grupo no llega al mínimo de respuestas", () => {
    expect(chart.lines[0].values).toEqual([40, null, 44, 45]);
    expect(chart.holeReason).toBe("n insuficiente");
  });

  it("oculta «No sabe / No responde» si queda fuera del eje", () => {
    expect(chart.lines.map((l) => l.key)).toEqual(["Aprueba", "Desaprueba"]);
  });

  it("marca el cambio de versión de la plantilla y usa un eje de al menos 40 puntos", () => {
    expect(chart.versionBreaks).toEqual([3]);
    expect(chart.domain).toEqual([30, 70]);
  });

  it("lee el grupo elegido", () => {
    expect(buildChartData(POINTS, "q1", "total")!.lines[0].values).toEqual([38, 41, 42, 43]);
  });

  it("la vista ponderada solo dibuja donde estuvo disponible", () => {
    const weighted = buildChartData(POINTS, "q1", "weighted")!;
    expect(weighted.lines[0].values).toEqual([30, null, 30, null]);
    expect(weighted.holeReason).toBe("ponderación no disponible");
  });

  it("escala: promedio con sus límites", () => {
    const scale = buildChartData(POINTS, "q2", "verified")!;
    expect(scale.unit).toBe("nota");
    expect(scale.domain).toEqual([1, 7]);
    expect(scale.lines[0].values).toEqual([4.5, 4.5, 4.5, 4.5]);
  });

  it("escala de 7: % notas 5 a 7 suma las tres notas más altas", () => {
    const top3 = buildChartData(POINTS, "q2", "verified", "top3")!;
    expect(top3.unit).toBe("%");
    expect(top3.lines[0].label).toBe("% notas 5 a 7");
    expect(top3.lines[0].values).toEqual([50.1, 50.1, 50.1, 50.1]);
  });

  it("la métrica top3 no aplica a preguntas sin escala de 7", () => {
    expect(supportsTop3(POINTS, "q2")).toBe(true);
    expect(supportsTop3(POINTS, "q1")).toBe(false);
    expect(buildChartData(POINTS, "q1", "verified", "top3")!.lines[0].key).toBe("Aprueba");
  });

  it("devuelve null sin datos o con una pregunta inexistente", () => {
    expect(buildChartData(POINTS, "no-existe", "verified")).toBeNull();
    expect(buildChartData([], "q1", "verified")).toBeNull();
  });
});

describe("lineSegments", () => {
  it("corta en huecos y en cambios de versión", () => {
    expect(lineSegments([40, null, 44, 45], [3])).toEqual([[{ i: 0, v: 40 }], [{ i: 2, v: 44 }], [{ i: 3, v: 45 }]]);
    expect(lineSegments([1, 2, 3, 4], [2])).toEqual([[{ i: 0, v: 1 }, { i: 1, v: 2 }], [{ i: 2, v: 3 }, { i: 3, v: 4 }]]);
  });
});

describe("eventPointIndex", () => {
  it("ubica la fecha en la edición cuya ventana la contiene", () => {
    expect(eventPointIndex(POINTS, "2026-10-10")).toBe(0);
    expect(eventPointIndex(POINTS, "2026-10-13")).toBe(1);
  });
  it("descarta fechas fuera del rango o inválidas", () => {
    expect(eventPointIndex(POINTS, "2026-09-01")).toBeNull();
    expect(eventPointIndex(POINTS, "2027-01-01")).toBeNull();
    expect(eventPointIndex(POINTS, "basura")).toBeNull();
  });
});

describe("seriesSlugFromPoll", () => {
  it("recupera el slug de la serie", () => {
    expect(seriesSlugFromPoll("pulso-semanal-2026-w41", "2026-W41")).toBe("pulso-semanal");
    expect(seriesSlugFromPoll("barometro-mensual-2026-10", "2026-10")).toBe("barometro-mensual");
  });
  it("devuelve null si no calza", () => {
    expect(seriesSlugFromPoll("otra-cosa", "2026-10")).toBeNull();
    expect(seriesSlugFromPoll("-2026-10", "2026-10")).toBeNull();
  });
});

describe("selectableQuestions / casesSummary / weightingSummary", () => {
  it("lista las preguntas de la edición más reciente", () => {
    expect(selectableQuestions(POINTS).map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(selectableQuestions([])).toEqual([]);
  });

  it("casos: n de la última edición con datos, y n equivalente solo si está ponderado", () => {
    const verified = buildChartData(POINTS, "q1", "verified")!;
    expect(casesSummary(POINTS, verified, "verified")).toMatchObject({ n: 40, label: "S43", isOpen: true, nEff: null });
    const weightedChart = buildChartData(POINTS, "q1", "weighted")!;
    expect(casesSummary(POINTS, weightedChart, "weighted")).toMatchObject({ n: 0, label: "S43", nEff: null });
  });

  it("ponderación disponible si alguna edición la tiene; si no, el primer motivo", () => {
    expect(weightingSummary(POINTS).available).toBe(true);
    const none = POINTS.map((p) => ({ ...p, weighting: weighting("unavailable", ["Hay 0 votantes.", "Otro motivo."]) }));
    expect(weightingSummary(none)).toMatchObject({ available: false, reason: "Hay 0 votantes." });
    expect(weightingSummary([]).available).toBe(false);
  });
});

describe("buildSegmentChart", () => {
  const rows = (a: number, d: number) => [
    { option: "Aprueba", count: 0, pct: a },
    { option: "Desaprueba", count: 0, pct: d },
  ];
  const mc = (n: number, results: ReturnType<typeof rows> | null) => ({
    question_id: "q1", type: "multiple_choice" as const, n, suppressed: results === null, results,
  });
  const scale = (n: number, average: number | null) => ({
    question_id: "q2", type: "scale" as const, n, suppressed: average === null, scale_min: 1, scale_max: 7,
    results: average === null ? null : [{ option: "1", count: 0, pct: 5, average }, { option: "5", count: 0, pct: 30 }, { option: "6", count: 0, pct: 20 }, { option: "7", count: 0, pct: 10 }],
  });
  const DATA: SegmentsData = {
    series: { slug: "pulso", title: "Pulso", cadence: "weekly" },
    edition: "2026-W41", label: "Semana 41", is_open: true, min_n: 30,
    segments: [
      { variable: "sex", label: "Sexo", groups: [
        { key: "Masculino", label: "Hombres", n: 60, questions: [mc(60, rows(50, 40)), scale(60, 4.8)] },
        { key: "Femenino", label: "Mujeres", n: 10, questions: [mc(10, null), scale(10, null)] },
      ] },
      { variable: "zone", label: "Zona", groups: [{ key: "Sur", label: "Sur", n: 40, questions: [mc(40, rows(25, 65)), scale(40, 4.1)] }] },
    ],
  };

  it("una columna por grupo, con las opciones en el orden del gráfico", () => {
    const chart = buildSegmentChart(DATA, "q1", "average", ["Aprueba", "Desaprueba"])!;
    expect(chart.columns.map((c) => c.label)).toEqual(["Hombres", "Mujeres", "Sur"]);
    expect(chart.columns[0].values).toEqual([50, 40]);
    expect(chart.unit).toBe("%");
  });

  it("un grupo suprimido no publica valores y conserva su n", () => {
    const women = buildSegmentChart(DATA, "q1", "average", ["Aprueba", "Desaprueba"])!.columns[1];
    expect(women).toMatchObject({ suppressed: true, n: 10, values: [null, null] });
  });

  it("el eje llega al menos a 60 y sube en múltiplos de 10 si hace falta", () => {
    expect(buildSegmentChart(DATA, "q1", "average", ["Aprueba", "Desaprueba"])!.domain).toEqual([0, 70]);
  });

  it("escala: promedio o % notas 5 a 7", () => {
    const avg = buildSegmentChart(DATA, "q2", "average", [])!;
    expect(avg).toMatchObject({ unit: "nota", domain: [1, 7], seriesLabels: ["Promedio"] });
    expect(avg.columns.map((c) => c.values[0])).toEqual([4.8, null, 4.1]);
    const top3 = buildSegmentChart(DATA, "q2", "top3", [])!;
    expect(top3.unit).toBe("%");
    expect(top3.columns[0].values).toEqual([60]);
  });

  it("devuelve null si la pregunta no existe", () => {
    expect(buildSegmentChart(DATA, "no-existe", "average", [])).toBeNull();
  });
});

describe("vistas de segmentos", () => {
  const group = (key: string) => ({ key, label: key, n: 40, questions: [] });
  const DATA: SegmentsData = {
    series: { slug: "barometro", title: "Barómetro", cadence: "monthly" },
    edition: "2026-10", label: "Octubre 2026", is_open: true, min_n: 30,
    segments: [
      { variable: "sex", label: "Sexo", groups: [group("Masculino")] },
      { variable: "zone", label: "Zona", groups: [group("Sur")] },
      { variable: "q:qa", label: "Según su respuesta a «¿Supo?»", groups: [group("Sí")] },
      { variable: "q:qb", label: "Según su respuesta a «¿Aprueba?»", groups: [group("Aprueba")] },
    ],
  };

  it("ofrece la demografía y los cruces por otras preguntas, nunca la pregunta consigo misma", () => {
    expect(segmentViews(DATA, "qb").map((v) => v.id)).toEqual([DEMOGRAPHIC_VIEW, "q:qa"]);
    expect(segmentViews(DATA, "qa").map((v) => v.id)).toEqual([DEMOGRAPHIC_VIEW, "q:qb"]);
  });

  it("la vista demográfica deja solo variables demográficas; el cruce deja solo ese segmento", () => {
    expect(segmentsForView(DATA, DEMOGRAPHIC_VIEW, "qb").segments.map((s) => s.variable)).toEqual(["sex", "zone"]);
    expect(segmentsForView(DATA, "q:qa", "qb").segments.map((s) => s.variable)).toEqual(["q:qa"]);
  });

  it("una vista que ya no aplica a la pregunta vuelve a la demografía", () => {
    expect(segmentsForView(DATA, "q:qb", "qb").segments.map((s) => s.variable)).toEqual(["sex", "zone"]);
  });

  it("sin cruces solo hay una vista", () => {
    expect(segmentViews({ ...DATA, segments: DATA.segments.slice(0, 2) }, "qb")).toHaveLength(1);
  });
});
