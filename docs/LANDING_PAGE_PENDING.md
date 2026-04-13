# Landing Page — Features Pendientes

## Feature: Sección Comparativa "Encuestadoras Tradicionales vs Beacon"

**Estado:** Pendiente de implementación  
**Prioridad:** P3 (mejora de UI/conversión)  
**Fecha de especificación:** 2026-04-13

---

## Descripción

Agregar una nueva sección comparativa entre el modelo de encuestadoras tradicionales y Beacon, que será insertada entre el **hero completo** (badge + headline + claims horizontales + CTAs) y las **3 cards de diferenciadores** (Tu voz sin filtros, Cada voto una persona real, Datos de Chile para todos).

Esta sección reemplaza o complementa el espacio que quedó libre al eliminar el párrafo suelto del hero.

---

## Estructura Visual

### Layout General
- **Dos columnas lado a lado**, mismo ancho
- **Separador visual** entre ellas (borde/línea)
- **Sin título de sección** — la comparación se explica sola
- **Máximo ancho:** mismo max-width del hero y cards existentes

---

## Columna Izquierda — "Encuestadoras Tradicionales"

### Header
- Texto pequeño en mayúsculas
- Color gris apagado (#555 o similar)
- **Contenido:** `ENCUESTADORAS TRADICIONALES`
- Sin ícono de color

### Contenido
Lista de **4 ítems**, cada uno con un **✗** (tachado/negado) antes del texto:
- Color del ✗: rojo/gris apagado
- Ítems:
  1. ✗ Eligen quién puede opinar
  2. ✗ Trabajan para sus clientes
  3. ✗ Resultados de pago o restringidos
  4. ✗ Panel de ~1.000 personas seleccionadas

### Estilos
- **Fondo:** `#0f0f0f`
- **Borde:** `#1a1a1a`
- **Border-radius:** igual al resto de las cards del sitio (11px aproximadamente)
- **Padding/espaciado:** consistente con otros cards

---

## Columna Derecha — "Beacon"

### Header
- Texto pequeño en mayúsculas
- Color accent del sitio (cian #00E5FF o verde #39FF14, según sea prominente)
- **Contenido:** `BEACON`

### Contenido
Lista de **4 ítems**, cada uno con un **✓** (validado) antes del texto:
- Color del ✓: color accent del sitio (mismo que header)
- Ítems:
  1. ✓ Cualquier ciudadano puede votar
  2. ✓ No trabajamos para nadie
  3. ✓ Resultados públicos y gratuitos
  4. ✓ Chile entero puede opinar

### Estilos
- **Fondo:** levemente más cálido que el izquierdo (por ejemplo, `rgba(0,229,255,0.02)` si usas cian)
- **Borde:** color accent del sitio (mismo que otros cards destacados, ej. `1px solid rgba(0,229,255,0.15)`)
- **Border-radius:** igual al resto de las cards del sitio

---

## Comportamiento Responsive

### Desktop (≥ 768px)
- Grid de 2 columnas lado a lado
- Mismo ancho cada columna
- Separador visual entre ellas

### Mobile (< 768px)
- Apilado verticalmente
- **Orden:** Columna "Beacon" arriba, "Encuestadoras Tradicionales" abajo
- Full width con padding lateral consistente

---

## Ubicación en el DOM

### Lugar exacto
Insertar **DESPUÉS** de:
```
Hero completo (badge EN VIVO + headline + claims horizontales + CTAs)
```

E **INMEDIATAMENTE ANTES** de:
```
Cards de diferenciadores (3 cards: "Tu voz sin filtros", etc.)
```

### Implementación
- **Componente recomendado:** `frontend/src/components/home/ComparisonSection.tsx` (nuevo)
- **Archivo a modificar:** `frontend/src/app/page.tsx` → importar y renderizar entre `<HomeHeroClient />` y `<SectionDivider />` + cards
- **No agregar título** ni padding excesivo — que fluya naturalmente entre secciones

---

## Notas de Implementación

1. **Separador visual:** puede ser un `border-left` en la columna derecha, un `|` visual, o un espacio en blanco puro (investigar en Figma si existe guía).

2. **Animaciones:** considerar hover state sutil en cada columna (fade, scale 1.02, box-shadow), consistente con el resto del site.

3. **Accesibilidad:** usar `<ul>` + `<li>` para la estructura semántica de las listas, aunque se estilice como custom.

4. **Colores exactos:** validar con Figma o paleta.md que exista (`#00E5FF` para cian, `#39FF14` para verde, `#555` para gris).

5. **Tipografía:** mantener consistencia con headlines (font-bold, tracking-wider) y body text existente.

6. **Testing:** verificar en mobile, tablet y desktop; validar que el grid responda correctamente.

---

## Criterio de Aceptación

- [ ] Sección renderiza correctamente entre hero y cards
- [ ] Dos columnas lado a lado en desktop
- [ ] Responsive apilado en mobile (Beacon arriba)
- [ ] Headers con color/tipografía correctos
- [ ] 4 ítems por columna con símbolos ✗ y ✓
- [ ] Estilos de fondo/borde/padding consistentes con site
- [ ] Sin overflow, spacing uniforme
- [ ] Accesible (keyboard navigation, screen readers)
- [ ] Sin romper layout existente de hero ni cards

---

## Referencias

- **Hero Section:** `frontend/src/components/home/HomeHeroClient.tsx`
- **Cards Existentes:** `frontend/src/app/page.tsx` (lines ~115-160)
- **Paleta de Colores:** `docs/paleta.md` (si existe) o revisar `globals.css`
- **Responsive Breakpoints:** Tailwind default (md: 768px, lg: 1024px)
