/**
 * BEACON PROTOCOL — Admin Series (Búnker de Control)
 * ====================================================
 * Series de encuestas recurrentes: crear, ver, pausar/activar y anotar eventos que se
 * dibujan sobre el gráfico de tendencia pública.
 */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AgendaOptionsEditor from "@/app/admin/series/AgendaOptionsEditor";
import SeriesCreateForm from "@/app/admin/series/SeriesCreateForm";
import { adminFetch } from "@/lib/adminApi";
import { cadenceLabel, type Cadence } from "@/lib/series";

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  cadence: Cadence;
  kind?: "tracker" | "agenda";
  is_active: boolean;
  template_version: number;
  last_published_at: string | null;
}

interface EventItem {
  id: string;
  series_id: string | null;
  event_date: string;
  label: string;
}

const GENERAL = "";
const panel = { background: "rgba(17,17,17,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 18 } as const;
const input = { padding: "8px 10px", borderRadius: 8, background: "#0f0f0f", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.15)", fontSize: 13 } as const;
const button = { padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "transparent" } as const;

const formatDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }) : "—";
const formatDay = (day: string) =>
  new Date(`${day}T12:00:00-03:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" });

export default function AdminSeriesPage() {
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [eventSeries, setEventSeries] = useState(GENERAL);
  const [eventDate, setEventDate] = useState("");
  const [eventLabel, setEventLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([
        adminFetch<{ items: SeriesItem[] }>("/admin/polls/series"),
        adminFetch<{ items: EventItem[] }>("/admin/series-events"),
      ]);
      setSeries(s.items);
      setEvents(e.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setSaving(true);
    setMessage(null);
    try {
      await action();
      setMessage(done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "La operación falló");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (item: SeriesItem) =>
    run(
      () => adminFetch(`/admin/polls/series/${item.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !item.is_active }) }),
      item.is_active ? `Serie "${item.title}" pausada: el cron no publicará nuevas ediciones.` : `Serie "${item.title}" activada.`,
    );

  const createEvent = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await adminFetch("/admin/series-events", {
        method: "POST",
        body: JSON.stringify({ series_id: eventSeries || null, event_date: eventDate, label: eventLabel.trim() }),
      });
      setEventLabel("");
      setEventDate("");
    }, "Evento anotado.");
  };

  const removeEvent = (id: string) => {
    setConfirmDelete(null);
    void run(() => adminFetch(`/admin/series-events/${id}`, { method: "DELETE" }), "Evento eliminado.");
  };

  const seriesName = (id: string | null) => (id ? series.find((s) => s.id === id)?.title ?? "Serie" : "Todas las series");

  return (
    <div style={{ display: "grid", gap: 20, color: "#f5f5f5" }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Series de encuestas</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          Las ediciones se publican solas (mensual: día 1; semanal: lunes 04:00 hora de Chile). Pausar una serie detiene las nuevas ediciones y conserva el histórico.
        </p>
      </header>

      {error && <div role="alert" style={{ ...panel, borderColor: "#FF073A", color: "#FF073A", fontSize: 13 }}>{error}</div>}
      {message && <div role="status" style={{ ...panel, borderColor: "#39FF14", color: "#39FF14", fontSize: 13 }}>{message}</div>}

      <details style={panel}>
        <summary style={{ cursor: "pointer", fontSize: 15, fontWeight: 800 }}>Crear una serie</summary>
        <div style={{ marginTop: 14 }}>
          <SeriesCreateForm onCreated={() => void load()} />
        </div>
      </details>

      <section style={panel} aria-label="Series">
        {loading ? (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Cargando…</p>
        ) : series.length === 0 ? (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Aún no hay series. Crea la primera con «Crear una serie».</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                  <th style={{ padding: 8 }}>Serie</th>
                  <th style={{ padding: 8 }}>Cadencia</th>
                  <th style={{ padding: 8 }}>Versión</th>
                  <th style={{ padding: 8 }}>Última edición</th>
                  <th style={{ padding: 8 }}>Estado</th>
                  <th style={{ padding: 8 }} />
                </tr>
              </thead>
              <tbody>
                {series.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: 8 }}>
                      <Link href={`/series/${item.slug}`} style={{ color: "#00E5FF", textDecoration: "none", fontWeight: 700 }}>{item.title}</Link>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{item.slug}</div>
                    </td>
                    <td style={{ padding: 8 }}>{cadenceLabel(item.cadence)}{item.kind === "agenda" ? " · agenda" : ""}</td>
                    <td style={{ padding: 8 }}>v{item.template_version}</td>
                    <td style={{ padding: 8 }}>{formatDateTime(item.last_published_at)}</td>
                    <td style={{ padding: 8, color: item.is_active ? "#39FF14" : "#D4AF37", fontWeight: 700 }}>{item.is_active ? "Activa" : "Pausada"}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      <button type="button" disabled={saving} onClick={() => void toggleActive(item)} style={{ ...button, color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.2)" }}>
                        {item.is_active ? "Pausar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {series.filter((s) => s.kind === "agenda" && s.is_active).map((s) => (
        <section key={s.id} style={panel} aria-label={`Agenda: ${s.title}`}>
          <AgendaOptionsEditor seriesId={s.id} title={s.title} />
        </section>
      ))}

      <section style={panel} aria-label="Eventos anotados">
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Eventos anotados</h2>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
          Hitos que se numeran sobre el gráfico de tendencia (p. ej. «Cambio de gabinete»). Un evento general aparece en todas las series.
        </p>

        <form onSubmit={createEvent} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <select aria-label="Serie del evento" value={eventSeries} onChange={(e) => setEventSeries(e.target.value)} style={input}>
            <option value={GENERAL}>Todas las series</option>
            {series.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <input aria-label="Fecha del evento" type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={input} />
          <input aria-label="Descripción del evento" type="text" required maxLength={120} placeholder="Descripción (máx. 120)" value={eventLabel} onChange={(e) => setEventLabel(e.target.value)} style={{ ...input, flex: "1 1 220px" }} />
          <button type="submit" disabled={saving} style={{ ...button, color: "#00E5FF", border: "1px solid #00E5FF" }}>Anotar evento</button>
        </form>

        {events.length === 0 ? (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Aún no hay eventos.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {events.map((event) => (
              <li key={event.id} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 13, padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ color: "rgba(255,255,255,0.5)", minWidth: 110 }}>{formatDay(event.event_date)}</span>
                <span style={{ flex: "1 1 200px" }}>{event.label}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{seriesName(event.series_id)}</span>
                {confirmDelete === event.id ? (
                  <span style={{ display: "flex", gap: 6 }}>
                    <button type="button" disabled={saving} onClick={() => removeEvent(event.id)} style={{ ...button, color: "#FF073A", border: "1px solid #FF073A" }}>Confirmar</button>
                    <button type="button" onClick={() => setConfirmDelete(null)} style={{ ...button, color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.2)" }}>Cancelar</button>
                  </span>
                ) : (
                  <button type="button" disabled={saving} onClick={() => setConfirmDelete(event.id)} style={{ ...button, color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.2)" }}>Eliminar</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
