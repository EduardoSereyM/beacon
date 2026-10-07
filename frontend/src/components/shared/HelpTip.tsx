"use client";

/**
 * HelpTip — «?» en un círculo que despliega una explicación al pasar el mouse o al enfocarlo con el teclado.
 */

import { useId, useState } from "react";

export default function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 6 }}>
      <span
        tabIndex={0}
        role="button"
        aria-label="Ayuda"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        style={{
          width: 16, height: 16, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
          border: "1px solid rgba(0,229,255,0.7)", color: "#00E5FF", fontSize: 11, fontWeight: 700, lineHeight: 1, cursor: "help", userSelect: "none",
        }}
      >
        ?
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 20, width: 280, padding: "8px 10px", borderRadius: 8,
            background: "#161616", border: "1px solid rgba(0,229,255,0.35)", boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
            color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 400, lineHeight: 1.5, textAlign: "left", textTransform: "none", letterSpacing: "normal",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
