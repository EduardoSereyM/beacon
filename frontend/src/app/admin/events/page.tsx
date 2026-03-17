/**
 * BEACON PROTOCOL — Admin Events (CRUD + Participantes)
 * =======================================================
 * Crear eventos, gestionar participantes y ver scores.
 * Panel dividido en dos secciones:
 *   1. Lista de eventos (crear/editar/activar)
 *   2. Gestión de participantes (añadir/quitar entidades)
 */

"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Entity {
  id: string;
  first_name: string;
  last_name: string;
  category: string;
  photo_path: string | null;
  reputation_score: number;
}

interface Participant extends Entity {
  event_score_avg: number | null;
  event_vote_count: number;
}

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  participant_count: number;
  total_votes: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  politico:   "Político",
  periodista: "Periodista",
  empresario: "Empresario",
  empresa:    "Empresa",
  evento:     "Evento",
  artista:    "Artista",
};

function getToken(): string {
  return localStorage.getItem("beacon_token") || "";
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function toLocalDatetimeInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toISOString(localDatetime: string): string {
  if (!localDatetime) return "";
  return new Date(localDatetime).toISOString();
}

function scoreColor(score: number | null): string {
  if (!score) return "rgba(255,255,255,0.3)";
  if (score >= 4.5) return "#39FF14";
  if (score >= 3.5) return "#D4AF37";
  if (score >= 2.5) return "#FF8C00";
  return "#FF073A";
}

// ─── EntitySearchSelector ─────────────────────────────────────────────────────

function EntitySearchSelector({
  entities,
  onSelect,
  excludeIds,
}: {
  entities: Entity[];
  onSelect: (entity: Entity) => void;
  excludeIds: string[];
}) {
  const [search, setSearch] = useState("");
  const filtered = entities.filter(
    (e) =>
      !excludeIds.includes(e.id) &&
      `${e.first_name} ${e.last_name} ${e.category}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  return (
    <div>
      <input
        placeholder="Buscar entidad por nombre o categoría…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#f5f5f5",
          fontSize: 12,
          outline: "none",
          marginBottom: 8,
        }}
      />
      <div
        style={{
          maxHeight: 200,
          overflowY: "auto",
          background: "#111",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 8,
        }}
      >
        {filtered.length === 0 ? (
          <p style={{ padding: "10px 14px", fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
            Sin resultados
          </p>
        ) : (
          filtered.slice(0, 60).map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => { onSelect(e); setSearch(""); }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "8px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div>
                <p style={{ fontSize: 12, color: "#f5f5f5", margin: 0 }}>
                  {e.first_name} {e.last_name}
                </p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, textTransform: "capitalize" }}>
                  {CATEGORY_LABELS[e.category] || e.category}
                </p>
              </div>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "#D4AF37" }}>
                + Agregar
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<EventItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  // ─── Fetches ───────────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/events`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setEvents(d.items || []);
      }
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/entities?limit=500`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setEntities(d.items || []);
      }
    } catch {/* non-critical */}
  }, []);

  const fetchParticipants = useCallback(async (eventId: string) => {
    setLoadingParts(true);
    try {
      const res = await fetch(
        `${API_URL}/api/v1/admin/events/${eventId}/participants`,
        { headers: authHeaders() }
      );
      if (res.ok) {
        const d = await res.json();
        setParticipants(d.items || []);
      }
    } finally {
      setLoadingParts(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchEntities();
  }, [fetchEvents, fetchEntities]);

  useEffect(() => {
    if (selectedEventId) fetchParticipants(selectedEventId);
  }, [selectedEventId, fetchParticipants]);

  // ─── Form helpers ──────────────────────────────────────────────────────────

  const resetForm = () => {
    setTitle(""); setDescription(""); setLocation(""); setStartsAt(""); setEndsAt("");
    setEditItem(null); setFormError(null);
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (ev: EventItem) => {
    setTitle(ev.title);
    setDescription(ev.description || "");
    setLocation(ev.location || "");
    setStartsAt(toLocalDatetimeInput(ev.starts_at));
    setEndsAt(toLocalDatetimeInput(ev.ends_at));
    setEditItem(ev);
    setShowForm(true);
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setFormError("El título es obligatorio"); return; }
    if (!startsAt || !endsAt) { setFormError("Las fechas son obligatorias"); return; }
    setSaving(true); setFormError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        starts_at: toISOString(startsAt),
        ends_at: toISOString(endsAt),
      };
      let res: Response;
      if (editItem) {
        res = await fetch(`${API_URL}/api/v1/admin/events/${editItem.id}`, {
          method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_URL}/api/v1/admin/events`, {
          method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
        });
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Error"); }
      setSuccessMsg(editItem ? "Evento actualizado ✓" : "Evento creado ✓");
      setTimeout(() => setSuccessMsg(null), 3000);
      setShowForm(false); resetForm(); fetchEvents();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (ev: EventItem) => {
    await fetch(`${API_URL}/api/v1/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ is_active: !ev.is_active }),
    });
    fetchEvents();
  };

  const handleAddParticipant = async (entity: Entity) => {
    if (!selectedEventId) return;
    const res = await fetch(
      `${API_URL}/api/v1/admin/events/${selectedEventId}/participants`,
      { method: "POST", headers: authHeaders(), body: JSON.stringify({ entity_id: entity.id }) }
    );
    if (!res.ok) {
      const d = await res.json();
      alert(d.detail || "Error al agregar participante");
      return;
    }
    fetchParticipants(selectedEventId);
    fetchEvents();
  };

  const handleRemoveParticipant = async (entityId: string) => {
    if (!selectedEventId) return;
    await fetch(
      `${API_URL}/api/v1/admin/events/${selectedEventId}/participants/${entityId}`,
      { method: "DELETE", headers: authHeaders() }
    );
    fetchParticipants(selectedEventId);
    fetchEvents();
  };

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const participantIds = participants.map((p) => p.id);

  // ─── Styles ────────────────────────────────────────────────────────────────

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
    color: "#f5f5f5", fontSize: 12, outline: "none",
  };

  const labelStyle = {
    fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const,
    letterSpacing: "0.1em", display: "block", marginBottom: 6,
  };

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#00E5FF" }}>Eventos en Vivo</h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2, fontFamily: "monospace" }}>
            Gestión de eventos con participantes evaluables
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            padding: "8px 18px", borderRadius: 8, fontSize: 11, fontFamily: "monospace",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
            background: "rgba(0,229,255,0.1)", color: "#00E5FF",
            border: "1px solid rgba(0,229,255,0.22)", cursor: "pointer",
          }}
        >
          + Nuevo Evento
        </button>
      </div>

      {successMsg && (
        <div style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(57,255,20,0.08)", border: "1px solid rgba(57,255,20,0.2)", color: "#39FF14", fontSize: 12, fontFamily: "monospace" }}>
          {successMsg}
        </div>
      )}

      {/* ── Form ──────────────────────────────────────────────────────────── */}
      {showForm && (
        <div style={{ background: "rgba(14,14,14,0.98)", border: "1px solid rgba(0,229,255,0.15)", borderRadius: 16, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#00E5FF" }}>
              {editItem ? "Editar evento" : "Crear evento"}
            </h2>
            <button onClick={() => { setShowForm(false); resetForm(); }} style={{ color: "rgba(255,255,255,0.3)", background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Título *</label>
              <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ej: Festival de Viña del Mar 2026" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Descripción (opcional)</label>
              <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción del evento" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Lugar (opcional)</label>
              <input style={inputStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="ej: Viña del Mar, V Región" />
            </div>
            <div>
              <label style={labelStyle}>Fecha de inicio *</label>
              <input type="datetime-local" style={inputStyle} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Fecha de cierre *</label>
              <input type="datetime-local" style={inputStyle} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>

          {formError && (
            <p style={{ fontSize: 11, color: "#FF073A", fontFamily: "monospace", marginTop: 14 }}>✗ {formError}</p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowForm(false); resetForm(); }} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 11, background: "transparent", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={saving} style={{ padding: "8px 20px", borderRadius: 8, fontSize: 11, fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", background: "rgba(0,229,255,0.1)", color: "#00E5FF", border: "1px solid rgba(0,229,255,0.25)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Guardando…" : editItem ? "Actualizar" : "Crear evento"}
            </button>
          </div>
        </div>
      )}

      {/* ── Layout: Lista + Panel de participantes ────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: selectedEventId ? "1fr 1fr" : "1fr", gap: 16 }}>

        {/* Lista de eventos */}
        <div style={{ background: "rgba(14,14,14,0.9)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {events.length} evento{events.length !== 1 ? "s" : ""}
            </p>
          </div>

          {loadingEvents ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>Cargando…</p>
            </div>
          ) : events.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin eventos. Crea el primero.</p>
            </div>
          ) : (
            events.map((ev) => (
              <div
                key={ev.id}
                onClick={() => setSelectedEventId(ev.id === selectedEventId ? null : ev.id)}
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  opacity: ev.is_active ? 1 : 0.5,
                  cursor: "pointer",
                  background: ev.id === selectedEventId ? "rgba(0,229,255,0.06)" : "transparent",
                  borderLeft: ev.id === selectedEventId ? "3px solid #00E5FF" : "3px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5" }}>{ev.title}</span>
                      {ev.is_active ? (
                        <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(57,255,20,0.1)", color: "#39FF14", border: "1px solid rgba(57,255,20,0.2)", fontFamily: "monospace" }}>ACTIVO</span>
                      ) : (
                        <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "monospace" }}>INACTIVO</span>
                      )}
                    </div>
                    {ev.location && (
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>📍 {ev.location}</p>
                    )}
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
                      {formatDate(ev.starts_at)} → {formatDate(ev.ends_at)}
                      <span style={{ margin: "0 6px", color: "rgba(255,255,255,0.15)" }}>·</span>
                      <span style={{ color: "#00E5FF" }}>{ev.participant_count} participantes</span>
                      <span style={{ margin: "0 6px", color: "rgba(255,255,255,0.15)" }}>·</span>
                      <span style={{ color: "rgba(255,255,255,0.25)" }}>{ev.total_votes} votos</span>
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openEdit(ev)}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontFamily: "monospace", background: "rgba(0,229,255,0.07)", color: "#00E5FF", border: "1px solid rgba(0,229,255,0.15)", cursor: "pointer" }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggleActive(ev)}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontFamily: "monospace", background: ev.is_active ? "rgba(255,7,58,0.07)" : "rgba(57,255,20,0.07)", color: ev.is_active ? "#FF073A" : "#39FF14", border: `1px solid ${ev.is_active ? "rgba(255,7,58,0.15)" : "rgba(57,255,20,0.15)"}`, cursor: "pointer" }}
                    >
                      {ev.is_active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Panel de participantes */}
        {selectedEventId && selectedEvent && (
          <div style={{ background: "rgba(14,14,14,0.9)", border: "1px solid rgba(0,229,255,0.12)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#00E5FF", marginBottom: 1 }}>
                  ⚙️ {selectedEvent.title}
                </p>
                <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Participantes ({participants.length})
                </p>
              </div>
              <button
                onClick={() => setSelectedEventId(null)}
                style={{ color: "rgba(255,255,255,0.3)", background: "none", border: "none", fontSize: 16, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Current participants */}
            <div style={{ maxHeight: 280, overflowY: "auto", padding: "8px 0" }}>
              {loadingParts ? (
                <p style={{ padding: "16px 20px", fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>Cargando…</p>
              ) : participants.length === 0 ? (
                <p style={{ padding: "16px 20px", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Sin participantes aún.</p>
              ) : (
                participants.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 16px",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: "#f5f5f5", margin: 0, fontWeight: 500 }}>
                        {p.first_name} {p.last_name}
                      </p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, textTransform: "capitalize" }}>
                        {CATEGORY_LABELS[p.category] || p.category}
                      </p>
                    </div>
                    <div style={{ textAlign: "center", minWidth: 44 }}>
                      <p style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700, color: scoreColor(p.event_score_avg), margin: 0 }}>
                        {p.event_score_avg !== null ? p.event_score_avg.toFixed(1) : "—"}
                      </p>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", margin: 0 }}>{p.event_vote_count}v</p>
                    </div>
                    <button
                      onClick={() => handleRemoveParticipant(p.id)}
                      style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontFamily: "monospace", background: "rgba(255,7,58,0.07)", color: "#FF073A", border: "1px solid rgba(255,7,58,0.12)", cursor: "pointer", flexShrink: 0 }}
                    >
                      Quitar
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add participant */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                Agregar participante
              </p>
              <EntitySearchSelector
                entities={entities}
                onSelect={handleAddParticipant}
                excludeIds={participantIds}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
