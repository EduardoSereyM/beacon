/**
 * AgendaView — ranking de una serie «agenda» (las opciones cambian cada edición)
 * ================================================================================
 * Una serie agenda no se compara opción por opción: cada edición muestra su propio ranking. Presentacional
 * y sin estado. Un grupo con menos respuestas que el mínimo no muestra resultados.
 */

import type { Group, TrendPoint } from "@/lib/series";

const FIXED_OPTION = /^(otra|no sabe|no responde)/i;

interface Props {
  points: TrendPoint[];
  group: Group;
  minN: number;
  /** Cuántas ediciones mostrar (las más recientes primero). */
  limit?: number;
}

export default function AgendaView({ points, group, minN, limit = 6 }: Props) {
  const editions = [...points].reverse().slice(0, limit);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {editions.map((point) => {
        const question = point.questions[0];
        const result = question?.[group];
        const rows = result && !result.suppressed && result.results ? result.results : null;
        const ranked = rows
          ? [...rows.filter((r) => !FIXED_OPTION.test(r.option))].sort((a, b) => b.pct - a.pct)
          : [];
        const fixed = rows ? rows.filter((r) => FIXED_OPTION.test(r.option)) : [];
        const top = Math.max(1, ...ranked.map((r) => r.pct));
        return (
          <article key={point.edition} aria-label={point.label}>
            <h3 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 6px", display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              {point.label}
              {point.is_open && <span style={{ fontSize: 11, color: "#39FF14", fontWeight: 700 }}>en curso</span>}
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 400 }}>
                n = {(result?.n ?? 0).toLocaleString("es-CL")}
              </span>
            </h3>
            {rows ? (
              <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {ranked.map((row, index) => (
                  <li key={row.option}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, marginBottom: 2 }}>
                      <span>{row.option}</span>
                      <strong>{row.pct.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%</strong>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.07)" }}>
                      <div
                        style={{ width: `${Math.max(2, (row.pct / top) * 100)}%`, height: "100%", borderRadius: 4, background: index === 0 ? "#00E5FF" : "rgba(0,229,255,0.45)" }}
                      />
                    </div>
                  </li>
                ))}
                {fixed.length > 0 && (
                  <li style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    {fixed.map((r) => `${r.option}: ${r.pct.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`).join(" · ")}
                  </li>
                )}
              </ol>
            ) : (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>
                {(result?.n ?? 0) === 0 ? "Aún sin respuestas." : `n insuficiente: se publica con al menos ${minN} respuestas.`}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
