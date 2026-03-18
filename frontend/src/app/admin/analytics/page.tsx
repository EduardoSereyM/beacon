/**
 * BEACON PROTOCOL — Admin Analytics (Votos por usuario)
 * =======================================================
 * Muestra ranking de usuarios por cantidad de votos en encuestas,
 * filtrable por período de tiempo.
 */

"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface VoterRow {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  rank: string;
  reputation_score: number;
  votes_count: number;
  polls_count: number;
  last_vote_at: string | null;
}

function getToken() { return localStorage.getItem("beacon_token") || ""; }
function handle401() {
  localStorage.removeItem("beacon_token"); localStorage.removeItem("beacon_user");
  window.dispatchEvent(new CustomEvent("beacon:session-expired"));
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toLocalDateInput(d: Date) {
  return d.toISOString().slice(0, 16);
}

const RANK_COLOR: Record<string, string> = {
  VERIFIED: "#00E5FF",
  BASIC: "rgba(255,255,255,0.5)",
  DISPLACED: "#FF073A",
};

export default function AdminAnalyticsPage() {
  const [items, setItems] = useState<VoterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Período — por defecto últimos 30 días
  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [fromDate, setFromDate] = useState(toLocalDateInput(thirtyAgo));
  const [toDate, setToDate] = useState(toLocalDateInput(now));

  const fetchAnalytics = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from_date", new Date(fromDate).toISOString());
      if (toDate)   params.set("to_date",   new Date(toDate).toISOString());
      const res = await fetch(`${API_URL}/api/v1/admin/polls/analytics/voters?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { handle401(); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar analytics");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const labelStyle: React.CSSProperties = {
    fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase",
    letterSpacing: "0.1em", display: "block", marginBottom: 5,
  };
  const inputStyle: React.CSSProperties = {
    padding: "8px 11px", borderRadius: 7,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
    color: "#f5f5f5", fontSize: 12, outline: "none",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#00E5FF" }}>Analytics · Votos</h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2, fontFamily: "monospace" }}>
            Participación de usuarios en encuestas por período
          </p>
        </div>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.07)" }}>
          {total} usuario{total !== 1 ? "s" : ""} activos
        </span>
      </div>

      {/* Filtros período */}
      <div style={{ background: "rgba(14,14,14,0.9)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, alignItems: "flex-end" }}>
          <div>
            <label style={labelStyle}>Desde</label>
            <input type="datetime-local" style={inputStyle} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Hasta</label>
            <input type="datetime-local" style={inputStyle} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "7d",  days: 7  },
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
            ].map(({ label, days }) => (
              <button
                key={label}
                onClick={() => {
                  const t = new Date();
                  setToDate(toLocalDateInput(t));
                  setFromDate(toLocalDateInput(new Date(t.getTime() - days * 86400000)));
                }}
                style={{ padding: "8px 14px", borderRadius: 7, fontSize: 11, fontFamily: "monospace", background: "rgba(0,229,255,0.06)", color: "#00E5FF", border: "1px solid rgba(0,229,255,0.15)", cursor: "pointer" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background: "rgba(14,14,14,0.9)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }} className="animate-pulse">Cargando…</p>
          </div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "#FF073A" }}>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <p style={{ fontSize: 28, marginBottom: 10 }}>📊</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin votos en el período seleccionado</p>
          </div>
        ) : (
          <>
            {/* Header tabla — solo desktop */}
            <div className="hidden sm:grid" style={{ gridTemplateColumns: "2fr 1fr 80px 80px 80px 160px", padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Usuario", "Rank / Score", "Votos", "Encuestas", "Pos.", "Último voto"].map((h) => (
                <span key={h} style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{h}</span>
              ))}
            </div>

            {items.map((row, idx) => (
              <div
                key={row.user_id}
                style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: row.rank === "DISPLACED" ? 0.4 : 1 }}
              >
                {/* Mobile: stacked */}
                <div className="flex flex-col sm:grid gap-2" style={{ gridTemplateColumns: "2fr 1fr 80px 80px 80px 160px", alignItems: "center" }}>
                  {/* Usuario */}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.first_name || row.last_name ? `${row.first_name} ${row.last_name}`.trim() : "—"}
                    </p>
                    <p style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.email}</p>
                  </div>
                  {/* Rank + Score */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, fontFamily: "monospace", color: RANK_COLOR[row.rank] || "#fff", border: `1px solid ${RANK_COLOR[row.rank] || "#fff"}30`, background: `${RANK_COLOR[row.rank] || "#fff"}10` }}>
                      {row.rank}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
                      {(row.reputation_score * 100).toFixed(0)}
                    </span>
                  </div>
                  {/* Votos */}
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#00E5FF", fontFamily: "monospace" }}>
                    {row.votes_count}
                  </span>
                  {/* Encuestas */}
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
                    {row.polls_count}
                  </span>
                  {/* Posición */}
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: idx < 3 ? "#D4AF37" : "rgba(255,255,255,0.25)" }}>
                    #{idx + 1}
                  </span>
                  {/* Último voto */}
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
                    {formatDate(row.last_vote_at)}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
