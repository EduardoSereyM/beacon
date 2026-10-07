"use client";

/**
 * PoliticalPositionPanel — ver, cambiar o borrar la posición política desde el perfil.
 * Autocontenido: guarda con PUT /profile/political-position. Borrar quita dato y consentimiento.
 */

import { useState } from "react";
import PoliticalPositionField from "@/components/profile/PoliticalPositionField";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  token: string;
  initial: string | null;
  inputClass: string;
  labelClass: string;
  inputStyle: React.CSSProperties;
}

export default function PoliticalPositionPanel({ token, initial, inputClass, labelClass, inputStyle }: Props) {
  const [saved, setSaved] = useState(initial ?? "");
  const [value, setValue] = useState(initial ?? "");
  const [consent, setConsent] = useState(Boolean(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = value !== saved;

  const save = async (position: string | null) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/user/auth/profile/political-position`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ position, consent: position !== null }),
      });
      if (!res.ok) throw new Error("No se pudo guardar. Intenta de nuevo.");
      setSaved(position ?? "");
      setValue(position ?? "");
      setConsent(position !== null);
      setMessage({ ok: true, text: position ? "Guardado." : "Dato borrado. Ya no figura en tu cuenta." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Error de conexión." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3" aria-label="Posición política">
      <PoliticalPositionField
        value={value}
        consent={consent}
        onChange={(v, c) => { setValue(v); setConsent(c); setMessage(null); }}
        disabled={saving}
        inputClass={inputClass}
        labelClass={labelClass}
        inputStyle={inputStyle}
      />
      <div className="flex gap-3">
        <button
          type="button"
          disabled={saving || !dirty || (Boolean(value) && !consent)}
          onClick={() => void save(value || null)}
          className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider disabled:opacity-40"
          style={{ border: "1px solid rgba(0,229,255,0.5)", color: "#00E5FF" }}
        >
          {value ? "Guardar" : "Borrar dato"}
        </button>
      </div>
      {message && (
        <p role="status" className="text-[11px] font-mono" style={{ color: message.ok ? "#39FF14" : "#FF073A" }}>{message.text}</p>
      )}
    </section>
  );
}
