"use client";

/**
 * AgendaOptionsEditor — define las opciones de la edición en curso y la siguiente de una serie agenda.
 * El cron publica la edición solo cuando tiene opciones; sin ellas queda «esperando opciones».
 * Una opción por línea (2 a 8, de 3 a 140 caracteres, sin repetir). Una edición ya publicada no se edita.
 */

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminApi";

interface UpcomingEdition {
  edition: string;
  label: string;
  published: boolean;
  options: string[] | null;
}

interface Upcoming {
  editions: UpcomingEdition[];
}

const input = { padding: "8px 10px", borderRadius: 8, background: "#0f0f0f", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.15)", fontSize: 13 } as const;

export default function AgendaOptionsEditor({ seriesId, title }: { seriesId: string; title: string }) {
  const [editions, setEditions] = useState<UpcomingEdition[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<Upcoming>(`/admin/polls/series/${seriesId}/upcoming`);
      setEditions(data.editions);
      setDrafts((current) => {
        const next = { ...current };
        for (const e of data.editions) if (next[e.edition] === undefined) next[e.edition] = (e.options ?? []).join("\n");
        return next;
      });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "No se pudo cargar" });
    }
  }, [seriesId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (edition: string) => {
    const options = (drafts[edition] ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
    setBusy(edition);
    setMessage(null);
    try {
      await adminFetch(`/admin/polls/series/${seriesId}/editions/${edition}/options`, { method: "PUT", body: JSON.stringify({ options }) });
      setMessage({ ok: true, text: "Opciones guardadas." });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "No se pudo guardar" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{title}: opciones de la edición</h3>
      {message && <p role="status" style={{ fontSize: 12, margin: 0, color: message.ok ? "#39FF14" : "#FF073A" }}>{message.text}</p>}
      {editions.map((edition) => (
        <div key={edition.edition} style={{ display: "grid", gap: 6 }}>
          <label htmlFor={`options-${seriesId}-${edition.edition}`} style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            {edition.label}{" "}
            <strong style={{ color: edition.published ? "#39FF14" : edition.options ? "#00E5FF" : "#D4AF37" }}>
              {edition.published ? "· publicada" : edition.options ? "· lista para publicar" : "· esperando opciones"}
            </strong>
          </label>
          <textarea
            id={`options-${seriesId}-${edition.edition}`}
            rows={5}
            disabled={edition.published || busy === edition.edition}
            value={drafts[edition.edition] ?? ""}
            onChange={(e) => setDrafts((d) => ({ ...d, [edition.edition]: e.target.value }))}
            placeholder={"Una noticia por línea (2 a 8)\nAlza de combustibles\nCadena nacional"}
            style={{ ...input, resize: "vertical", fontFamily: "inherit" }}
          />
          {!edition.published && (
            <div>
              <button
                type="button"
                disabled={busy === edition.edition}
                onClick={() => void save(edition.edition)}
                style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "transparent", color: "#00E5FF", border: "1px solid #00E5FF" }}
              >
                Guardar opciones
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
