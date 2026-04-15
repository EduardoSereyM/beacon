/**
 * ComparisonSection — Encuestadoras Tradicionales vs Beacon
 * ==========================================================
 * Sección estática comparativa insertada entre el hero y los
 * cards de diferenciadores. Sin JS, sin hooks — Server Component puro.
 *
 * Layout: 2 columnas en desktop, Beacon arriba en mobile.
 */

const traditional = [
  "Eligen quién puede opinar",
  "Trabajan para sus clientes",
  "Resultados de pago o restringidos",
  "Panel de ~1.000 personas seleccionadas",
];

const beacon = [
  "Cualquier ciudadano puede votar",
  "No trabajamos para nadie",
  "Resultados públicos y gratuitos",
  "Chile entero puede opinar",
];

export default function ComparisonSection() {
  return (
    <section className="px-6 pb-2">
      <div className="max-w-5xl mx-auto">
        {/*
         * Grid: mobile = flex-col (Beacon arriba via order),
         *       md+ = grid-cols-2 lado a lado
         */}
        <div className="flex flex-col md:grid md:grid-cols-2 gap-4">

          {/* ── Columna BEACON (order-1 en mobile → arriba) ── */}
          <div
            className="order-1 md:order-2 rounded-xl p-6"
            style={{
              background: "rgba(0,229,255,0.02)",
              border: "1px solid rgba(0,229,255,0.15)",
            }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4"
              style={{ color: "#00E5FF" }}
            >
              BEACON
            </p>
            <ul className="space-y-3">
              {beacon.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-snug">
                  <span
                    className="mt-[1px] shrink-0 font-bold text-base leading-none"
                    style={{ color: "#00E5FF" }}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.85)" }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Columna TRADICIONALES (order-2 en mobile → abajo) ── */}
          <div
            className="order-2 md:order-1 rounded-xl p-6"
            style={{
              background: "#0f0f0f",
              border: "1px solid #1a1a1a",
            }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4"
              style={{ color: "#555" }}
            >
              ENCUESTADORAS TRADICIONALES
            </p>
            <ul className="space-y-3">
              {traditional.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-snug">
                  <span
                    className="mt-[1px] shrink-0 font-bold text-base leading-none"
                    style={{ color: "#7a2020" }}
                    aria-hidden="true"
                  >
                    ✗
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </section>
  );
}
