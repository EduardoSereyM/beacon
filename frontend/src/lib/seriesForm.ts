/**
 * BEACON CHILE — Formulario de creación de series: borrador, validación y payload
 * ================================================================================
 * Funciones puras. Las reglas replican las del backend (`SeriesCreateIn`, `QuestionDef`) para avisar
 * antes de enviar; el backend sigue siendo la fuente de verdad y vuelve a validar.
 */

import type { Cadence } from "@/lib/series";

export const CATEGORIES = [
  "general", "politica", "economia", "salud", "educacion", "espectaculos", "deporte", "cultura", "seguridad", "justicia",
] as const;

export const TITLE_MAX = 280;
export const SLUG_MIN = 2;
export const SLUG_MAX = 100;
export const QUESTION_MAX = 4;          // máximo de preguntas por encuesta en Beacon
export const QUESTION_TEXT_MAX = 500;
export const OPTION_MAX = 200;
export const MIN_OPTIONS = 2;
export const SCALE_MIN_POINTS = 2;
export const SCALE_MAX_POINTS = 10;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type QuestionType = "multiple_choice" | "scale";

export interface QuestionDraft {
  text: string;
  type: QuestionType;
  /** Opciones de una pregunta de opción única, una por posición. */
  options: string[];
  allowMultiple: boolean;
  scalePoints: number;
  /** Etiqueta por punto de la escala (puede dejarse vacía). */
  scaleLabels: string[];
}

export interface SeriesDraft {
  title: string;
  slug: string;
  cadence: Cadence;
  category: string;
  context: string;
  tags: string;
  requiresAuth: boolean;
  questions: QuestionDraft[];
}

export const emptyQuestion = (): QuestionDraft => ({
  text: "", type: "multiple_choice", options: ["", ""], allowMultiple: false, scalePoints: 7, scaleLabels: [],
});

export const emptyDraft = (): SeriesDraft => ({
  title: "", slug: "", cadence: "monthly", category: "general", context: "", tags: "", requiresAuth: true,
  questions: [emptyQuestion()],
});

/** «Barómetro Beacon» → «barometro-beacon» (sin tildes, minúsculas, guiones). */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

export const effectiveSlug = (draft: SeriesDraft) => draft.slug.trim() || slugify(draft.title);

/** Mensajes de error en español; lista vacía = se puede enviar. */
export function validateDraft(draft: SeriesDraft): string[] {
  const errors: string[] = [];
  const title = draft.title.trim();
  if (!title) errors.push("Escribe un título.");
  else if (title.length > TITLE_MAX) errors.push(`El título admite hasta ${TITLE_MAX} caracteres.`);

  const slug = effectiveSlug(draft);
  if (title && (slug.length < SLUG_MIN || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug))) {
    errors.push(`La dirección (slug) debe tener entre ${SLUG_MIN} y ${SLUG_MAX} caracteres: minúsculas, números y guiones.`);
  }

  if (draft.questions.length === 0) errors.push("Agrega al menos una pregunta.");
  if (draft.questions.length > QUESTION_MAX) errors.push(`Una serie admite hasta ${QUESTION_MAX} preguntas.`);

  draft.questions.forEach((question, index) => {
    const label = `Pregunta ${index + 1}`;
    const text = question.text.trim();
    if (!text) errors.push(`${label}: escribe el texto.`);
    else if (text.length > QUESTION_TEXT_MAX) errors.push(`${label}: el texto admite hasta ${QUESTION_TEXT_MAX} caracteres.`);

    if (question.type === "multiple_choice") {
      const options = question.options.map((o) => o.trim());
      if (options.some((o) => !o)) errors.push(`${label}: hay opciones vacías.`);
      const filled = options.filter(Boolean);
      if (filled.length < MIN_OPTIONS) errors.push(`${label}: necesita al menos ${MIN_OPTIONS} opciones.`);
      if (new Set(filled.map((o) => o.toLowerCase())).size !== filled.length) errors.push(`${label}: las opciones no pueden repetirse.`);
      if (filled.some((o) => o.length > OPTION_MAX)) errors.push(`${label}: cada opción admite hasta ${OPTION_MAX} caracteres.`);
    } else if (question.scalePoints < SCALE_MIN_POINTS || question.scalePoints > SCALE_MAX_POINTS) {
      errors.push(`${label}: la escala admite de ${SCALE_MIN_POINTS} a ${SCALE_MAX_POINTS} puntos.`);
    }
  });
  return errors;
}

const parseTags = (raw: string) =>
  raw.split(",").map((t) => t.trim().toLowerCase()).filter((t, i, all) => t && all.indexOf(t) === i);

/** Cuerpo de `POST /admin/polls/series`. */
export function toPayload(draft: SeriesDraft) {
  return {
    title: draft.title.trim(),
    ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
    cadence: draft.cadence,
    category: draft.category,
    context: draft.context.trim() || null,
    tags: parseTags(draft.tags),
    requires_auth: draft.requiresAuth,
    questions: draft.questions.map((question, order_index) =>
      question.type === "multiple_choice"
        ? {
            text: question.text.trim(), type: "multiple_choice", order_index,
            options: question.options.map((o) => o.trim()), allow_multiple: question.allowMultiple,
          }
        : {
            text: question.text.trim(), type: "scale", order_index, scale_points: question.scalePoints,
            // Etiquetas solo si se completaron todas: el backend exige una por punto.
            ...(question.scaleLabels.length === question.scalePoints && question.scaleLabels.every((l) => l.trim())
              ? { scale_labels: question.scaleLabels.map((l) => l.trim()) }
              : {}),
          },
    ),
  };
}

/** Cómo se verá cada edición: título, dirección y cuándo abre. */
export function editionPreview(draft: SeriesDraft): { title: string; slug: string; opens: string } {
  const title = draft.title.trim() || "Título de la serie";
  const slug = effectiveSlug(draft) || "titulo-de-la-serie";
  return draft.cadence === "weekly"
    ? { title: `${title} — Semana 42 · 12–18 oct 2026`, slug: `${slug}-2026-w42`, opens: "cada lunes a las 04:00 (hora de Chile) y cierra el lunes siguiente a las 03:59" }
    : { title: `${title} — Octubre 2026`, slug: `${slug}-2026-10`, opens: "el día 1 de cada mes a las 00:00 (hora de Chile) y cierra el último día del mes" };
}
