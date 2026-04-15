/**
 * BEACON CHILE — /api/og/resultado/[slug]
 * =========================================
 * Genera imagen cuadrada 1080x1080 con los resultados de una encuesta.
 * Usada para compartir en Instagram, TikTok y descarga directa.
 *
 * Diseño:
 *   - Header: BEACON CHILE + pregunta
 *   - Barras horizontales por opción (top 5, ordenadas por pct desc)
 *   - Footer: N ciudadanos + beaconchile.cl
 *
 * ?download=1 → agrega Content-Disposition: attachment para forzar descarga.
 * Cache: no-store en dev, s-maxage=1800 en producción.
 */

import { ImageResponse } from "next/og";

export const runtime = "edge";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://beacon-f477.onrender.com";

interface PollResult {
  option?: string;
  pct?: number;
  count?: number;
  average?: number; // encuestas tipo scale
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const isDownload = new URL(req.url).searchParams.get("download") === "1";

  let title = "Encuesta Ciudadana";
  let votes = 0;
  let results: PollResult[] = [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_URL}/api/v1/polls/by-slug/${slug}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const poll = await res.json();
      title   = poll.title        ?? title;
      votes   = poll.total_votes  ?? 0;
      results = poll.results      ?? [];
    }
  } catch {
    // cold start — usa defaults
  }

  // Detectar si es encuesta de escala (backend devuelve [{average, count}] sin campo option)
  const isScale = results.length > 0 && results[0].average !== undefined && !results[0].option;
  const scaleAvg: number = isScale ? (results[0].average ?? 0) : 0;

  // Tomar top 5 por pct, descartar opciones sin nombre (multiple_choice / ranking)
  const top = [...results]
    .filter((r) => r.option)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .slice(0, 5);

  const hasResults = (top.length > 0 || isScale) && votes > 0;

  // Fuente adaptativa para el título
  const titleSize = title.length > 80 ? 28 : title.length > 50 ? 33 : 38;

  const voteLabel =
    votes === 0
      ? "Aún no hay votos"
      : votes === 1
      ? "1 ciudadano opinó"
      : `${votes.toLocaleString("es-CL")} ciudadanos opinaron`;

  // Color de barra por posición
  const barColors = [
    "#00E5FF",                    // 1° — cian puro
    "rgba(0,229,255,0.70)",       // 2°
    "rgba(0,229,255,0.48)",       // 3°
    "rgba(0,229,255,0.32)",       // 4°
    "rgba(0,229,255,0.22)",       // 5°
  ];

  const response = new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1080,
          background: "linear-gradient(160deg, #07071a 0%, #0a0a14 45%, #060610 100%)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Destello cian superior */}
        <div style={{ position: "absolute", top: -60, left: -60, width: 320, height: 320, borderRadius: "50%", background: "rgba(0,229,255,0.06)" }} />
        {/* Destello dorado inferior */}
        <div style={{ position: "absolute", bottom: -80, right: -60, width: 300, height: 300, borderRadius: "50%", background: "rgba(212,175,55,0.05)" }} />

        {/* Borde cian superior */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #00E5FF 0%, #00E5FFaa 50%, transparent 100%)" }} />

        {/* ── Header ── */}
        <div style={{ display: "flex", flexDirection: "column", padding: "56px 64px 32px", gap: 16 }}>
          {/* Marca */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#00E5FF", fontSize: 13, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase" }}>
              BEACON CHILE
            </span>
            <span style={{ color: "rgba(0,229,255,0.3)", fontSize: 13 }}>·</span>
            <span style={{ color: "rgba(0,229,255,0.5)", fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              RESULTADOS VERIFICADOS
            </span>
          </div>

          {/* Línea divisora */}
          <div style={{ height: 1, background: "rgba(0,229,255,0.12)" }} />

          {/* Pregunta */}
          <p style={{ color: "#ffffff", fontSize: titleSize, fontWeight: 800, lineHeight: 1.3, margin: 0 }}>
            {title}
          </p>
        </div>

        {/* ── Barras de resultado ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 64px", gap: 20 }}>
          {hasResults && isScale ? (
            /* Encuesta de escala — mostrar promedio grande */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ color: "#00E5FF", fontSize: 120, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.04em" }}>
                  {scaleAvg.toFixed(1)}
                </span>
                <span style={{ color: "rgba(0,229,255,0.5)", fontSize: 32, fontWeight: 600 }}>/10</span>
              </div>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 15, fontFamily: "monospace", margin: 0, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                PROMEDIO CIUDADANO
              </p>
              {/* Barra de progreso */}
              <div style={{ width: "100%", height: 10, background: "rgba(255,255,255,0.07)", borderRadius: 5, display: "flex" }}>
                <div style={{ width: `${Math.min((scaleAvg / 10) * 100, 100)}%`, height: "100%", background: "linear-gradient(90deg, #00E5FF, rgba(0,229,255,0.5))", borderRadius: 5 }} />
              </div>
            </div>
          ) : hasResults ? (
            top.map((r, i) => {
              const pct  = Math.round(r.pct ?? 0);
              const fill = Math.max(pct, 2); // mínimo visual de 2%
              const label = (r.option ?? "").length > 36
                ? (r.option ?? "").slice(0, 34) + "…"
                : r.option ?? "";

              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Label + porcentaje */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <span style={{ color: i === 0 ? "#ffffff" : "rgba(255,255,255,0.65)", fontSize: 16, fontWeight: i === 0 ? 700 : 400 }}>
                      {label}
                    </span>
                    <span style={{ color: barColors[i], fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
                      {pct}%
                    </span>
                  </div>

                  {/* Barra */}
                  <div style={{ height: 12, background: "rgba(255,255,255,0.07)", borderRadius: 6, display: "flex" }}>
                    <div
                      style={{
                        width: `${fill}%`,
                        height: "100%",
                        background: barColors[i],
                        borderRadius: 6,
                      }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            /* Sin resultados */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 0" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                📊
              </div>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontFamily: "monospace", margin: 0, letterSpacing: "0.06em" }}>
                AÚN NO HAY VOTOS SUFICIENTES
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: "24px 64px 52px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 15 }}>
              {voteLabel}
            </span>
            <span style={{ color: "#D4AF37", fontSize: 15, fontWeight: 700, letterSpacing: "0.06em" }}>
              beaconchile.cl
            </span>
          </div>
        </div>

        {/* Borde dorado inferior */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent 0%, #D4AF37aa 50%, #D4AF37 100%)" }} />
      </div>
    ),
    { width: 1080, height: 1080 }
  );

  if (isDownload) {
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="beacon-resultado-${slug}.png"`
    );
  }

  response.headers.set(
    "Cache-Control",
    process.env.NODE_ENV === "development"
      ? "no-store"
      : "s-maxage=1800, stale-while-revalidate=86400"
  );

  return response;
}
