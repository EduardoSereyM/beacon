/**
 * BEACON CHILE — /metodologia (Server Component, estática)
 * =========================================================
 * Ficha metodológica pública: qué mide Beacon, cómo se cuenta y qué límites tiene.
 * Los umbrales de la ponderación replican `backend/app/core/weighting/config.py` (versión 1):
 * si cambian allá, se actualizan aquí.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Metodología — Beacon Chile",
  description:
    "Cómo mide Beacon Chile la opinión ciudadana: quién participa, cómo se cuentan los votos, cómo se ponderan los resultados y qué límites tienen.",
};

const CENSO_URL = "https://censo2024.ine.gob.cl/estadisticas/";

const h2 = { fontSize: 20, fontWeight: 800, margin: "32px 0 10px", color: "#f5f5f5", scrollMarginTop: 80 } as const;
const p = { fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.72)", margin: "0 0 10px" } as const;
const ul = { ...p, paddingLeft: 20, display: "grid", gap: 6, listStyleType: "disc" } as const;
const link = { color: "#00E5FF" } as const;

export default function MetodologiaPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10" style={{ color: "#f5f5f5" }}>
      <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#00E5FF", fontFamily: "monospace", marginBottom: 8 }}>
        Metodología
      </p>
      <h1 className="text-2xl sm:text-3xl" style={{ fontWeight: 900, letterSpacing: "-0.02em", marginBottom: 12 }}>
        Cómo medimos
      </h1>
      <p style={p}>
        Beacon Chile mide opinión ciudadana. Esta página explica quién participa, cómo se cuenta cada voto, cómo se ponderan los resultados
        y, sobre todo, qué límites tienen. Si algo de lo que publicamos no se sostiene con lo que aquí se describe, es un error nuestro.
      </p>

      <h2 id="quien-participa" style={h2}>Quién participa</h2>
      <p style={p}>
        Participa quien quiere hacerlo. Hay dos tipos de voto: <strong>verificado</strong>, de una persona cuya identidad validamos con su RUT
        (el RUT no se guarda: solo un código irreversible), y <strong>básico</strong>, de una cuenta sin verificar. Cada persona vota una vez por
        encuesta o edición. Aplicamos controles contra cuentas automáticas y duplicadas; ningún control es infalible.
      </p>

      <h2 id="que-mostramos" style={h2}>Qué mostramos</h2>
      <ul style={ul}>
        <li><strong>Verificados:</strong> solo votos con identidad validada, sin ponderar.</li>
        <li><strong>Todos:</strong> verificados y básicos, sin ponderar.</li>
        <li><strong>Ponderado:</strong> votos verificados ajustados a la composición de la población (ver más abajo). Solo aparece cuando hay datos suficientes.</li>
      </ul>
      <p style={p}>
        Mostramos el número de respuestas (n) de cada resultado. Un resultado con menos de <strong>30 respuestas</strong> en esa pregunta no se publica:
        con tan pocos casos, una variación de unos puntos es azar y no una noticia.
      </p>

      <h2 id="que-no-es" style={h2}>Qué no es</h2>
      <ul style={ul}>
        <li>No es una muestra probabilística: nadie fue elegido al azar. Por eso <strong>no publicamos margen de error</strong>, que supone un muestreo aleatorio.</li>
        <li>No representa, por sí solo, a toda la población de Chile.</li>
        <li>No es una predicción electoral.</li>
      </ul>

      <h2 id="series" style={h2}>Series en el tiempo</h2>
      <p style={p}>
        Una serie repite las mismas preguntas para ver cómo cambia la opinión. Las series <strong>mensuales</strong> abren el día 1 de cada mes y
        las <strong>semanales</strong> el lunes a las 04:00, hora de Chile (a esa hora para que el cambio de horario no caiga en el borde de una
        edición). Si una pregunta cambia, la línea del gráfico se corta: ya no es comparable. Los hitos numerados sobre el gráfico los anotamos
        nosotros y no implican causalidad.
      </p>

      <h2 id="ponderacion" style={h2}>Ponderación</h2>
      <p style={p}>
        Quienes participan no son un reflejo exacto del país: por ejemplo, suele haber más gente de la Región Metropolitana. La ponderación
        reajusta el peso de cada voto verificado para que la composición coincida con la población de 18 años o más.
      </p>
      <ul style={ul}>
        <li><strong>Variables:</strong> zona (Norte, Centro, Metropolitana, Sur), sexo y grupo de edad (18-34, 35-54, 55 o más).</li>
        <li>
          <strong>Fuente de la población:</strong> Censo de Población y Vivienda 2024, INE, cuadro «Población censada por sexo y edad en grupos quinquenales»
          (<a href={CENSO_URL} style={link} target="_blank" rel="noopener noreferrer">censo2024.ine.gob.cl</a>).
        </li>
        <li><strong>Método:</strong> ajuste proporcional iterativo (raking) con pesos recortados para que ningún voto domine el resultado (entre 0,3 y 3 veces el promedio).</li>
        <li>
          <strong>Solo se publica si hay datos suficientes:</strong> al menos 200 votantes verificados con todos sus datos en la edición, al menos 5 en cada
          categoría, un tamaño muestral efectivo de al menos 100 tras ponderar y un ajuste que converja. Si no se cumple, la vista aparece como no disponible
          y se explica el motivo; preferimos no mostrar una cifra antes que mostrar una engañosa.
        </li>
        <li>
          <strong>Tamaño muestral efectivo:</strong> ponderar le cuesta precisión a la muestra. Publicamos cuántos votantes «valen» tras ponderar
          (por ejemplo, 400 votantes pueden equivaler a 250).
        </li>
      </ul>
      <p style={p}><strong>Supuestos y límites:</strong></p>
      <ul style={ul}>
        <li>El censo agrupa por quinquenios: el tramo de 15 a 19 años se reparte en 2/5 a los 18 y 19 años.</li>
        <li>Las 16 regiones se agrupan en 4 zonas para que cada categoría reúna suficientes votantes.</li>
        <li>El censo reporta hombres y mujeres. Quien se identifica de otro modo o prefiere no decirlo participa y cuenta en «Verificados» y «Todos», pero queda fuera de la cifra ponderada; informamos cuántos son.</li>
        <li>La edad se calcula con el año de nacimiento, con un margen de un año.</li>
        <li>
          <strong>La ponderación corrige la composición en esas tres variables; no corrige que participe quien quiere participar.</strong> Si quienes responden
          piensan distinto que quienes no, en algo que no medimos, el sesgo permanece. No recolectamos datos políticos de los votantes (como su voto pasado)
          para ajustar por ellos.
        </li>
      </ul>

      <h2 id="privacidad" style={h2}>Privacidad</h2>
      <p style={p}>
        Los datos demográficos de cada votante se usan solo dentro del cálculo y no se publican. Nunca se publican pesos ni respuestas individuales, y los
        cruces por grupo se suprimen cuando son demasiado pequeños para proteger a las personas.
      </p>

      <h2 id="versiones" style={h2}>Versiones y cambios</h2>
      <p style={p}>
        Cada resultado cerrado guarda la versión de los datos de población y de la configuración con que se calculó (versión 1 de la configuración, datos
        «censo2024-18plus-v1»). Cualquier cambio de método o de datos se hace con revisión y queda registrado, para que una cifra pasada se pueda explicar.
      </p>

      <p style={{ ...p, marginTop: 28, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
        Última actualización: 7 de octubre de 2026. <Link href="/encuestas" style={link}>Ver encuestas →</Link>
      </p>
    </main>
  );
}
