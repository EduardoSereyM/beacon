/**
 * BEACON CHILE — /api/og/encuesta/[slug]
 * ========================================
 * Imagen OG dinámica 1200x630 por encuesta.
 * Fondo: degradado oscuro con acentos de brand (cian + dorado).
 * Sin imagen de fondo — diseño limpio y consistente.
 *
 * Cache: no-store en dev, 1h en producción.
 */

import { ImageResponse } from "next/og";

export const runtime = "edge";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://beacon-f477.onrender.com";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let title = "Encuesta Ciudadana";
  let votes = 0;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_URL}/api/v1/polls/by-slug/${slug}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const poll = await res.json();
      title = poll.title ?? title;
      votes = poll.total_votes ?? 0;
    }
  } catch {
    // cold start o error de red
  }

  const voteLabel =
    votes === 0
      ? "Sé el primero en votar"
      : votes === 1
      ? "1 ciudadano ya votó"
      : `${votes.toLocaleString("es-CL")} ciudadanos ya votaron`;

  const fontSize = title.length > 90 ? 34 : title.length > 60 ? 42 : 50;

  const response = new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          fontFamily: "sans-serif",
          overflow: "hidden",
          // Degradado oscuro con acentos de brand
          background:
            "linear-gradient(135deg, #07071a 0%, #0a0a14 30%, #060610 60%, #0c0b10 100%)",
        }}
      >
        {/* Destello cian arriba-izquierda */}
        <div
          style={{
            position: "absolute",
            top: -80,
            left: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "rgba(0, 229, 255, 0.07)",
          }}
        />

        {/* Destello dorado abajo-derecha */}
        <div
          style={{
            position: "absolute",
            bottom: -100,
            right: -60,
            width: 360,
            height: 360,
            borderRadius: "50%",
            background: "rgba(212, 175, 55, 0.06)",
          }}
        />

        {/* Borde cian superior */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background:
              "linear-gradient(90deg, #00E5FF 0%, #00E5FFaa 50%, transparent 100%)",
          }}
        />

        {/* Borde dorado inferior */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background:
              "linear-gradient(90deg, transparent 0%, #D4AF37aa 50%, #D4AF37 100%)",
          }}
        />

        {/* Label de marca */}
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 80,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              color: "#00E5FF",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            BEACON CHILE
          </span>
          <span style={{ color: "rgba(0,229,255,0.35)", fontSize: 13 }}>·</span>
          <span
            style={{
              color: "rgba(0,229,255,0.55)",
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            OPINIÓN CIUDADANA VERIFICADA
          </span>
        </div>

        {/* Línea divisora superior */}
        <div
          style={{
            position: "absolute",
            top: 86,
            left: 80,
            right: 80,
            height: 1,
            background: "rgba(0, 229, 255, 0.12)",
          }}
        />

        {/* Zona central — pregunta */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 28,
            padding: "110px 90px 100px",
            zIndex: 1,
          }}
        >
          {/* Acento decorativo superior */}
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <div style={{ width: 24, height: 2, background: "#00E5FF", borderRadius: 2 }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00E5FF", opacity: 0.6 }} />
            <div style={{ width: 24, height: 2, background: "#00E5FF", borderRadius: 2 }} />
          </div>

          <p
            style={{
              color: "#ffffff",
              fontSize,
              fontWeight: 800,
              lineHeight: 1.35,
              margin: 0,
              maxWidth: 960,
            }}
          >
            {title}
          </p>

          {/* Acento decorativo inferior */}
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <div style={{ width: 24, height: 2, background: "#D4AF37", borderRadius: 2, opacity: 0.7 }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#D4AF37", opacity: 0.5 }} />
            <div style={{ width: 24, height: 2, background: "#D4AF37", borderRadius: 2, opacity: 0.7 }} />
          </div>
        </div>

        {/* Línea divisora inferior */}
        <div
          style={{
            position: "absolute",
            bottom: 86,
            left: 80,
            right: 80,
            height: 1,
            background: "rgba(255,255,255,0.06)",
          }}
        />

        {/* Fila inferior */}
        <div
          style={{
            position: "absolute",
            bottom: 44,
            left: 80,
            right: 80,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 15 }}>
            {voteLabel}
          </span>
          <span
            style={{
              color: "#D4AF37",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.06em",
            }}
          >
            beaconchile.cl
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );

  response.headers.set(
    "Cache-Control",
    process.env.NODE_ENV === "development"
      ? "no-store"
      : "s-maxage=3600, stale-while-revalidate=86400"
  );

  return response;
}
