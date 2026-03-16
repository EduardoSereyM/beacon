/**
 * BEACON PROTOCOL — Admin Versus (CRUD)
 * ======================================
 * Crear, listar, editar y desactivar enfrentamientos VS.
 * Incluye selector de entidades con búsqueda en tiempo real.
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

interface VersusItem {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  affects_reputation: boolean;
  entity_a: Entity;
  entity_b: Entity;
  votes_a: number;
  votes_b: number;
  total_votes: number;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── EntitySelector ───────────────────────────────────────────────────────────

function EntitySelector({
  label,
  value,
  excluded,
  entities,
  onChange,
}: {
  label: string;
  value: string;
  excluded: string;
  entities: Entity[];
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = entities.filter(
    (e) =>
      e.id !== excluded &&
      `${e.first_name} ${e.last_name} ${e.category}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  const selected = entities.find((e) => e.id === value);

  return (
    <div style={{ position: "relative" }}>
      <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          padding: "9px 12px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: selected ? "#f5f5f5" : "rgba(255,255,255,0.3)",
          fontSize: 12,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {selected
          ? `${selected.first_name} ${selected.last_name} · ${selected.category}`
          : "— Seleccionar entidad —"}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#111",
            border: "1px solid rgba(212,175,55,0.2)",
            borderRadius: 10,
            marginTop: 4,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 8 }}>
            <input
              autoFocus
              placeholder="Buscar por nombre o categoría…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#f5f5f5",
                fontSize: 12,
                outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <p style={{ padding: "12px 16px", fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
                Sin resultados
              </p>
            ) : (
              filtered.slice(0, 50).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    onChange(e.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 14px",
                    background: e.id === value ? "rgba(212,175,55,0.1)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <p style={{ fontSize: 12, color: "#f5f5f5", margin: 0 }}>
                      {e.first_name} {e.last_name}
                    </p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0, textTransform: "capitalize" }}>
                      {e.category} · {e.reputation_score.toFixed(2)} ★
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function AdminVersusPage() {
  const [items, setItems] = useState<VersusItem[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<VersusItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entityAId, setEntityAId] = useState("");
  const [entityBId, setEntityBId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [affectsReputation, setAffectsReputation] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoadingList(true);
    try {
      const [vsRes, entRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/admin/versus`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/v1/entities?limit=500`, { headers: authHeaders() }),
      ]);
      if (vsRes.ok) {
        const d = await vsRes.json();
        setItems(d.items || []);
      }
      if (entRes.ok) {
        const d = await entRes.json();
        setEntities(d.items || []);
      }
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setEntityAId("");
    setEntityBId("");
    setStartsAt("");
    setEndsAt("");
    setAffectsReputation(false);
    setEditItem(null);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (vs: VersusItem) => {
    setTitle(vs.title);
    setDescription(vs.description || "");
    setEntityAId(vs.entity_a.id);
    setEntityBId(vs.entity_b.id);
    setStartsAt(toLocalDatetimeInput(vs.starts_at));
    setEndsAt(toLocalDatetimeInput(vs.ends_at));
    setAffectsReputation(vs.affects_reputation);
    setEditItem(vs);
    setShowForm(true);
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setFormError("El título es obligatorio"); return; }
    if (!entityAId || !entityBId) { setFormError("Debes seleccionar ambas entidades"); return; }
    if (entityAId === entityBId) { setFormError("Las entidades A y B deben ser distintas"); return; }
    if (!startsAt || !endsAt) { setFormError("Las fechas son obligatorias"); return; }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        entity_a_id: entityAId,
        entity_b_id: entityBId,
        starts_at: toISOString(startsAt),
        ends_at: toISOString(endsAt),
        affects_reputation: affectsReputation,
      };

      let res: Response;
      if (editItem) {
        res = await fetch(`${API_URL}/api/v1/admin/versus/${editItem.id}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({
            title: payload.title,
            description: payload.description,
            starts_at: payload.starts_at,
            ends_at: payload.ends_at,
            affects_reputation: payload.affects_reputation,
          }),
        });
      } else {
        res = await fetch(`${API_URL}/api/v1/admin/versus`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Error al guardar");
      }

      setSuccessMsg(editItem ? "VS actualizado ✓" : "VS creado ✓");
      setTimeout(() => setSuccessMsg(null), 3000);
      setShowForm(false);
      resetForm();
      fetchAll();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (vs: VersusItem) => {
    try {
      await fetch(`${API_URL}/api/v1/admin/versus/${vs.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ is_active: !vs.is_active }),
      });
      fetchAll();
    } catch {
      alert("Error al actualizar estado");
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#f5f5f5",
    fontSize: 12,
    outline: "none",
  };

  const labelStyle = {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    display: "block",
    marginBottom: 6,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#D4AF37" }}>Arena VS</h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2, fontFamily: "monospace" }}>
            Gestión de enfrentamientos directos entre entidades
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "monospace",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            background: "rgba(212,175,55,0.12)",
            color: "#D4AF37",
            border: "1px solid rgba(212,175,55,0.25)",
            cursor: "pointer",
          }}
        >
          + Nuevo VS
        </button>
      </div>

      {successMsg && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "rgba(57,255,20,0.08)",
            border: "1px solid rgba(57,255,20,0.2)",
            color: "#39FF14",
            fontSize: 12,
            fontFamily: "monospace",
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div
          style={{
            background: "rgba(14,14,14,0.98)",
            border: "1px solid rgba(212,175,55,0.2)",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#D4AF37" }}>
              {editItem ? "Editar VS" : "Crear nuevo VS"}
            </h2>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              style={{ color: "rgba(255,255,255,0.3)", background: "none", border: "none", fontSize: 18, cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Title */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Título *</label>
              <input
                style={inputStyle}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ej: Boric vs. Piñera — Gestión Económica"
              />
            </div>

            {/* Description */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Descripción (opcional)</label>
              <input
                style={inputStyle}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contexto del enfrentamiento"
              />
            </div>

            {/* Entity A */}
            {!editItem && (
              <EntitySelector
                label="Entidad A (Oro) *"
                value={entityAId}
                excluded={entityBId}
                entities={entities}
                onChange={setEntityAId}
              />
            )}

            {/* Entity B */}
            {!editItem && (
              <EntitySelector
                label="Entidad B (Púrpura) *"
                value={entityBId}
                excluded={entityAId}
                entities={entities}
                onChange={setEntityBId}
              />
            )}

            {/* Dates */}
            <div>
              <label style={labelStyle}>Inicio *</label>
              <input
                type="datetime-local"
                style={inputStyle}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Cierre *</label>
              <input
                type="datetime-local"
                style={inputStyle}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>

            {/* Affects reputation */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div
                  onClick={() => setAffectsReputation(!affectsReputation)}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    background: affectsReputation ? "#D4AF37" : "rgba(255,255,255,0.1)",
                    position: "relative",
                    transition: "background 0.2s",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      left: affectsReputation ? 18 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "#fff",
                      transition: "left 0.2s",
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: affectsReputation ? "#D4AF37" : "rgba(255,255,255,0.5)" }}>
                  ⚖️ Afecta reputation_score de la entidad ganadora
                </span>
              </label>
            </div>
          </div>

          {formError && (
            <p style={{ fontSize: 11, color: "#FF073A", fontFamily: "monospace", marginTop: 14 }}>
              ✗ {formError}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 11,
                background: "transparent",
                color: "rgba(255,255,255,0.4)",
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: "monospace",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: "rgba(212,175,55,0.15)",
                color: "#D4AF37",
                border: "1px solid rgba(212,175,55,0.3)",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Guardando…" : editItem ? "Actualizar" : "Crear VS"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div
        style={{
          background: "rgba(14,14,14,0.9)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {items.length} enfrentamiento{items.length !== 1 ? "s" : ""}
          </p>
        </div>

        {loadingList ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
              Cargando…
            </p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
              Sin enfrentamientos. Crea el primero.
            </p>
          </div>
        ) : (
          <div>
            {items.map((vs) => (
              <div
                key={vs.id}
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  opacity: vs.is_active ? 1 : 0.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5" }}>
                        {vs.title}
                      </span>
                      {vs.is_active ? (
                        <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(57,255,20,0.1)", color: "#39FF14", border: "1px solid rgba(57,255,20,0.2)", fontFamily: "monospace" }}>
                          ACTIVO
                        </span>
                      ) : (
                        <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 20, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "monospace" }}>
                          INACTIVO
                        </span>
                      )}
                      {vs.affects_reputation && (
                        <span style={{ fontSize: 9, color: "#D4AF37", fontFamily: "monospace" }}>⚖️</span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
                      {vs.entity_a.first_name} {vs.entity_a.last_name}
                      <span style={{ color: "#D4AF37", margin: "0 6px" }}>vs</span>
                      {vs.entity_b.first_name} {vs.entity_b.last_name}
                      <span style={{ margin: "0 8px", color: "rgba(255,255,255,0.2)" }}>·</span>
                      {formatDate(vs.starts_at)} → {formatDate(vs.ends_at)}
                      <span style={{ margin: "0 8px", color: "rgba(255,255,255,0.2)" }}>·</span>
                      <span style={{ color: "#00E5FF" }}>{vs.total_votes} votos</span>
                      {vs.total_votes > 0 && (
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>
                          {" "}({vs.votes_a}A · {vs.votes_b}B)
                        </span>
                      )}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => openEdit(vs)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontFamily: "monospace",
                        background: "rgba(0,229,255,0.07)",
                        color: "#00E5FF",
                        border: "1px solid rgba(0,229,255,0.15)",
                        cursor: "pointer",
                      }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggleActive(vs)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontFamily: "monospace",
                        background: vs.is_active ? "rgba(255,7,58,0.07)" : "rgba(57,255,20,0.07)",
                        color: vs.is_active ? "#FF073A" : "#39FF14",
                        border: `1px solid ${vs.is_active ? "rgba(255,7,58,0.15)" : "rgba(57,255,20,0.15)"}`,
                        cursor: "pointer",
                      }}
                    >
                      {vs.is_active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
