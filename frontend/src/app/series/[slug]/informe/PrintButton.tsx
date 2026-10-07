"use client";

/** Abre el diálogo de impresión del navegador: ahí se elige «Guardar como PDF». */
export default function PrintButton() {
  return (
    <button
      type="button"
      className="no-print"
      onClick={() => window.print()}
      style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(0,229,255,0.12)", border: "1px solid #00E5FF", color: "#00E5FF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
    >
      Descargar PDF (imprimir)
    </button>
  );
}
