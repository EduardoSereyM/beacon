/**
 * BEACON — Voting Weight & RUT Privacy Disclaimer
 * ================================================
 * Explains how voting weight works and emphasizes RUT privacy/hashing
 */

export default function VotingWeightDisclaimer() {
  return (
    <section className="px-6 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h2
            className="text-2xl sm:text-3xl font-extrabold mb-4"
            style={{ color: "#39FF14", letterSpacing: "-0.02em" }}
          >
            Tu voto, tu peso. Tu RUT, solo tuyo.
          </h2>
          <p className="text-base sm:text-lg text-foreground-muted max-w-2xl leading-relaxed">
            En Beacon, no todos los votos son iguales — y eso es intencional.
          </p>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Left: Voting Weight */}
          <div
            className="p-8 rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgba(57,255,20,0.05) 0%, rgba(0,229,255,0.05) 100%)",
              border: "1px solid rgba(57,255,20,0.15)",
            }}
          >
            <h3
              className="text-sm font-bold uppercase tracking-wider mb-4"
              style={{ color: "#39FF14" }}
            >
              ⚖️ Tu peso en Beacon
            </h3>
            <div className="space-y-4 text-sm text-foreground-muted leading-relaxed">
              <p>
                <strong style={{ color: "#f5f5f5" }}>Si te registras:</strong> cada voto que emitas vale{" "}
                <span style={{ color: "#D4AF37" }}>0,5 puntos.</span>
              </p>
              <p>
                <strong style={{ color: "#f5f5f5" }}>Si además validas tu identidad con tu RUT:</strong> cada voto pasa
                a valer <span style={{ color: "#39FF14" }}>1 punto completo.</span>
              </p>
              <p style={{ fontSize: "12px", fontStyle: "italic", color: "rgba(255,255,255,0.4)", marginTop: 12 }}>
                ¿Por qué? Porque una persona verificada es una voz real, sin bots ni multicuentas. Y eso hace que los
                resultados importen de verdad.
              </p>
            </div>
          </div>

          {/* Right: RUT Privacy */}
          <div
            className="p-8 rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgba(212,175,55,0.05) 0%, rgba(138,43,226,0.05) 100%)",
              border: "1px solid rgba(212,175,55,0.15)",
            }}
          >
            <h3
              className="text-sm font-bold uppercase tracking-wider mb-4"
              style={{ color: "#D4AF37" }}
            >
              🔐 Tu RUT, seguro
            </h3>
            <div className="space-y-4 text-sm text-foreground-muted leading-relaxed">
              <p>
                <strong style={{ color: "#f5f5f5" }}>Nunca lo vemos.</strong> En el momento en que lo ingresas, se
                convierte automáticamente en un código hash irreversible — una cadena de caracteres que no guarda
                ninguna relación legible con tu número real.
              </p>
              <p>
                <strong style={{ color: "#f5f5f5" }}>Es matemáticamente imposible</strong> reconstruir tu RUT a partir
                de ese hash. Ni Beacon, ni ningún sistema, ni ninguna persona puede hacerlo.
              </p>
              <p
                style={{
                  fontSize: "12px",
                  fontFamily: "monospace",
                  color: "rgba(57,255,20,0.6)",
                  marginTop: 12,
                  padding: "8px 12px",
                  background: "rgba(57,255,20,0.05)",
                  borderRadius: 6,
                  border: "1px solid rgba(57,255,20,0.1)",
                }}
              >
                Usamos SHA-256 con salt único por usuario.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom callout */}
        <div
          className="p-8 rounded-xl text-center"
          style={{
            background: "rgba(0,229,255,0.02)",
            border: "1px solid rgba(0,229,255,0.15)",
          }}
        >
          <p
            className="text-sm leading-relaxed"
            style={{ color: "rgba(255,255,255,0.8)" }}
          >
            <strong style={{ color: "#00E5FF" }}>Votas con el peso de una identidad real.</strong>
            <br />
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Sin exponer quién eres.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
