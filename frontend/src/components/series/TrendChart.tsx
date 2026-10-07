/**
 * TrendChart — gráfico de tendencia de una serie (SVG propio, sin dependencias)
 * ==============================================================================
 * Presentacional y sin estado. Dibuja una línea por opción (o el promedio de una
 * escala), eventos anotados numerados y cortes donde no hay datos comparables:
 *  - n insuficiente  → hueco en la línea y marca gris sobre el eje.
 *  - cambio de versión de plantilla → línea de corte punteada.
 */

import {
  eventPointIndex,
  lineSegments,
  type ChartData,
  type TrendEvent,
  type TrendPoint,
} from "@/lib/series";

const WIDTH = 800;
const HEIGHT = 340;
const MARGIN = { top: 28, right: 20, bottom: 46, left: 46 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

// Paleta Beacon Sovereign: cian, rojo, neón, oro, púrpura. "No sabe / No responde" va en plata, punteado.
const COLORS = ["#00E5FF", "#FF073A", "#39FF14", "#D4AF37", "#8A2BE2"];
const MUTED = "#C0C0C0";

/** Color de una línea: la leyenda y el gráfico lo comparten. */
export const lineColor = (muted: boolean, index: number) => (muted ? MUTED : COLORS[index % COLORS.length]);

const formatValue = (value: number, unit: ChartData["unit"]) =>
  `${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })}${unit === "%" ? "%" : ""}`;

interface Props {
  points: TrendPoint[];
  chart: ChartData;
  events: TrendEvent[];
  cadence: "monthly" | "weekly";
}

export default function TrendChart({ points, chart, events, cadence }: Props) {
  const count = points.length;
  const [low, high] = chart.domain;
  const x = (i: number) => MARGIN.left + (count === 1 ? PLOT_W / 2 : (i * PLOT_W) / (count - 1));
  const y = (v: number) => MARGIN.top + PLOT_H - ((v - low) / (high - low)) * PLOT_H;

  const hasData = chart.lines.some((line) => line.values.some((v) => v !== null));
  const labelEvery = Math.max(1, Math.ceil(count / 8));
  const step = chart.unit === "%" ? 10 : 1;
  const ticks: number[] = [];
  for (let t = low; t <= high + 1e-9; t += step) ticks.push(t);

  const shortLabel = (p: TrendPoint) => {
    if (cadence === "weekly") return `S${p.edition.split("-W")[1]}`;
    const [year, month] = p.edition.split("-");
    return `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(month) - 1]} ${year.slice(2)}`;
  };

  const plottedEvents = events
    .map((event, number) => ({ ...event, number: number + 1, index: eventPointIndex(points, event.date) }))
    .filter((event): event is typeof event & { index: number } => event.index !== null);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Tendencia: ${chart.question.text}. Los datos están en la tabla debajo del gráfico.`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* Rejilla y eje Y */}
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke="rgba(255,255,255,0.07)" />
          <text x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} fill="rgba(255,255,255,0.45)">
            {formatValue(tick, chart.unit)}
          </text>
        </g>
      ))}

      {/* Eje X */}
      {points.map((p, i) =>
        i % labelEvery === 0 || i === count - 1 ? (
          <text key={p.edition} x={x(i)} y={HEIGHT - MARGIN.bottom + 18} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.45)">
            {shortLabel(p)}
          </text>
        ) : null,
      )}

      {/* Cortes por cambio de versión de la plantilla */}
      {chart.versionBreaks.map((i) => {
        const cut = count === 1 ? x(i) : (x(i) + x(i - 1)) / 2;
        return (
          <g key={`v${i}`}>
            <line x1={cut} x2={cut} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} stroke="#D4AF37" strokeDasharray="4 4" opacity={0.6} />
            <text x={cut + 4} y={MARGIN.top + 10} fontSize={10} fill="#D4AF37">
              pregunta modificada
            </text>
          </g>
        );
      })}

      {/* Eventos anotados (numerados; el detalle va en la lista bajo el gráfico) */}
      {plottedEvents.map((event) => (
        <g key={`e${event.number}-${event.date}`}>
          <title>{`${event.label} (${event.date})`}</title>
          <line x1={x(event.index)} x2={x(event.index)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} stroke="rgba(255,255,255,0.28)" strokeDasharray="2 4" />
          <circle cx={x(event.index)} cy={MARGIN.top - 12} r={9} fill="#0A0A0A" stroke="rgba(255,255,255,0.55)" />
          <text x={x(event.index)} y={MARGIN.top - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="#f5f5f5">
            {event.number}
          </text>
        </g>
      ))}

      {/* Marcas de n insuficiente sobre el eje */}
      {points.map((p, i) =>
        chart.ns[i] !== null && chart.lines.every((line) => line.values[i] === null) ? (
          <g key={`n${p.edition}`}>
            <title>{`${p.label}: ${chart.holeReason} (n=${chart.ns[i]})`}</title>
            <circle cx={x(i)} cy={HEIGHT - MARGIN.bottom} r={3.5} fill="none" stroke={MUTED} opacity={0.7} />
          </g>
        ) : null,
      )}

      {/* Líneas */}
      {chart.lines.map((line, lineIndex) => {
        const color = lineColor(line.muted, lineIndex);
        return (
          <g key={line.key}>
            {lineSegments(line.values, chart.versionBreaks).map((segment) =>
              segment.length > 1 ? (
                <polyline
                  key={segment[0].i}
                  points={segment.map(({ i, v }) => `${x(i)},${y(v)}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={line.muted ? 1.5 : 2.5}
                  strokeDasharray={line.muted ? "5 4" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            )}
            {line.values.map((value, i) =>
              value === null ? null : (
                <circle key={points[i].edition} cx={x(i)} cy={y(value)} r={line.muted ? 3 : 4} fill={color}>
                  <title>{`${points[i].label} — ${line.label}: ${formatValue(value, chart.unit)} (n=${chart.ns[i]})`}</title>
                </circle>
              ),
            )}
          </g>
        );
      })}

      {!hasData && (
        <text x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle" fontSize={14} fill="rgba(255,255,255,0.5)">
          Aún no hay suficientes respuestas para mostrar resultados
        </text>
      )}
    </svg>
  );
}
