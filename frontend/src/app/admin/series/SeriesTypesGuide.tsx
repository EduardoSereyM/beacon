/**
 * SeriesTypesGuide — recordatorio permanente para quien administra las series
 * ============================================================================
 * Explica qué es cada tipo de serie y qué NO hacer, para no mezclar conceptos. Si cambian las reglas
 * (tipos, cadencias, qué corta la tendencia), se actualiza aquí y en docs/apis.md.
 */

const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 14 } as const;
const h3 = { fontSize: 14, fontWeight: 800, margin: "0 0 6px" } as const;
const text = { fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.75)", margin: "0 0 6px" } as const;
const list = { ...text, paddingLeft: 18, display: "grid", gap: 4, margin: 0 } as const;

export default function SeriesTypesGuide() {
  return (
    <details open style={{ background: "rgba(17,17,17,0.9)", border: "1px solid rgba(212,175,55,0.35)", borderRadius: 14, padding: 18 }}>
      <summary style={{ cursor: "pointer", fontSize: 15, fontWeight: 800, color: "#D4AF37" }}>
        Antes de crear o editar una serie: qué es cada tipo
      </summary>

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        <section style={card} aria-label="Serie de seguimiento">
          <h3 style={{ ...h3, color: "#00E5FF" }}>Seguimiento (el tipo normal)</h3>
          <p style={text}>
            Repite <strong>las mismas preguntas y las mismas opciones</strong> en cada edición, para ver cómo cambia la opinión en el tiempo.
            Se muestra como una <strong>línea de tendencia</strong>. Ejemplos: «Barómetro Beacon» (mensual) y «Pulso Beacon» (semanal).
          </p>
          <ul style={list}>
            <li>Cada edición es una <strong>copia exacta</strong> de la plantilla y se publica sola.</li>
            <li>
              <strong>No cambies el texto de una pregunta ni sus opciones</strong> a la ligera: la serie sube de versión y la línea se
              <strong> corta</strong> (las dos mitades ya no son comparables). Si necesitas otra pregunta, crea otra serie.
            </li>
            <li>Sirve para aprobación, evaluación del país, expectativas… todo lo que quieras comparar mes a mes o semana a semana.</li>
          </ul>
        </section>

        <section style={card} aria-label="Serie agenda">
          <h3 style={{ ...h3, color: "#D4AF37" }}>Agenda (el tipo especial)</h3>
          <p style={text}>
            Repite <strong>la misma pregunta pero con opciones distintas cada edición</strong>, que define una persona (por ejemplo, las noticias
            de la semana). Como las opciones cambian, <strong>no se comparan una a una</strong>: cada edición muestra su propio ranking.
          </p>
          <ul style={list}>
            <li>Las opciones de la edición se definen <strong>antes de que abra</strong>. Sin opciones, la edición <strong>no se publica</strong> (el workflow lo avisa).</li>
            <li>Una vez publicada la edición, sus opciones <strong>ya no se pueden cambiar</strong>.</li>
            <li>No sirve para seguir una opinión en el tiempo: para eso usa una serie de seguimiento.</li>
            <li>Por ahora solo se crea por API; esta pantalla crea series de seguimiento.</li>
          </ul>
        </section>

        <section style={card} aria-label="Reglas comunes">
          <h3 style={h3}>Reglas comunes</h3>
          <ul style={list}>
            <li><strong>Mensual:</strong> abre el día 1 a las 00:00 y cierra el último día del mes. <strong>Semanal:</strong> abre el lunes a las 04:00 y cierra el lunes siguiente a las 03:59 (hora de Chile).</li>
            <li>La <strong>cadencia y el tipo no se pueden cambiar</strong> después de crear la serie.</li>
            <li><strong>Pausar</strong> detiene las ediciones nuevas y conserva todo el historial. Las ediciones publicadas no se borran.</li>
            <li>Los <strong>eventos anotados</strong> son hitos que se numeran sobre el gráfico (no cambian los datos).</li>
            <li>Un resultado con menos de <strong>30 respuestas</strong> no se publica: es normal ver «n insuficiente» mientras haya pocos votantes.</li>
          </ul>
        </section>
      </div>
    </details>
  );
}
