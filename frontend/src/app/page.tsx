/**
 * BEACON PROTOCOL — Landing Page
 * ================================
 * Página principal del Protocolo Beacon.
 * Estilo Dark Premium: terminal de Bloomberg + bóveda suiza.
 */

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      {/* Hero Section */}
      <div className="text-center max-w-2xl">
        {/* Beacon Emblem */}
        <div className="mx-auto mb-8 w-20 h-20 rounded-full bg-beacon-gold flex items-center justify-center glow-gold">
          <span className="text-beacon-black text-3xl font-black">B</span>
        </div>

        <h1 className="text-4xl font-bold text-foreground mb-4 tracking-tight">
          Beacon Protocol
        </h1>

        <p className="text-lg text-foreground-muted mb-2">
          Motor de Integridad y Meritocracia Digital
        </p>

        <p className="text-sm text-foreground-muted mb-10 max-w-md mx-auto">
          Donde tu voz tiene peso, tu identidad tiene valor,
          y la verdad es la única moneda que importa.
        </p>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {/* Integrity Score */}
          <div className="glass rounded-lg p-5 text-left glow-gold-hover transition-all">
            <p className="text-[10px] text-beacon-gold tracking-[0.2em] uppercase mb-2">
              Integrity Score
            </p>
            <p className="score-display text-3xl text-beacon-gold">0.95</p>
            <p className="text-xs text-foreground-muted mt-1">
              Promedio del sistema
            </p>
          </div>

          {/* Active Citizens */}
          <div className="glass rounded-lg p-5 text-left glow-gold-hover transition-all">
            <p className="text-[10px] text-beacon-silver tracking-[0.2em] uppercase mb-2">
              Ciudadanos Activos
            </p>
            <p className="score-display text-3xl text-beacon-silver">1,247</p>
            <p className="text-xs text-foreground-muted mt-1">
              Humanos verificados
            </p>
          </div>

          {/* Security Level */}
          <div className="glass rounded-lg p-5 text-left glow-gold-hover transition-all">
            <p className="text-[10px] text-beacon-green tracking-[0.2em] uppercase mb-2">
              Nivel de Seguridad
            </p>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-beacon-green pulse-live" />
              <p className="score-display text-3xl text-beacon-green">GREEN</p>
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              Filtros estándar activos
            </p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button className="btn-beacon-solid rounded-lg px-8 py-3">
            Ingresar al Búnker
          </button>
          <button className="btn-beacon rounded-lg px-8 py-3">
            Verificar Identidad
          </button>
        </div>
      </div>

      {/* Rank Preview */}
      <div className="mt-16 w-full max-w-xl">
        <p className="text-[10px] text-foreground-muted tracking-[0.2em] uppercase text-center mb-4">
          Escalafón de la Meritocracia
        </p>
        <div className="flex justify-center gap-3">
          <span className="badge-bronze px-3 py-1 rounded text-xs">Bronce</span>
          <span className="badge-silver px-3 py-1 rounded text-xs">Plata</span>
          <span className="badge-gold px-3 py-1 rounded text-xs">Oro</span>
          <span className="badge-diamond px-3 py-1 rounded text-xs">Diamante</span>
        </div>
      </div>
    </div>
  );
}
