import { describe, expect, it } from "vitest";
import { NOT_ENOUGH, seriesHeadline } from "@/lib/seriesReport";
import type { GroupResult, SeriesTrend, TrendPoint } from "@/lib/series";

const group = (n: number, a: number | null, d = 0): GroupResult => ({
  n,
  suppressed: a === null,
  results: a === null ? null : [
    { option: "Aprueba", count: 0, pct: a },
    { option: "Desaprueba", count: 0, pct: d },
    { option: "No sabe / No responde", count: 0, pct: 5 },
  ],
});

const point = (i: number, version: number, verified: GroupResult): TrendPoint => ({
  edition: `2026-W${40 + i}`, label: `Semana ${40 + i}`, poll_slug: "x", starts_at: "", ends_at: "", is_open: false,
  template_version: version, total_votes: 0, verified_votes: 0, weighting: null,
  questions: [{ question_id: "q1", text: "¿Aprueba?", type: "multiple_choice", verified, total: verified, weighted: group(0, null) }],
});

const trend = (points: TrendPoint[]): SeriesTrend => ({
  series: { slug: "pulso", title: "Pulso Beacon", cadence: "weekly", context: null, category: null, is_active: true },
  min_n: 30, points, events: [],
});

describe("seriesHeadline — agenda", () => {
  const agendaPoint = (i: number, rows: [string, number][]): TrendPoint => ({
    ...point(i, 1, group(80, 41, 51)),
    questions: [{
      question_id: "q1", text: "¿Noticia?", type: "multiple_choice",
      verified: { n: 80, suppressed: false, results: rows.map(([option, pct]) => ({ option, count: 0, pct })) },
      total: group(0, null), weighted: group(0, null),
    }],
  });
  const agendaTrend = (points: TrendPoint[]): SeriesTrend => ({ ...trend(points), series: { ...trend(points).series, kind: "agenda" } });

  it("titula con las dos opciones más elegidas, sin las fijas, y no compara con la semana anterior", () => {
    const rows: [string, number][] = [["Alza de combustibles", 30], ["Cadena nacional", 45], ["Marcha", 10], ["Otra noticia", 12], ["No sabe / No responde", 3]];
    const h = seriesHeadline(agendaTrend([agendaPoint(0, rows), agendaPoint(1, rows)]));
    expect(h.text).toBe("Pulso Beacon · Semana 41: Cadena nacional 45%, Alza de combustibles 30%");
    expect(h.previous).toBeNull();
  });
});

describe("seriesHeadline", () => {
  it("describe los dos valores principales, sin «no sabe» y sin adjetivos", () => {
    const h = seriesHeadline(trend([point(0, 1, group(80, 41, 51)), point(1, 1, group(90, 38, 54))]));
    expect(h.text).toBe("Pulso Beacon · Semana 41: Aprueba 38%, Desaprueba 54%");
    expect(h.previous).toBe("Edición anterior (Semana 40): Aprueba 41%, Desaprueba 51%");
    expect(h).toMatchObject({ n: 90, edition: "2026-W41", available: true });
    expect(h.text).not.toMatch(/sube|baja|récord|más bajo|más alto/i);
  });

  it("no compara con una edición de otra versión de la pregunta", () => {
    const h = seriesHeadline(trend([point(0, 1, group(80, 41, 51)), point(1, 2, group(90, 38, 54))]));
    expect(h.previous).toBeNull();
  });

  it("usa la última edición con datos suficientes", () => {
    const h = seriesHeadline(trend([point(0, 1, group(80, 41, 51)), point(1, 1, group(10, null))]));
    expect(h.edition).toBe("2026-W40");
    expect(h.previous).toBeNull();
  });

  it("sin datos suficientes, lo dice y no inventa cifras", () => {
    const h = seriesHeadline(trend([point(0, 1, group(10, null))]));
    expect(h).toMatchObject({ text: NOT_ENOUGH, available: false, n: null, previous: null });
    expect(seriesHeadline(trend([])).available).toBe(false);
  });
});
