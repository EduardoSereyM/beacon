/**
 * BEACON CHILE — /api/og/serie/[slug]
 * =====================================
 * Imagen para compartir una serie: titular descriptivo de la última edición con sus valores y los de la
 * anterior. ?format=wide → 1200x630 (vista previa de enlaces); por defecto 1080x1080 (redes);
 * ?download=1 fuerza la descarga. Sin adjetivos ni afirmaciones de cambio: ver lib/seriesReport.ts.
 */

import { ImageResponse } from "next/og";
import { seriesHeadline } from "@/lib/seriesReport";
import type { SeriesTrend } from "@/lib/series";

export const runtime = "edge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://beacon-f477.onrender.com";

async function loadTrend(slug: string): Promise<SeriesTrend | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_URL}/api/v1/series/${encodeURIComponent(slug)}/trend`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? ((await res.json()) as SeriesTrend) : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const wide = url.searchParams.get("format") === "wide";
  const download = url.searchParams.get("download") === "1";
  const [width, height] = wide ? [1200, 630] : [1080, 1080];

  const trend = await loadTrend(slug);
  const title = trend?.series.title ?? "Serie de opinión";
  const headline = trend ? seriesHeadline(trend) : null;
  const pad = wide ? 56 : 64;
  // «Serie · Semana 42: Aprueba 38%, Desaprueba 54%» → una línea por valor.
  const values = headline?.available ? headline.text.split(": ").slice(1).join(": ").split(", ") : [];

  const response = new ImageResponse(
    (
      <div
        style={{
          width, height, display: "flex", flexDirection: "column", fontFamily: "sans-serif", position: "relative",
          background: "linear-gradient(160deg, #07071a 0%, #0a0a14 45%, #060610 100%)",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #00E5FF 0%, #00E5FFaa 50%, transparent 100%)" }} />

        <div style={{ display: "flex", flexDirection: "column", padding: `${pad}px ${pad}px 0`, gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#00E5FF", fontSize: 14, fontWeight: 700, letterSpacing: "0.22em" }}>BEACON CHILE</span>
            <span style={{ color: "rgba(0,229,255,0.3)", fontSize: 14 }}>·</span>
            <span style={{ color: "rgba(0,229,255,0.5)", fontSize: 13, letterSpacing: "0.16em" }}>
              {trend?.series.cadence === "weekly" ? "SERIE SEMANAL" : "SERIE MENSUAL"}
            </span>
          </div>
          <div style={{ height: 1, background: "rgba(0,229,255,0.12)" }} />
          <div style={{ display: "flex", color: "#ffffff", fontSize: wide ? 44 : 54, fontWeight: 900, lineHeight: 1.15 }}>{title}</div>
          {headline?.edition_label && (
            <div style={{ display: "flex", color: "#D4AF37", fontSize: wide ? 24 : 28, fontWeight: 700 }}>{headline.edition_label}</div>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: `0 ${pad}px`, gap: 14 }}>
          {headline?.available ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {values.map((value) => (
                <div key={value} style={{ display: "flex", color: "#ffffff", fontSize: wide ? 46 : 62, fontWeight: 800, lineHeight: 1.15 }}>
                  {value}
                </div>
              ))}
              {headline.previous && (
                <div style={{ display: "flex", color: "rgba(255,255,255,0.55)", fontSize: wide ? 22 : 26, marginTop: 14 }}>
                  {headline.previous}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", color: "rgba(255,255,255,0.45)", fontSize: wide ? 26 : 32, lineHeight: 1.35 }}>
              Aún no hay suficientes respuestas verificadas para publicar resultados.
            </div>
          )}
        </div>

        <div style={{ padding: `0 ${pad}px ${wide ? 36 : 52}px`, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 16 }}>
              {headline?.n ? `${headline.n.toLocaleString("es-CL")} votantes verificados · participación voluntaria, sin ponderar` : "Participación voluntaria"}
            </span>
            <span style={{ color: "#D4AF37", fontSize: 16, fontWeight: 700 }}>beaconchile.cl/series/{slug}</span>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent 0%, #D4AF37aa 50%, #D4AF37 100%)" }} />
      </div>
    ),
    { width, height },
  );

  if (download) response.headers.set("Content-Disposition", `attachment; filename="beacon-serie-${slug}.png"`);
  response.headers.set("Cache-Control", process.env.NODE_ENV === "development" ? "no-store" : "s-maxage=60, stale-while-revalidate=3600");
  return response;
}
