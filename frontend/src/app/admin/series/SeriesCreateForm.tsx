"use client";

/**
 * SeriesCreateForm — crea una serie recurrente (mensual o semanal) desde el admin.
 * Una serie compara LO MISMO en el tiempo: cada edición copia estas preguntas tal cual. Por eso el formulario
 * avisa que cambiarlas después corta la línea de tendencia, y muestra cómo se verá cada edición.
 */

import { useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminApi";
import {
  CATEGORIES,
  QUESTION_MAX,
  SCALE_MAX_POINTS,
  SCALE_MIN_POINTS,
  editionPreview,
  effectiveSlug,
  emptyDraft,
  emptyQuestion,
  toPayload,
  validateDraft,
  type QuestionDraft,
  type SeriesDraft,
} from "@/lib/seriesForm";

const box = { padding: "8px 10px", borderRadius: 8, background: "#0f0f0f", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.15)", fontSize: 13, width: "100%" } as const;
const small = { fontSize: 12, color: "rgba(255,255,255,0.55)" } as const;
const button = { padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "transparent" } as const;

export default function SeriesCreateForm({ onCreated }: { onCreated: () => void }) {
  const [draft, setDraft] = useState<SeriesDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const preview = useMemo(() => editionPreview(draft), [draft]);

  const patch = (changes: Partial<SeriesDraft>) => {
    setDraft((d) => ({ ...d, ...changes }));
    setCreated(null);
  };
  const patchQuestion = (index: number, changes: Partial<QuestionDraft>) =>
    patch({ questions: draft.questions.map((q, i) => (i === index ? { ...q, ...changes } : q)) });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    setServerError(null);
    if (errors.length > 0) return;
    setSaving(true);
    try {
      await adminFetch("/admin/polls/series", { method: "POST", body: JSON.stringify(toPayload(draft)) });
      setCreated(`Serie «${draft.title.trim()}» creada. Publicará su primera edición en la próxima ejecución del cron (o al lanzarlo a mano).`);
      setDraft(emptyDraft());
      setShowErrors(false);
      onCreated();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "No se pudo crear la serie");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 14 }} noValidate>
      <p style={{ ...small, margin: 0, lineHeight: 1.6, padding: 10, borderRadius: 8, border: "1px solid rgba(212,175,55,0.4)", color: "#D4AF37" }}>
        Una serie compara <strong>lo mismo</strong> en el tiempo: cada edición copia estas preguntas tal cual. Redáctalas con cuidado:
        cambiarlas después sube la versión de la plantilla y <strong>corta la línea de tendencia</strong>.
      </p>

      <label style={small}>
        Título *
        <input style={box} value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="p. ej. Barómetro Beacon" />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label style={{ ...small, flex: "1 1 220px" }}>
          Dirección (slug) — opcional
          <input style={box} value={draft.slug} onChange={(e) => patch({ slug: e.target.value })} placeholder={effectiveSlug(draft) || "se genera del título"} />
        </label>
        <label style={{ ...small, flex: "1 1 160px" }}>
          Cadencia *
          <select style={box} value={draft.cadence} onChange={(e) => patch({ cadence: e.target.value as SeriesDraft["cadence"] })}>
            <option value="monthly">Mensual</option>
            <option value="weekly">Semanal</option>
          </select>
        </label>
        <label style={{ ...small, flex: "1 1 160px" }}>
          Categoría
          <select style={box} value={draft.category} onChange={(e) => patch({ category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <label style={small}>
        Contexto — opcional
        <textarea style={{ ...box, resize: "vertical" }} rows={2} value={draft.context} onChange={(e) => patch({ context: e.target.value })} placeholder="Qué mide la serie y cómo leerla" />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        <label style={{ ...small, flex: "1 1 260px" }}>
          Etiquetas — separadas por coma
          <input style={box} value={draft.tags} onChange={(e) => patch({ tags: e.target.value })} placeholder="aprobacion, barometro" />
        </label>
        <label style={{ ...small, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={draft.requiresAuth} onChange={(e) => patch({ requiresAuth: e.target.checked })} />
          Requiere iniciar sesión para votar
        </label>
      </div>

      <fieldset style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 12, display: "grid", gap: 12 }}>
        <legend style={{ ...small, padding: "0 6px" }}>Preguntas (hasta {QUESTION_MAX})</legend>
        {draft.questions.map((question, index) => (
          <div key={index} style={{ display: "grid", gap: 8, padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 13 }}>Pregunta {index + 1}</strong>
              <div style={{ display: "flex", gap: 6 }}>
                {([["multiple_choice", "Opciones"], ["scale", "Escala"]] as const).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={question.type === type}
                    onClick={() => patchQuestion(index, { type })}
                    style={{ ...button, padding: "5px 10px", border: `1px solid ${question.type === type ? "#00E5FF" : "rgba(255,255,255,0.2)"}`, color: question.type === type ? "#00E5FF" : "rgba(255,255,255,0.6)" }}
                  >
                    {label}
                  </button>
                ))}
                {draft.questions.length > 1 && (
                  <button type="button" onClick={() => patch({ questions: draft.questions.filter((_, i) => i !== index) })} style={{ ...button, padding: "5px 10px", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)" }}>
                    Quitar
                  </button>
                )}
              </div>
            </div>
            <input aria-label={`Texto de la pregunta ${index + 1}`} style={box} value={question.text} onChange={(e) => patchQuestion(index, { text: e.target.value })} placeholder="Texto de la pregunta" />

            {question.type === "multiple_choice" ? (
              <div style={{ display: "grid", gap: 6 }}>
                {question.options.map((option, k) => (
                  <div key={k} style={{ display: "flex", gap: 6 }}>
                    <input
                      aria-label={`Opción ${k + 1} de la pregunta ${index + 1}`}
                      style={box}
                      value={option}
                      onChange={(e) => patchQuestion(index, { options: question.options.map((o, i) => (i === k ? e.target.value : o)) })}
                      placeholder={`Opción ${k + 1}`}
                    />
                    {question.options.length > 2 && (
                      <button type="button" aria-label={`Quitar la opción ${k + 1}`} onClick={() => patchQuestion(index, { options: question.options.filter((_, i) => i !== k) })} style={{ ...button, border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)" }}>×</button>
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => patchQuestion(index, { options: [...question.options, ""] })} style={{ ...button, border: "1px solid rgba(255,255,255,0.2)", color: "#f5f5f5" }}>+ Opción</button>
                  <label style={{ ...small, display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={question.allowMultiple} onChange={(e) => patchQuestion(index, { allowMultiple: e.target.checked })} />
                    Permitir elegir varias
                  </label>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={small}>
                  Puntos de la escala ({SCALE_MIN_POINTS} a {SCALE_MAX_POINTS})
                  <select
                    style={{ ...box, width: 120 }}
                    value={question.scalePoints}
                    onChange={(e) => patchQuestion(index, { scalePoints: Number(e.target.value), scaleLabels: [] })}
                  >
                    {Array.from({ length: SCALE_MAX_POINTS - SCALE_MIN_POINTS + 1 }, (_, i) => SCALE_MIN_POINTS + i).map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <details>
                  <summary style={{ ...small, cursor: "pointer" }}>Etiquetas por punto (opcional; deben completarse todas)</summary>
                  <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                    {Array.from({ length: question.scalePoints }, (_, k) => (
                      <input
                        key={k}
                        aria-label={`Etiqueta del punto ${k + 1}`}
                        style={box}
                        value={question.scaleLabels[k] ?? ""}
                        onChange={(e) => {
                          const labels = Array.from({ length: question.scalePoints }, (_, i) => (i === k ? e.target.value : question.scaleLabels[i] ?? ""));
                          patchQuestion(index, { scaleLabels: labels });
                        }}
                        placeholder={`${k + 1}`}
                      />
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        ))}
        {draft.questions.length < QUESTION_MAX && (
          <div>
            <button type="button" onClick={() => patch({ questions: [...draft.questions, emptyQuestion()] })} style={{ ...button, border: "1px solid rgba(255,255,255,0.2)", color: "#f5f5f5" }}>+ Pregunta</button>
          </div>
        )}
      </fieldset>

      <div style={{ ...small, lineHeight: 1.7, padding: 10, borderRadius: 8, background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.2)" }}>
        <strong style={{ color: "#00E5FF" }}>Vista previa de cada edición</strong><br />
        Título: {preview.title}<br />
        Dirección: /encuestas/{preview.slug}<br />
        Abre {preview.opens}.
      </div>

      {showErrors && errors.length > 0 && (
        <ul role="alert" style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#FF073A", display: "grid", gap: 2 }}>
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      {serverError && <p role="alert" style={{ margin: 0, fontSize: 12, color: "#FF073A" }}>{serverError}</p>}
      {created && <p role="status" style={{ margin: 0, fontSize: 12, color: "#39FF14" }}>{created}</p>}

      <div>
        <button type="submit" disabled={saving} style={{ ...button, color: "#00E5FF", border: "1px solid #00E5FF" }}>
          {saving ? "Creando…" : "Crear serie"}
        </button>
      </div>
    </form>
  );
}
