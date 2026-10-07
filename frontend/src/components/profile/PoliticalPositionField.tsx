/**
 * PoliticalPositionField — autodeclaración opcional de posición política (dato sensible)
 * ========================================================================================
 * Presentacional y controlado. Elegir una posición exige marcar el consentimiento expreso;
 * dejar «Prefiero no decir» no guarda nada. Se usa en la verificación y en el perfil.
 */

export const POLITICAL_OPTIONS = ["Derecha", "Centro", "Izquierda", "Independiente"] as const;
export type PoliticalOption = (typeof POLITICAL_OPTIONS)[number];

interface Props {
  value: string;
  consent: boolean;
  onChange: (value: string, consent: boolean) => void;
  disabled?: boolean;
  error?: string;
  inputClass: string;
  labelClass: string;
  inputStyle: React.CSSProperties;
}

export default function PoliticalPositionField({ value, consent, onChange, disabled, error, inputClass, labelClass, inputStyle }: Props) {
  return (
    <div>
      <label className={labelClass} htmlFor="political-position">¿Usted se define más de…? (opcional)</label>
      <select
        id="political-position"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value, e.target.value ? consent : false)}
        className={inputClass}
        style={inputStyle}
      >
        <option value="" style={{ background: "#0a0a0a", color: "white" }}>Prefiero no decir</option>
        {POLITICAL_OPTIONS.map((option) => (
          <option key={option} value={option} style={{ background: "#0a0a0a", color: "white" }}>{option}</option>
        ))}
      </select>

      {value && (
        <label className="flex items-start gap-2 mt-2 text-xs" style={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={consent}
            disabled={disabled}
            onChange={(e) => onChange(value, e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>Autorizo expresamente el tratamiento de este dato sensible para los fines descritos abajo.</span>
        </label>
      )}
      {error && <p className="text-xs mt-1" style={{ color: "#ff5050" }}>{error}</p>}

      <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
        Dato opcional y sensible. Lo usamos solo de forma agregada y anónima, para mostrar resultados por grupo cuando hay suficientes
        respuestas. Nunca se publica asociado a ti, no se usa para ponderar y puedes borrarlo cuando quieras desde tu perfil.
      </p>
    </div>
  );
}
