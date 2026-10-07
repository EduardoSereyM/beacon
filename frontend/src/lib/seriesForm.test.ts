import { describe, expect, it } from "vitest";
import { editionPreview, effectiveSlug, emptyDraft, emptyQuestion, slugify, toPayload, validateDraft, type SeriesDraft } from "@/lib/seriesForm";

const valid = (): SeriesDraft => ({
  ...emptyDraft(),
  title: "Barómetro Beacon",
  questions: [{ ...emptyQuestion(), text: "¿Aprueba?", options: ["Aprueba", "Desaprueba", "No sabe / No responde"] }],
});

describe("slugify", () => {
  it("quita tildes, pasa a minúsculas y une con guiones", () => {
    expect(slugify("¿Barómetro Beacon: Octubre?")).toBe("barometro-beacon-octubre");
    expect(slugify("  Pulso   Beacon  ")).toBe("pulso-beacon");
    expect(slugify("Ñandú & Co.")).toBe("nandu-co");
  });
  it("respeta el máximo y no termina en guion", () => {
    const slug = slugify("a".repeat(99) + " b");
    expect(slug.length).toBeLessThanOrEqual(100);
    expect(slug.endsWith("-")).toBe(false);
  });
  it("el slug manual gana sobre el generado", () => {
    expect(effectiveSlug({ ...valid(), slug: "mi-serie" })).toBe("mi-serie");
    expect(effectiveSlug(valid())).toBe("barometro-beacon");
  });
});

describe("validateDraft", () => {
  it("un borrador correcto no tiene errores", () => {
    expect(validateDraft(valid())).toEqual([]);
  });
  it("exige título y texto de la pregunta", () => {
    const errors = validateDraft({ ...emptyDraft() });
    expect(errors).toContain("Escribe un título.");
    expect(errors).toContain("Pregunta 1: escribe el texto.");
  });
  it("rechaza slug inválido", () => {
    expect(validateDraft({ ...valid(), slug: "Mi Serie!" }).some((e) => e.includes("slug"))).toBe(true);
  });
  it("opciones: mínimo 2, sin vacías y sin repetidas", () => {
    const q = (options: string[]) => ({ ...valid(), questions: [{ ...emptyQuestion(), text: "x", options }] });
    expect(validateDraft(q(["Sí"]))).toContain("Pregunta 1: necesita al menos 2 opciones.");
    expect(validateDraft(q(["Sí", ""]))).toContain("Pregunta 1: hay opciones vacías.");
    expect(validateDraft(q(["Sí", "sí"]))).toContain("Pregunta 1: las opciones no pueden repetirse.");
  });
  it("escala: de 2 a 10 puntos; máximo 4 preguntas", () => {
    const scale = (points: number) => ({ ...valid(), questions: [{ ...emptyQuestion(), type: "scale" as const, text: "Nota", scalePoints: points }] });
    expect(validateDraft(scale(7))).toEqual([]);
    expect(validateDraft(scale(11))).toContain("Pregunta 1: la escala admite de 2 a 10 puntos.");
    const five = { ...valid(), questions: Array.from({ length: 5 }, () => ({ ...valid().questions[0] })) };
    expect(validateDraft(five)).toContain("Una serie admite hasta 4 preguntas.");
  });
});

describe("toPayload", () => {
  it("arma el cuerpo para el backend", () => {
    const payload = toPayload({ ...valid(), cadence: "weekly", tags: "Aprobación, aprobación, barómetro", context: "  Medición  " });
    expect(payload).toMatchObject({ title: "Barómetro Beacon", cadence: "weekly", context: "Medición", tags: ["aprobación", "barómetro"], requires_auth: true });
    expect(payload).not.toHaveProperty("slug");
    expect(payload.questions[0]).toMatchObject({ type: "multiple_choice", order_index: 0, options: ["Aprueba", "Desaprueba", "No sabe / No responde"], allow_multiple: false });
  });
  it("envía el slug solo si se escribió", () => {
    expect(toPayload({ ...valid(), slug: " mi-serie " })).toMatchObject({ slug: "mi-serie" });
  });
  it("escala: etiquetas solo si están todas", () => {
    const base = { ...emptyQuestion(), type: "scale" as const, text: "Nota", scalePoints: 3 };
    const none = toPayload({ ...valid(), questions: [base] }).questions[0];
    const partial = toPayload({ ...valid(), questions: [{ ...base, scaleLabels: ["Mala", "", "Buena"] }] }).questions[0];
    const full = toPayload({ ...valid(), questions: [{ ...base, scaleLabels: ["Mala", "Regular", "Buena"] }] }).questions[0];
    expect(none).not.toHaveProperty("scale_labels");
    expect(partial).not.toHaveProperty("scale_labels");
    expect(full).toMatchObject({ scale_points: 3, scale_labels: ["Mala", "Regular", "Buena"] });
  });
});

describe("editionPreview", () => {
  it("semanal y mensual", () => {
    expect(editionPreview({ ...valid(), cadence: "weekly" })).toMatchObject({ slug: "barometro-beacon-2026-w42" });
    expect(editionPreview(valid())).toMatchObject({ title: "Barómetro Beacon — Octubre 2026", slug: "barometro-beacon-2026-10" });
  });
  it("sin título muestra un ejemplo", () => {
    expect(editionPreview(emptyDraft()).title).toContain("Título de la serie");
  });
});
