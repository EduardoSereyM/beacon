/**
 * SegmentStrip — resultados de una edición por segmento (sexo, edad, zona)
 * ==========================================================================
 * Presentacional y sin estado. Una columna por grupo con una barra por opción (o una sola barra en
 * escalas). Un grupo con menos respuestas que el mínimo no dibuja barras: muestra «n < mínimo» y su n.
 */

import { lineColor } from "@/components/series/TrendChart";
import type { SegmentChart } from "@/lib/series";

const WIDTH = 800;
const HEIGHT = 300;
const MARGIN = { top: 34, right: 12, bottom: 58, left: 36 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const format = (value: number) => value.toLocaleString("es-CL", { maximumFractionDigits: 1 });

interface Props {
  chart: SegmentChart;
  minN: number;
}

export default function SegmentStrip({ chart, minN }: Props) {
  const { columns, domain, unit, seriesLabels } = chart;
  const [low, high] = domain;
  const colW = PLOT_W / columns.length;
  const barsPerColumn = seriesLabels.length;
  const barW = Math.min(26, (colW * 0.7) / barsPerColumn);
  const y = (v: number) => MARGIN.top + PLOT_H - ((v - low) / (high - low)) * PLOT_H;
  const step = unit === "%" ? 20 : 1;
  const ticks: number[] = [];
  for (let t = low; t <= high + 1e-9; t += step) ticks.push(t);

  // Encabezados de cada variable (Sexo, Edad, Zona…) sobre sus columnas.
  const headings: { label: string; from: number; to: number }[] = [];
  columns.forEach((column, i) => {
    const last = headings[headings.length - 1];
    if (last && last.label === column.variableLabel) last.to = i;
    else headings.push({ label: column.variableLabel, from: i, to: i });
  });

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Resultados por segmento. Los datos están en la tabla debajo del gráfico."
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,0.07)" />
          <text x={MARGIN.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.45)">
            {format(tick)}
          </text>
        </g>
      ))}

      {headings.map((heading, index) => {
        const x1 = MARGIN.left + heading.from * colW;
        const x2 = MARGIN.left + (heading.to + 1) * colW;
        return (
          <g key={heading.label}>
            {index > 0 && <line x1={x1} x2={x1} y1={MARGIN.top - 8} y2={HEIGHT - MARGIN.bottom + 28} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />}
            <text x={(x1 + x2) / 2} y={MARGIN.top - 14} textAnchor="middle" fontSize={11} fontWeight={700} fill="rgba(255,255,255,0.65)">
              {heading.label}
            </text>
          </g>
        );
      })}

      {columns.map((column, i) => {
        const center = MARGIN.left + (i + 0.5) * colW;
        return (
          <g key={`${column.variable}-${column.label}`}>
            {column.suppressed ? (
              <g>
                <title>{`${column.label}: n insuficiente (n=${column.n}; mínimo ${minN})`}</title>
                <text x={center} y={y(low) - 10} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.4)">n &lt; {minN}</text>
              </g>
            ) : (
              column.values.map((value, k) =>
                value === null ? null : (
                  <g key={seriesLabels[k]}>
                    <title>{`${column.label} — ${seriesLabels[k]}: ${format(value)}${unit === "%" ? "%" : ""} (n=${column.n})`}</title>
                    <rect
                      x={center - (barsPerColumn * barW) / 2 + k * barW + 1}
                      y={y(value)}
                      width={barW - 2}
                      height={Math.max(0, y(low) - y(value))}
                      rx={2}
                      fill={lineColor(false, k)}
                    />
                    <text x={center - (barsPerColumn * barW) / 2 + k * barW + barW / 2} y={y(value) - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#f5f5f5">
                      {format(value)}
                    </text>
                  </g>
                ),
              )
            )}
            <text x={center} y={HEIGHT - MARGIN.bottom + 16} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.8)">{column.label}</text>
            <text x={center} y={HEIGHT - MARGIN.bottom + 30} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.4)">n={column.n}</text>
          </g>
        );
      })}
    </svg>
  );
}
