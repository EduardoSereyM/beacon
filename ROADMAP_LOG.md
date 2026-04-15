<!--
 ════════════════════════════════════════════════════════════
 BEACON PROTOCOL — Registro de Blindaje y Hoja de Ruta
 ════════════════════════════════════════════════════════════
 Estándar: Technical Directives 2026
 Clasificación: DOCUMENTO OFICIAL DE TRAZABILIDAD
 Mantra: "Lo que no es íntegro, no existe."
-->

# 🛡️ BEACON: Registro de Blindaje y Hoja de Ruta

> **Estado actual:** `Fase 2: Encuestas Ciudadanas — EN PRODUCCIÓN`
>
> **Mantra:** _"Lo que no es íntegro, no existe."_

---

## 📣 Sprint Marketing & Viralidad — 2026-04-15

### Contexto
Sprint dedicado a eliminar los bloqueos de viralidad identificados en `REQUERIMIENTOS_DEVELOPER.md`. Todos los cambios son frontend — sin migraciones ni cambios de backend. Verificado en local (`npm run dev`); pendiente de deploy a producción.

---

### REQ-01 — Rebranding global: "Beacon Protocol" → "Beacon Chile"

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `frontend/src/app/layout.tsx` | `title.default`, `og:title`, `twitter:title`, `siteName`, `description`, `twitter:site` (`@beaconprotocol` → `@beaconchile`), footer |
| `frontend/src/app/page.tsx` | `metadata.title`, `og:title`, JSON-LD `Organization.name` |
| `frontend/src/app/politicos/page.tsx` | `metadata.title` + `og:title` |
| `frontend/src/app/empresas/page.tsx` | `metadata.title` + `og:title` |
| `frontend/src/app/personajes/page.tsx` | `metadata.title` + `og:title` |
| `frontend/src/app/periodistas/page.tsx` | `metadata.title` + `og:title` (además corregido: era "Personajes" en lugar de "Periodistas") |
| `frontend/src/components/status/TruthMeter.tsx` | UI pública: "Auditado por Beacon Chile" |
| `frontend/src/app/auth/callback/page.tsx` | UI pública: "Beacon Chile · Puerta de Verificación" |

**Template de título:** cambiado de `"%s | Beacon Protocol"` → `"%s"` para evitar doble suffix (las páginas ya incluyen "— Beacon Chile").

---

### REQ-02 — OG tags dinámicos por encuesta (ajuste de descripción y consistencia)

**Archivo:** `frontend/src/app/encuestas/[id]/page.tsx`

- Description mejorada: `"[N ciudadanos ya votaron / Sé el primero]. ¿Cuál es tu opinión? Vota gratis y ve los resultados en tiempo real."`
- `og:locale: "es_CL"` añadido
- `og:siteName` consistente con "Beacon Chile"
- `twitter:site` corregido a `@beaconchile`
- Función `fetchPollForServer` centraliza el fetch (deduplicado por Next.js)

---

### REQ-03 — Imagen OG dinámica por encuesta (`next/og`)

**Archivo creado:** `frontend/src/app/api/og/encuesta/[slug]/route.tsx`

- Edge Runtime, `next/og` (ya incluido en Next.js 16)
- Fondo: degradado oscuro brand (`#07071a` → `#0a0a14` → `#060610`) con destello cian arriba-izquierda y destello dorado abajo-derecha
- Borde cian superior + borde dorado inferior
- Pregunta centrada con font adaptativo (34/42/50px según longitud)
- Fila inferior: votos reales + "beaconchile.cl" en dorado
- Timeout de 4s en fetch al backend (protección ante Render cold start)
- Cache: `no-store` en dev, `s-maxage=3600, stale-while-revalidate=86400` en producción

**Actualización en `generateMetadata`:** `og:image` y `twitter:image` apuntan a `/api/og/encuesta/[slug]` en lugar de `poll.header_image` o genérico.

---

### REQ-04 — Componente post-voto: momento de orgullo

**Archivo:** `frontend/src/app/encuestas/[id]/EncuestaDetailClient.tsx`

- Nuevo componente `PostVoteCard` (función local, ~130 líneas)
- Nuevo estado `showVoteSuccess` (se activa en `doVote`, se cierra con "Ver resultados")
- Copy diferenciado por rango:
  - **VERIFIED:** "Eres parte de los [N] ciudadanos reales…" en cian
  - **BASIC:** "Tu opinión aparece en el conteo público. Para que cuente en los informes verificados:" + botón "Verificar identidad →" en dorado
- Botón "Compartir →" usa `navigator.share` (mobile) o copia el texto post-voto
- Botón "Ver resultados" cierra el card y revela `PollResults`
- Al cerrar queda badge discreto "✓ Voto registrado"

---

### REQ-05 — Share text personalizado pre/post voto

**Archivo:** `frontend/src/app/encuestas/[id]/EncuestaDetailClient.tsx`

`SocialShareBar` recibe props `mode: "pre-vote" | "post-vote"` y `totalVotes`:

- **Pre-voto:** `"¿Qué piensas sobre "[pregunta]"? [N] ciudadanos ya votaron en Beacon Chile. Vota gratis →"`
- **Post-voto:** `"Acabo de votar en Beacon Chile: "[pregunta]". ¿Y tú qué opinas? #ChileOpina #BeaconChile"`
- El `SocialShareBar` del header cambia automáticamente al modo post-voto tras votar

---

### REQ-06 — Web Share API como CTA principal

**Archivo:** `frontend/src/app/encuestas/[id]/EncuestaDetailClient.tsx`

- Botón primario "↗ Compartir encuesta" en cian (ancho completo)
  - Mobile: `navigator.share` → selector nativo del OS (incluye todas las apps instaladas)
  - Desktop: copia texto + URL al clipboard
- Botones de red individuales degradados a sección "O compartir en" (secundaria)
- **Instagram / TikTok:** al hacer click copia el link y muestra toast flotante (fixed, bottom-center) durante 3.5s: `"✅ Link copiado — Abre [Red] y pégalo donde quieras compartirlo."`
- Estado `toastNetwork` independiente del `copied` del CTA principal

---

### REQ-07 — Schema.org `SurveyResults` en encuestas cerradas

**Archivo:** `frontend/src/app/encuestas/[id]/page.tsx`

- El `EncuestaPage` es ahora `async` y hace fetch del poll server-side
- Si `!poll.is_open`: inyecta `<script type="application/ld+json">` con `SurveyResults`
- Campos: `name`, `about.name` (category o primer tag), `numberOfParticipants` (total_votes), `datePublished` (ends_at ISO), `url`, `publisher` (Beacon Chile)
- Encuestas abiertas: sin JSON-LD (datos cambian constantemente)
- Verificación en producción: Google Rich Results Test con URL de encuesta cerrada

---

### REQ-08 — Card visual de resultado compartible

**Archivo creado:** `frontend/src/app/api/og/resultado/[slug]/route.tsx`

- Edge Runtime, `next/og`, 1080×1080px (formato Instagram/TikTok)
- Diseño: mismo brand gradient oscuro + barras horizontales por opción (top 5, ordenadas por % desc)
- Colores de barras progresivos: cian puro (1°) → cian al 22% (5°)
- Label truncado a 36 caracteres + % en grande a la derecha
- Fallback sin votos: emoji 📊 + `"AÚN NO HAY VOTOS SUFICIENTES"`
- `?download=1` → `Content-Disposition: attachment; filename="beacon-resultado-[slug].png"`
- Cache: `no-store` dev / `s-maxage=1800` producción (30 min)

**Componente `DownloadResultCard`** en `EncuestaDetailClient.tsx`:
- Se muestra bajo `PollResults` cuando el usuario votó (`!showVoteSuccess`) o la encuesta está cerrada
- Botón "↓ Descargar imagen": fetch blob → `createObjectURL` → click programático; fallback a `window.open`
- Estado "Generando…" mientras descarga

---

### REQ-09 — Badge de ciudadano verificado

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `frontend/src/components/bunker/VerifyIdentityModal.tsx` | Nuevo `VerifiedPrideMoment` reemplaza el success state simple |
| `frontend/src/app/profile/page.tsx` | Nuevo `VerifiedShareBadge` + llamada condicional cuando `rank === "VERIFIED"` |

**`VerifiedPrideMoment`:**
- Si `new_rank === "VERIFIED"`: badge 🎖️ (80px, borde dorado, glow) + título + copy + 2 botones
- "Compartir →": `navigator.share` mobile / copia texto desktop (feedback verde)
- "Ir a votar →": `onClose()` + `window.location.href = "/encuestas"`
- Si `new_rank !== "VERIFIED"`: mensaje simple "completa datos demográficos"

**`VerifiedShareBadge`** en perfil:
- Card compacta entre sección datos básicos y demográficos
- Solo visible cuando `user.rank === "VERIFIED"`
- Botón "Compartir →" con mismo texto y lógica

**Texto de share en ambos contextos:**
```
Acabo de verificar mi identidad en @BeaconChile.
Mi voto cuenta en las estadísticas oficiales de Chile. ¿Y el tuyo?
beaconchile.cl #BeaconChile #ChileOpina
```

---

### REQ-10 — Sección comparativa en landing page

**Archivo creado:** `frontend/src/components/home/ComparisonSection.tsx`
**Archivo modificado:** `frontend/src/app/page.tsx`

- Server Component puro (sin hooks) — rendereado en servidor
- Insertado entre `<HomeHeroClient />` y las 3 cards "POR QUÉ BEACON"
- Desktop: `grid-cols-2` lado a lado
- Mobile: `flex-col` + `order-1/order-2` — Beacon siempre arriba
- Columna izquierda (Tradicionales): fondo `#0f0f0f`, borde `#1a1a1a`, header gris `#555`, ✗ rojo apagado
- Columna derecha (Beacon): fondo `rgba(0,229,255,0.02)`, borde cian `rgba(0,229,255,0.15)`, header cian, ✓ cian
- Contenido de cada columna especificado en `docs/LANDING_PAGE_PENDING.md`

---

### Impacto

- ✅ REQ-01: Brand unificado en todas las páginas y meta tags — 8 archivos
- ✅ REQ-02: OG description correcta, locale, siteName y handle consistentes
- ✅ REQ-03: Cada share de encuesta genera imagen propia con pregunta + votos
- ✅ REQ-04: Momento de orgullo post-voto con copy diferenciado por rango
- ✅ REQ-05: Texto de share cambia automáticamente pre/post voto
- ✅ REQ-06: `navigator.share` en mobile + toast informativo en IG/TikTok
- ✅ REQ-07: Rich data para Google en encuestas cerradas
- ✅ REQ-08: Imagen 1080×1080 descargable con resultados reales + barras de %
- ✅ REQ-09: Momento de orgullo post-verificación + badge compartible en perfil
- ✅ REQ-10: Comparativa visual Tradicionales vs Beacon en landing, responsive
- ✅ Build limpio sin errores TypeScript en todos los cambios

---

## 💬 Reacciones Ciudadanas (poll_comments) — 2026-04-14 (commits 05d3b9b, ec9d192)

### Implementado y desplegado en producción

#### DB — Migración 022 (ejecutada y verificada en Supabase)
- **Tabla:** `public.poll_comments` con 8 columnas: `id`, `poll_id`, `user_id`, `reaction`, `text`, `rank`, `created_at`, `deleted_at`
- **Unicidad:** índice parcial `poll_comments_one_per_user (poll_id, user_id) WHERE deleted_at IS NULL` — un comentario activo por usuario/encuesta
- **Soft-delete:** `deleted_at` — los registros nunca se borran físicamente (audit trail)
- **RLS activo:** SELECT público · INSERT solo propio `user_id` · UPDATE solo propio (soft-delete)
- **Snapshot de rank:** el campo `rank` captura el nivel del ciudadano al momento de publicar (inmutable)

#### Backend
| Archivo | Descripción |
|---|---|
| `backend/app/services/poll_comments_service.py` | `get_comments`, `get_user_comment`, `create_comment`, `soft_delete_comment` |
| `backend/app/api/v1/endpoints/poll_comments.py` | Router con 3 endpoints, validación Pydantic, 409 en duplicado |
| `backend/app/main.py` | Router registrado bajo tag `Poll Comments` |

#### Endpoints
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/v1/polls/{id}/comments` | No | Lista paginada (limit/offset) |
| `POST` | `/api/v1/polls/{id}/comments` | JWT | Publica comentario + reacción opcional |
| `DELETE` | `/api/v1/polls/{id}/comments/{cid}` | JWT | Soft-delete propio comentario |

#### Frontend
- `PollCommentsSection.tsx` conectada al backend real (antes: `setTimeout` mock)
- Carga comentarios al montar via GET
- Detecta si el usuario ya comentó (compara `user_id`)
- Propio comentario resaltado en la lista con borde violeta
- Muestra estado `loading`, vacío, o lista paginada

#### Auditoría de migraciones (2026-04-14)
Verificado: **las 15 migraciones (008–022) están aplicadas en Supabase.** Los checks previos tenían nombres erróneos (`audit_log` vs `audit_logs`, `region_id` vs `region`). Base de datos 100% al día.

### Impacto
- ✅ Reacciones ciudadanas persistidas en BBDD con trazabilidad completa
- ✅ Un comentario por usuario/encuesta enforced a nivel DB y servicio
- ✅ Soft-delete para moderación futura sin pérdida de datos
- ✅ Rank snapshot: los comentarios reflejan el nivel del ciudadano en el momento exacto
- ✅ Migraciones 008–022 verificadas y al día en producción

---

## 🔧 Fixes Críticos de Auth, UI & Password Recovery — 2026-04-14 (commits 27941d6 → cba8f64)

### Problemas Resueltos

#### 1️⃣ **Usuarios Huérfanos en Registro** (Backend)
- **Problema:** Nuevos usuarios creados en `auth.users` pero SIN perfil en `public.users` → login imposible
- **Causa:** `supabase.auth.sign_up()` en cliente service_role sobrescribía sesión interna
- **Fix:** Cliente anon separado para `sign_up()` + service_role intacto para insert
- **Archivos:** `backend/app/core/database.py` (new `get_supabase_anon_async()`), `backend/app/services/auth_service.py`
- **Commit:** `27941d6`

#### 2️⃣ **Flujo de Confirmación de Email Confuso** (Frontend)
- **Problema:** Submit registro → navega inmediatamente a login con "sesión expirada"
- **Causa:** `setTimeout(() => setMode("login"), 4000)` sin discriminar modo de confirmación
- **Fix:** 
  - Registro: queda en formulario mostrando "revisa tu correo" (no navega)
  - Callback: guarda `sessionStorage` flag antes de redirigir
  - Home: NavbarClient detecta flag y abre modal de login limpiamente
- **Archivos:** `frontend/src/components/bunker/AuthModal.tsx`, `frontend/src/app/auth/callback/page.tsx`, `frontend/src/components/bunker/NavbarClient.tsx`
- **Commit:** `840a268`

#### 3️⃣ **Banner de Verificación Invisible/Comprimido** (UI/UX)
- **Problema Desktop:** Banner oculto detrás de navbar (z-index 40 < navbar z-50)
- **Problema Mobile:** Texto comprimido, falta padding, difícil de leer
- **Fix:** 
  - Z-index aumentado: 40 → 45
  - Responsive design con `useEffect` (detecta mobile sin hydration mismatch)
  - Desktop: padding optimizado, layout horizontal
  - Mobile: padding aumentado, font-size +1px, layout vertical stack, botones más grandes
- **Archivos:** `frontend/src/components/shared/BasicUserBanner.tsx`
- **Commit:** `c95d8b4`

#### 4️⃣ **Recuperación de Contraseña Inoperante** (Backend + Supabase Config)
- **Problema:** Enlace del email llegaba con `otp_expired` siempre
- **Causa 1:** Template usaba `{{ .ConfirmationURL }}` — email clients pre-fetchan el link y **consumen el OTP** antes de que el usuario haga click
- **Causa 2:** Backend usaba `service_role` client para `verify_otp()` → 403 Forbidden
- **Fix:**
  - Template Supabase: `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`
  - Backend: `anon_client.auth.verify_otp()` en lugar de `service_role`
- **Archivos:** `backend/app/api/v1/user/auth.py`
- **Commits:** `d0899b5`, `155992a`

#### 5️⃣ **Banner UI — Mejoras de Texto y Apariencia** (Frontend)
- **Cambios:** Texto unificado (mismo mensaje desktop/mobile), apariencia de popup flotante (border-radius, box-shadow, X agrandada), `top: 105px` para alineación con navbar de dos filas
- **Archivos:** `frontend/src/components/shared/BasicUserBanner.tsx`
- **Commits:** `bfa6ed2`, `2b0746a`, `cba8f64`

#### 6️⃣ **Error 23505 en verificación de RUT** (Backend)
- **Problema:** Constraint `users_rut_hash_key` lanzaba excepción no capturada → UI mostraba "Error de conexión"
- **Fix:** try/except en Paso 4 del `verify_rut()` captura código `23505` y retorna mensaje amigable
- **Archivos:** `backend/app/services/identity_service.py`
- **Commit:** `1a9bc6e`

#### 7️⃣ **Modal de verificación no pedía género → rank nunca subía a VERIFIED** (Frontend)
- **Problema:** `_evaluate_rank()` requiere `gender` pero el modal nunca lo recolectaba → `gender: null` → siempre BASIC
- **Fix:** Campo género agregado al modal (select obligatorio), todos los campos marcados con `*`, género incluido en payload a `/profile`
- **Archivos:** `frontend/src/components/bunker/VerifyIdentityModal.tsx`
- **Commit:** `1a9bc6e`

#### 8️⃣ **Edad mínima de verificación corregida** (Frontend)
- **Problema:** Validación aceptaba usuarios desde 14 años
- **Fix:** `CURRENT_YEAR - 14` → `CURRENT_YEAR - 18`
- **Archivos:** `frontend/src/components/bunker/VerifyIdentityModal.tsx`
- **Commit:** `866aa80`

### Impacto

- ✅ Nuevos registros crean perfil correctamente
- ✅ Email confirmation flow sin confusión de UX
- ✅ Banner verificación visible en desktop y legible en mobile
- ✅ Recuperación de contraseña funciona en producción
- ✅ Error 23505 capturado → mensaje claro al usuario
- ✅ Flujo de verificación de identidad completo y funcional → ascenso a VERIFIED operativo
- ✅ Solo mayores de 18 años pueden verificar identidad
- ✅ Sin usuarios huérfanos (requiere SQL manual para casos pre-fix)
- ✅ Zero regressions en otros flujos

### Documentación
Detalles técnicos completos: `docs/FIXES_AUTH_UI_2026_04_14.md`

---

## 🎨 Landing Page — Redesign Home Hero & Cards — 2026-04-13 (commits 4cb0c89, 3e9f7b7)

### Implementado

#### CAMBIO 1 — Consolidación de Cards (6 → 3)
**Archivo:** `frontend/src/app/page.tsx`

| Aspecto | Antes | Después |
|---|---|---|
| Grid | 3x2 (6 cards totales) | 3x1 (3 cards totales) |
| Icono | size 24 | size 28 |
| Padding | p-5 | p-6 |
| Gap | gap-4 | gap-6 |
| Body text | text-xs | text-sm |
| Max-width container | max-w-4xl | max-w-5xl |

**Nuevas Cards:**
1. **"Tu voz, sin filtros"** (Icon: Users, #00E5FF)
   - Content: No existe panel de 1.000 personas elegidas; cualquier ciudadano puede votar, proponer preguntas y definir la agenda.

2. **"Cada voto, una persona real"** (Icon: ShieldCheck, #D4AF37)
   - Content: Tu voto cuenta porque eres real. Verificamos identidad una sola vez, sin bots ni multicuentas.

3. **"Datos de Chile, para todos"** (Icon: BarChart3, #39FF14)
   - Content: Resultados públicos y gratuitos siempre. No trabajamos para empresas, partidos ni gobiernos.

#### CAMBIO 2 — Hero Claims Horizontales
**Archivo:** `frontend/src/components/home/HomeHeroClient.tsx` (lines 60-84)

**Cambio:** Reemplazo del segundo párrafo por nueva sección con 3 claims horizontales

**Antes (líneas 60-75):**
```jsx
{/* Subtítulo */}
<div className={`mx-auto leading-relaxed transition-all ${...}`}>
    <p className="mb-4">
        Beacon es la plataforma...
    </p>
    <p>
        Los datos de opinión pública pertenecen a todos, no a quien los encarga. 
        Por eso publicamos todo, gratis, siempre.
    </p>
</div>
```

**Después (líneas 60-84):**
```jsx
{/* Subtítulo */}
<div className={`mx-auto leading-relaxed transition-all ${...}`}>
    <p className="mb-6">
        Beacon es la plataforma de opinión ciudadana abierta y verificada de Chile. 
        Las encuestadoras tradicionales eligen quién habla por ti — nosotros no. 
        No necesitas que te elijan para que te escuchen. Cada voto cuenta porque 
        cada persona es real. Sin bots, sin multicuentas, sin panel.
    </p>
</div>

{/* 3 Claims Horizontales */}
<div className={`mx-auto transition-all ${
    isAuthenticated ? "mb-8" : "mb-10"
}`} style={{ color: "rgba(255,255,255,0.5)" }}>
    <p className="text-sm tracking-wider font-mono">
        Sin clientes votantes ocultos 🙈 <span className="mx-2">|</span> 
        Datos públicos siempre <span className="mx-2">|</span> 
        Gratis para las personas
    </p>
</div>
```

**Cambios específicos:**
1. Eliminado segundo párrafo ("Los datos de opinión pública...")
2. Aumentado spacing del primer párrafo: `mb-4` → `mb-6`
3. Reducido márgenes inferiores del contenedor: `mb-10` → `mb-8` para authenticated
4. Agregada nueva sección "3 Claims Horizontales" con:
   - Styling: `text-sm tracking-wider font-mono` (monospace, compacto)
   - Color: `rgba(255,255,255,0.5)` (gris muted)
   - Separadores: `<span className="mx-2">|</span>` con spacing
   - Responsive margins: `mb-8` (authenticated) / `mb-10` (no authenticated)
5. Claims: "Sin clientes votantes ocultos 🙈 | Datos públicos siempre | Gratis para las personas"
6. Posición: Entre párrafo hero principal y bloque de CTA buttons

#### CAMBIO 3 — EN VIVO Badge & Stats (Sin cambios)
✅ EN VIVO badge: Sin modificaciones  
✅ Stats footer: Sin modificaciones

### QA/Testing
- ✅ Build sin errores
- ✅ Responsive: desktop (2 cols), mobile (stacked)
- ✅ Visual hierarchy: cards más destacadas, spacing mejorado
- ✅ Typography: 28px icons, improved body text size

### Commits
- **4cb0c89**: `feat(frontend): redesign home page layout — consolidate cards and claims`
- **3e9f7b7**: `docs: document pending comparison section for landing page`

---

## 📚 Documentation — Pending Features
**Archivo nuevo:** `docs/LANDING_PAGE_PENDING.md`

Especificación completa para implementación futura (P3):
- **Sección Comparativa:** "Encuestadoras Tradicionales vs Beacon"
- **Layout:** 2 columnas lado a lado, responsive mobile
- **Contenido:** 4 ítems negados (✗) vs 4 ítems afirmados (✓)
- **Ubicación:** Entre hero y cards de diferenciadores
- **Estilos:** Especificados (colores, bordes, fondos)

Actualizado también:
- `ROADMAP_LOG.md` → Agregado en sección "Pendiente"
- Memory personal → Referencia `pending_comparison_section.md`

---

## 🏗️ Architecture Refactor — Polls Table Cleanup — 2026-04-13 (commit 9be4797)

### Implementado

#### Problem
La tabla `polls` tenía columnas redundantes que pertenecían a PREGUNTAS, no a encuestas:
- `scale_min`, `scale_max` → Configuración de escala (por pregunta)
- `poll_type`, `options` → Tipo y opciones (por pregunta)

**Razon del problema:**
- Una encuesta PUEDE tener MÚLTIPLES preguntas
- Cada pregunta tiene su propia config (type, options, scale_min, scale_max, scale_labels)
- Esas columnas eran solo cache/retrocompatibilidad de la PRIMERA pregunta
- Arquitectura confusa = múltiples fuentes de verdad

#### Solución: Eliminadas columnas redundantes
**Migration 021**
```sql
ALTER TABLE polls DROP COLUMN scale_min;
ALTER TABLE polls DROP COLUMN scale_max;
ALTER TABLE polls DROP COLUMN poll_type;
ALTER TABLE polls DROP COLUMN options;
```
- Sin pérdida de datos (todo preservado en `questions[]` JSONB)
- Admin ya leía correctamente de `questions` → No afectado

**Backend updates**
- `polls_admin.py`: Removidos INSERT de scale_*/poll_type/options
- `endpoints/polls.py`:
  - `vote_poll()`: Lee type/options/scale de `questions[0]`
  - `get_poll_crosstabs()`: Lee de `questions[question_index]`
  - Eliminados fallbacks a `poll["poll_type"]`, `poll["options"]`, etc.

#### Resultado
✅ Polls table = container de metadatos solamente  
✅ Questions JSONB = single source of truth para config  
✅ Preparado para multi-question polls futuro  
✅ Admin funciona sin cambios (ya leía de questions)

---

## 🎨 UX/Navigation Hotfix — 2026-04-13 (commit a5cdfc1)

### Implementado

#### Frontend — Mejoras de legibilidad y contexto
| Cambio | Antes | Después |
|---|---|---|
| Título principal (h1) | `text-xl sm:text-2xl` | `text-2xl sm:text-3xl` |
| Descripción | fontSize 13, opacity 0.45 | fontSize 14, opacity 0.55, fontWeight 500 |
| Fecha cierre | fontSize 10, opacity 0.2 | fontSize 11, opacity 0.35 |
| Pregunta individual | fontSize 15 | fontSize 16 |
| Botones escala | 44-46px | 48-50px (mejor para touch) |
| Espaciado escala | gap 6-8px | gap 8-10px |

#### Contexto repositionado
- **Antes:** Al final de la página (debajo de resultados)
- **Después:** Debajo de la fecha de cierre (usuario lo ve primero)
- Mejor legibilidad: fontSize 13→14, headers más prominentes

#### Scale labels (etiquetas multi-punto)
- Agregado campo `scale_labels?: string[]` a interfaz `QuestionDef`
- Renderización debajo de cada botón numérico:
  - MultiQuestionForm: labels centrados bajo cada punto
  - SingleQuestionVote: misma lógica visual
- Ejemplo: escala 1-7 con ["Muy pesimista", "Pesimista", "Algo pesimista", "Neutral", "Algo optimista", "Optimista", "Muy optimista"]

#### Bugfix — Navegación en /encuestas
- **Problema:** Links desde `/encuestas` usaban UUID (`/encuestas/[id]`) → "no encontrada"
- **Causa:** PollItem interface no tenía `slug`, href usaba `poll.id`
- **Fix:** Agregué `slug` a interfaz + cambié href a `${poll.slug}`
- Ahora consistente con home page (ambas navegan por slug humanizado)

### QA/Testing
- ✅ Build sin errores
- ✅ Navigation funcional: `/encuestas` → `/encuestas/{slug}`
- ✅ Consistencia visual en escalas multi-opción
- ⏳ Testing en production: [beaconchile.cl/encuestas](https://www.beaconchile.cl/encuestas)

---

## 🚀 Sprint 2026-04-12 — Polls como entidades propias (commit a403295)

### Implementado y desplegado

#### DB — Migración 011 (ejecutada en Supabase)
- `slug` TEXT UNIQUE — URL canónica `/encuestas/{slug}`
- `status` TEXT — ciclo `draft → active ⇄ paused → closed`
- `is_featured` BOOLEAN — control manual del hero del home
- `context` TEXT — texto contextual visible en la página pública
- `source_url` + `tags[]` — metadatos para agentes de contenido
- Índices: `polls_slug_unique_idx`, `polls_status_idx`, `polls_featured_status_idx`
- Migración automática de registros existentes (2 polls → status `closed`)

#### Backend — Nuevos endpoints
| Endpoint | Descripción |
|---|---|
| `GET /polls/featured` | Lógica mixta: `is_featured=true` primero, fallback a más votada 24h |
| `GET /polls/by-slug/{slug}` | Lookup por slug para páginas `/encuestas/[slug]` |
| `GET /polls?status=&limit=` | Filtra por ciclo de vida (activas, cerradas, draft, pausadas) |
| `POST /admin/polls` | Acepta slug, status, is_featured, context, source_url, tags; auto-genera slug |
| `PATCH /admin/polls/{id}` | Actualiza todos los campos nuevos; sincroniza `is_active` con `status` |

#### Frontend
- `/encuestas/[slug]` — OG dinámico con votos en vivo (`4.821 votos · descripción`)
- `EncuestaDetailClient` — fetch por slug (`/polls/by-slug/`), vote por UUID, share por slug
- `PollsHeroSection` — consume `/polls/featured` (lógica mixta)
- `PollCard`, `TrendingPollsSection`, `PollsByCategorySection`, `ClosedPollsSection` — usan `slug || id`
- Sección **Contexto** en detalle: muestra `context`, `source_url` y `tags`
- `PollCommentsSection` — ✅ Implementado (2026-04-14): tabla `poll_comments` + RLS, endpoints GET/POST/DELETE `/api/v1/polls/{id}/comments`, frontend conectado al backend real. Un comentario activo por usuario/encuesta; soft-delete para moderación; rank snapshot inmutable.

#### Brand
- Nuevo logo `logo.png` + favicon actualizados en Navbar y AuthModal
- Assets legacy eliminados (`LogoBeaconCian.png`, etc.)
- `/entities` en modo "En Construcción" con CTA a encuestas

#### Formato JSON canónico para agentes
```json
{
  "slug": "aprobacion-presidente-abril-2026",
  "question": "¿Aprueba la gestión del Presidente?",
  "category": "politica",
  "options": [{"label": "Apruebo", "value": "apruebo"}, ...],
  "context": "Encuesta mensual...",
  "source_url": "https://...",
  "scheduled_at": "2026-04-14T10:00:00Z",
  "closes_at": "2026-04-21T23:59:59Z",
  "tags": ["gobierno", "aprobación"]
}
```

### Pendiente (próxima iteración)
- [ ] **UI: Sección comparativa "Encuestadoras Tradicionales vs Beacon"** en landing page
  - Ubicación: entre hero completo y cards de diferenciadores (3 cards existentes)
  - Estructura: 2 columnas lado a lado, separador visual central
  - Columna izquierda: "ENCUESTADORAS TRADICIONALES" con 4 ítems negados (✗ rojo apagado)
  - Columna derecha: "BEACON" con 4 ítems afirmados (✓ color accent)
  - Responsive: apilado vertical en mobile, Beacon arriba
  - Detalles de contenido y estilos en `docs/LANDING_PAGE_PENDING.md`

- [x] Backend de comentarios persistidos → ✅ implementado 2026-04-14 (ver sección abajo)
- [x] Admin UI para carga de encuestas JSON desde agentes → `publish_polls.py`
- [x] Cargar primeras encuestas reales de agentes de cowork → cargadas 12/04/2026

---

## 🚀 Sprint 2026-04-12 — Pipeline de Agentes + Nuevas Categorías

### Implementado

#### Backend — `QuestionDef` extendido
- `scale_points` (int 2–10): número de puntos de escala por pregunta
- `scale_labels` (array): etiqueta por cada punto (antes se perdían silenciosamente)
- Retrocompatibilidad: `scale_min_label`/`scale_max_label` siguen funcionando
- Categorías nuevas: `seguridad`, `justicia` (backend + ambos frontends)

#### Script `publish_polls.py`
- Lee payloads `.md` del pipeline AGENTE_05 y los publica en `POST /admin/polls`
- Transforma automáticamente: `single_choice → multiple_choice`, `duration_days → starts_at/ends_at`, `is_active → status`
- Dry-run mode, manejo de errores por poll, audit trail en consola

#### Encuestas publicadas (primera carga real de agentes)
| ID | Tema | Categoría | Score |
|----|------|-----------|-------|
| POLL-003-A | Economía chilena abril 2026 | economia | 96% |
| POLL-005-A | Seguridad pública | seguridad | 84% |
| POLL-014-C | Corrupción institucional | justicia | 86% |

#### Documentación
- `docs/apis.md` → sección 13 "Admin — Polls" + pipeline publish_polls.py

---

## 🎯 Decisión Estratégica — 2026-04-12: Encuestas como Feature Principal

### Contexto
Entities (`/entities`) requiere completitud de datos constante para dar valor, tiene baja viralidad y engagement pasivo. Las encuestas ciudadanas funcionan Day 1, generan interacción activa y tienen alto potencial de viralidad.

### Decisión
- **`/entities`** pasa a modo **"En Construcción"** indefinidamente (hasta consolidar encuestas).
- **Encuestas** son el feature principal del producto: hero section, trending, por categoría, y resultados.
- El home elimina los grids de entities (elimina 4 fetches al backend → mejora cold-start).

### Cambios implementados (2026-04-12)
- [x] `frontend/src/app/entities/page.tsx` → pantalla "En Construcción" con CTA a encuestas
- [x] `frontend/src/app/page.tsx` → eliminados grids Personajes/Empresas/Políticos + fetches asociados
- [x] `frontend/src/components/bunker/NavbarClient.tsx` → badge 🚧 en "Directorio" (desktop + mobile)
- [x] Home queda: Hero → Por qué Beacon → **Encuesta Hero** → Trending → Por Categoría → Resultados Cerrados → VS del Momento → Stats footer

### Criterio de retorno a entities
Retomar cuando:
1. El flujo de encuestas esté consolidado con +500 usuarios activos
2. Exista un sistema de carga masiva de entities (scraping + curación)
3. Se defina el modelo de datos final (fusión con polls de instituciones)

---

## 🔄 Reencuadre Estratégico — 2026-04-06

### Decisión central
Beacon cambia su identidad pública de "Motor de Integridad Digital / Protocolo" a **"Primera plataforma de opinión ciudadana abierta y verificada de Chile"**.

El producto no cambia. El énfasis sí: la verificación antimanipulación es el mecanismo, no el protagonista. El protagonista es la voz ciudadana.

### Manifiesto Beacon v4 (adoptado oficialmente)

> Beacon es la primera plataforma de opinión ciudadana abierta y verificada de Chile.
>
> Cualquier persona puede votar. Cualquier persona puede ver los resultados. Siempre gratis, sin excepción.
>
> No tenemos panelistas seleccionados ni clientes que definan las preguntas. Las preguntas las propone y elige la propia ciudadanía — con moderación mínima, solo para filtrar spam y discurso de odio, nunca por contenido político.
>
> Cada voto que cuenta está vinculado a una identidad real, verificada una sola vez con documento oficial — sin revelar quién eres, solo que existes. Un ser humano, una voz.
>
> No pretendemos predecir elecciones. No trabajamos para partidos ni gobiernos; trabajamos de cara a la ciudadanía y publicamos todo, sin filtros ni agenda.
>
> **Opinión verificada. Poder ciudadano.**

### Modelo de usuario simplificado (reemplaza sistema de tiers)

| Estado | Descripción | Peso en informes |
|---|---|---|
| **No verificado** | Registrado con email/contraseña | 0.5 — aparece en conteo público, no en informes oficiales |
| **Verificado** | RUT entregado y validado (Módulo 11 + hash) | 1.0 — cuenta en todos los informes |

**Los tiers BRONZE / SILVER / GOLD / DIAMOND quedan eliminados de la UI y del modelo público.** El sistema ACM interno puede mantenerse simplificado, pero no se expone al usuario.

### Reglas de participación ciudadana

- **Proponer preguntas:** solo usuarios verificados (RUT)
- **Upvotear propuestas:** solo usuarios verificados
- **Votar en encuestas:** cualquier usuario registrado (verificado o no)
- **Moderar contenido:** equipo Beacon — solo por spam/hate speech, nunca por sesgo político. Criterios de moderación deben ser públicos y escritos.

### Modelo de negocio definido

- Votar y ver resultados: **siempre gratis, sin excepción**
- **B2B Analytics:** medios, gobierno, empresas pagan por análisis segmentado. Las preguntas son siempre públicas — el cliente compra análisis, no control.
- **Informes B2B:** bajo demanda
- **Producto corporativo (encuestas para trabajadores):** pendiente, marca separada, no tocar hasta consolidar Beacon ciudadano.

### Competidores directos identificados
Cadem y Criteria. Diferenciador clave: panel cerrado y opaco vs. plataforma abierta con identidad verificada.

---

## 🔲 Backlog Estratégico — Post Reencuadre

### RE-1 — Limpieza de sistema de tiers [PRIORIDAD ALTA]
- [ ] Eliminar BRONZE/SILVER/GOLD/DIAMOND del frontend (UI, labels, EntityCard borders, VerdictButton texts)
- [ ] Simplificar ACM a modelo binario verificado/no-verificado
- [ ] Actualizar pesos de voto: eliminar multiplicadores (1x, 1.5x, 2.5x, 5x) → reemplazar por 0.5 (no verificado) / 1.0 (verificado)
- [ ] Limpiar `backend/app/services/monetization/` o redefinir su alcance
- [ ] Archivar documentación de tiers (no eliminar — referencia histórica)

### RE-2 — Reencuadre de UI/Copy [PRIORIDAD ALTA]
- [ ] Home hero: reemplazar "Motor de Integridad Digital" y "Protocolo" por copy del manifiesto
- [ ] Eliminar lenguaje técnico del primer contacto ("ANTIBOT Activo", "audita tu comportamiento", "Bots Silenciados", "Integrity Index")
- [ ] Subir tono de convocatoria ciudadana en hero
- [ ] Sección "Por qué Beacon" (manifiesto destilado en 3 bullets) — debe vivir en el sitio
- [ ] Jerarquía de navegación: Encuestas como sección principal
- [ ] Copy para usuario no verificado al votar: "Tu voto aparece en el conteo público, pero solo los votos verificados cuentan para las estadísticas oficiales"

### RE-3 — Feature: Propuesta ciudadana de preguntas
- [ ] Backend: endpoint `POST /api/v1/encuestas/proponer` — solo usuarios verificados
- [ ] Backend: endpoint `POST /api/v1/encuestas/{id}/upvote` — solo usuarios verificados
- [ ] Frontend: flujo de propuesta + lista de propuestas con upvotes
- [ ] Panel de moderación en Overlord Dashboard

### RE-4 — Informes B2B bajo demanda
- [ ] Definir estructura del informe (campos, filtros, formato)
- [ ] Endpoint de generación bajo demanda
- [ ] UI mínima de solicitud (formulario de contacto o área privada)

---

## 📊 Resumen de Estado

| Fase | Estado | Progreso |
|---|---|---|
| **Fase 1** — Auth e Identidad | ✅ BLINDADA | █████████████ 100% |
| **Fase 1.5** — ACM + Auth Modal | ✅ BLINDADA | █████████████ 100% |
| **Fase 2** — Territorio + Valor | 🔄 EN CURSO | ████████████░ 90% |
| **Fase 3** — Tiempo Real + 2FA SMS | 🔄 PENDIENTE | ░░░░░░░░░░░░░ 0% |

---

## ✅ Hitos Alcanzados — Fase 1

### 1. Infraestructura Base
- [x] Scaffolding FastAPI async con estructura de producción
- [x] Integración de Supabase con esquemas iniciales (`001_initial_schema.sql`, `002_entities_schema.sql`)
- [x] Sistema de `audit_logs` inmutables con `AuditBus` (trazabilidad forense)
- [x] Configuración centralizada con Pydantic Settings (`.env` → `config.py`)

### 2. Seguridad de Entrada
- [x] **DNA Scanner** — Clasificación de tráfico: `HUMAN` / `SUSPICIOUS` / `DISPLACED`
- [x] Detección de User-Agents de Data Centers (bots, scrapers)
- [x] Detección de ISPs conocidos de cloud (AWS, GCP, Azure, DigitalOcean)

### 3. Panic Gate Extreme
- [x] Sistema de emergencia global con 3 estados: 🟢 `GREEN` / 🟡 `YELLOW` / 🔴 `RED`
- [x] Propagación de nivel de seguridad vía Redis en **< 2ms**
- [x] Modo degradado fail-safe: sin Redis → defaults a `YELLOW` (protección moderada)
- [x] Inyección de Redis en startup de FastAPI con cierre limpio en shutdown
- [x] CAPTCHA adaptativo según nivel + DNA Score del visitante

### 4. Identidad Forense
- [x] Hashing de RUT con **SHA-256 + SALT dinámica** desde `settings.RUT_HASH_SALT`
- [x] Formato: `SHA-256(salt:RUT_NORMALIZADO)` — RUT real **nunca almacenado**
- [x] Validación Módulo 11 para dígito verificador chileno
- [x] Detección de colisiones (multicuenta) sin revelar dato original
- [x] Patrón de **Silencio Estratégico**: errores genéricos sin detalles técnicos al exterior
- [x] 12 tests funcionales verificados (propagación, determinismo, irreversibilidad, colisiones)

### 5. Cerebro Matemático
- [x] Motor de ranking bayesiano con **Shrinkage estadístico**
- [x] Factor de volumen: $\sqrt{N/100}$ para ponderar entidades con más votos
- [x] Pivot Axis Engine: fórmula de ranking adaptativa por `entity_type`
- [x] Sponsor por segmento (`BANCO` → `financial_premium`, `FESTIVAL` → `entertainment_premium`)

### 6. UI Dark Premium
- [x] Frontend en Next.js 16.1.6 con Tailwind 4 y estética de terminal financiera
- [x] Selector de categorías universal (5 tabs, sub-filtros dinámicos, URL params)
- [x] EntityCard con bordes dinámicos por rango (Bronze → Silver → Gold → Diamond)
- [x] TruthMeter circular SVG con `integrity_index` y label "AUDITADO POR BEACON PROTOCOL"
- [x] VerdictButton con 4 estados + explosión de partículas doradas en Gold
- [x] Dashboard Sovereign con semáforo de seguridad (Green/Yellow/Red)
- [x] Animaciones `fadeInUp` staggered para transiciones de categoría
- [x] Fix Suspense en `page.tsx` para compatibilidad con static prerendering

### 7. Matriz de Control de Acceso (ACM) — Fase 1.5
- [x] **access_control_matrix.py** — ACM JSONB centralizada con herencia recursiva
- [x] Cadena: `ANONYMOUS → BRONZE → SILVER → GOLD → DIAMOND`
- [x] `resolve_permissions()` con deep merge automático
- [x] `enforce_permission()` registra `SECURITY_AUTH_DENIED` en audit_logs
- [x] `check_permission()` y `get_voting_config()` para consultas rápidas
- [x] **27 tests ACM** — herencia, permisos, pesos de voto, auditoría

### 8. Auth Modal — "La Puerta del Búnker"
- [x] **AuthModal.tsx** — Login/Registro con estética Dark Premium
- [x] Backdrop-blur + animación fade-in-scale (cubic-bezier)
- [x] Bordes Cian `#00E5FF` (foco) + Oro `#D4AF37` (campos RUT)
- [x] Validación local RUT Módulo 11 con feedback visual inmediato
- [x] Registro extendido: full_name, email, commune, region, age_range
- [x] **NavbarClient.tsx** adaptativo (nombre+rango si logueado, botón si anónimo)
- [x] **usePermissions hook** — ACM espejo frontend con herencia + multi-tab sync

### 9. Visibilidad Diferenciada
- [x] Entity page: overlay blur(6px) + 🔒 sobre sliders para anónimos
- [x] Click en zona bloqueada → abre AuthModal ("Tu voz requiere identidad")
- [x] Indicador territorial dorado solo si usuario está autenticado
- [x] `IDENTITY_REGISTRATION_ATTEMPT` en audit_logs por cada registro

---

## ✅ Hitos Alcanzados — Fase 2 (Estabilización MVP)

### 1. Infraestructura y Base de Datos
- [x] Configuración de Supabase Transaction Pooler (puerto 6543) para ruteo de red en IPv4.
- [x] Reducción de I/O y bloqueo de conexiones directas (Zero Waste a nivel TCP).

### 2. Seguridad Perimetral y Autenticación
- [x] Flujo delegado: DNA Scanner → Supabase Auth (`sign_up`/`sign_in`) → RBAC JWT Inyectado.
- [x] Identidad Forense: Hashing inmutable de RUT vía `rut_validator.py` (Módulo 11 + SHA-256) en tiempo de vuelo.
- [x] **Confirmación de Email** (`2026-03-09`): Cambio de `admin.create_user(email_confirm=True)` → `sign_up()` real con `email_redirect_to`. Supabase ahora envía email real al usuario.
  - Nuevo endpoint `POST /api/v1/user/auth/confirm-email` — verifica token OTP.
  - Nueva página `/auth/callback` en Next.js — receptor del token con estados verificando/éxito/error.
  - Template HTML con marca BEACON (dark premium, botón dorado/púrpura).
  - Supabase Dashboard configurado: "Confirm email" activado + Redirect URLs (`localhost:3000`, `beaconchile.cl`, `vercel.app`).
  - `FRONTEND_URL=https://www.beaconchile.cl` en `config.py` y `.env`.
  - `AuthModal.tsx` mejorado: mensaje claro post-registro + error específico si email no está confirmado.

### 3. Ingeniería Civil (Lógica de Votaciones MVP)
- [x] Aislamiento de categorías: `POLITICO` vs `PERSONA_PUBLICA` diferenciando roles.
- [x] Implementación de **Pivot Axis Engine** para evaluación de políticos (Transparencia, Gestión, Coherencia).
- [x] **Fricción Inteligente Anti-Brigada**: Freno a ráfagas coordinadas (< 3.0s con 1.0 base) requiriendo "Hechos Concretos".
- [x] **Endpoint de Votación Bayesiano** — `POST /api/v1/entities/{entity_id}/vote` (`votes.py`).
  - Fórmula: `score = (m·C + Σ_votos) / (m + n)` con m=30, C=3.0.
  - Actualiza `reputation_score` + `total_reviews` en Supabase atómicamente.
  - Requiere JWT autenticado (mínimo BASIC).

### 4. Garantía Zero-Waste & Async Purity
- [x] Inspección async en controladores de FastAPI y delegación I/O al Transaction Pooler.
- [x] Limpieza extrema de logs y redundancias técnicas dictaminadas.

### 5. Despliegue a Producción (www.beaconchile.cl)
- [x] Deploy en Render (backend) + Vercel (frontend) — dominio custom `www.beaconchile.cl` activo.
- [x] **CORS fix**: `CORS_ORIGINS` actualizado en Render Dashboard para incluir `https://www.beaconchile.cl`.
  - Diagnóstico: `render.yaml` NO actualiza automáticamente servicios existentes → configuración manual obligatoria.
- [x] `vercel.json` con `NEXT_PUBLIC_API_URL` hardcodeado para evitar variables de entorno en Vercel.

### 6. Home Page — Server Component + ISR
- [x] Conversión de `page.tsx` de `"use client"` a **Server Component** async.
- [x] `export const revalidate = 60` — Vercel cachea datos, usuarios nunca ven Render en estado frío.
- [x] Fetches paralelos con `Promise.all` para 4 categorías (políticos, empresas, periodistas, todas).
- [x] Eliminado spinner de carga — datos listos en SSR, UX instantánea.

### 7. UI Refinements (Post-Despliegue)
- [x] **VerdictButton**: Estado `idle → loading → voted | error` con feedback visual por rango.
  - BRONZE: botón verde + "✓ Voto Registrado" al confirmar.
  - GOLD/DIAMOND: texto "Veredicto Magistral Registrado" + partículas doradas al click.
  - Deshabilitado tras votar (previene doble submit en la misma sesión).
- [x] **Entity page**: Estado de sliders levantado al padre (`onValuesChange`); voto real a la API con JWT.
  - Actualización optimista del score en pantalla tras voto exitoso.
- [x] **Navbar**: Separador vertical `|` + texto de usuario más visible (`text-xs font-mono`) + borde dorado en badge de rango.
- [x] Eliminado botón "Generar Reporte de Verdad de Mercado" (era stub sin backend).

### 9. Revisión General del Proyecto (`2026-03-09`)
- [x] Relevamiento completo de estado: fases, endpoints, componentes y deuda técnica.
- [x] Detectado: `reputation_score` y `total_reviews` hardcodeados a 0 en `entities.py` (no lee desde DB).
- [x] Detectado: `scrapers/` vacío — solo existe README, pendiente implementación.
- [x] MEMORY.md y ROADMAP_LOG.md actualizados con estado actual completo.

### 8. Dual-Role Admin Access
- [x] Implementar lógica en el Login para usuarios con rol ADMIN. Al autenticarse, el sistema debe presentar un 'Intersticial de Rol' que permita elegir entre:
  - **Admin Mode:** Acceso total al Overlord Dashboard y gestión sistemática.
  - **User Test Mode:** Acceso a la interfaz de usuario con privilegios máximos (Rango Diamond automático) para validación de funcionamiento y pruebas de UX.

> **CREDENCIALES DE PRUEBA PERMANENTES:**
> - **[ADMIN]** `overlord2026@beacon.com` / `OverlordPassword2026*` (Rango: DIAMOND, Rol: ADMIN)
> - **[USER]** `ciudadano2026@beacon.com` / `CiudadanoPassword2026*` (Rango: BRONZE, Rol: USER)
> - **[USER]** `beacon@testdesarrollo.cl` / `Password#2026` (Rango: BRONZE, Rol: USER)

---

## ✅ Sprint 2026-03-10/11 — Blindaje Total (P0 + P1 + P2)

> **Commits:** `7c36282` (P0) · `6fead90` (P1) · `249bd6f` (P2) · `78dc9dd` (merge) · `512eb25` (lint)
> **Migraciones aplicadas en producción:** `012`, `013`

### P0 — 6 bugs críticos resueltos

| PR | Archivo | Fix |
|----|---------|-----|
| PR-1 | `votes.py` | Lee `VOTE_WEIGHT_{rank}` desde `config_params`. La meritocracia es real. Fallback a `1.0` si Redis/DB no responde |
| PR-2 | `votes.py` | `background_tasks.add_task(publish_verdict_pulse, ...)` tras UPDATE exitoso. WebSockets reciben datos |
| PR-3 | `auth.py` | Eliminados `commune=` y `region=` del callsite. `PUT /profile` ya no lanza `TypeError` al 100% de las llamadas |
| PR-4 | `audit_logger.py` | `alog_event()` convertido a `async` — ya no bloquea el event loop. 9 call sites actualizados en `entities_admin.py` e `identity_service.py` |
| PR-5 | `entities.py` | Eliminados `"is_verified": True` y `"rank": "BRONZE"` hardcodeados en `list_entities` y `get_entity` |
| PR-9 | `migrations/012_*.sql` | `ADD COLUMN IF NOT EXISTS` para todas las columnas reales de `entities`. Idempotente |

### P1 — Demo data, performance y arquitectura

| PR | Archivo | Fix |
|----|---------|-----|
| PR-6 | `aum_endpoint.py` | Sin demo data. Retorna 503 si Supabase falla. Response incluye `source: "SUPABASE_LIVE"` |
| PR-7 | `stats_endpoint.py` | `entity_reviews` usa `count="exact"` + `limit(0)` → PostgREST retorna solo el COUNT. Cero filas traídas a Python |
| PR-8 | `database.py` | `AsyncClient` singleton — `get_async_supabase_client()` reutiliza la misma instancia. `init_async_client()` para startup explícito |
| PR-10 | `main.py` | `@app.on_event` eliminado. `lifespan` context manager gestiona startup/shutdown. Inicializa el singleton en arranque |

### P2 — Decay temporal y roadmap

| PR | Archivos | Detalle |
|----|---------|---------|
| PR-11 | `vote_engine.py` | No eliminado — tiene 13 tests + shadow mode + bonus territorial. Anotado como ROADMAP P3 |
| PR-12 | 5 archivos nuevos | Decay job completo (ver tabla abajo) |

**Componentes del PR-12 (Decay):**

```
backend/
├── migrations/013_add_last_reviewed_at_to_entities.sql
│   └── ADD COLUMN last_reviewed_at + índice para el job
├── app/core/decay/reputation_decay.py
│   └── compute_decayed_score() + ReputationDecayJob (dry_run, batch, audit)
├── app/api/v1/admin/decay_endpoint.py
│   ├── GET  /admin/decay/preview  → dry-run visual
│   └── POST /admin/decay/run      → aplica decay
└── scripts/run_decay.py
    └── Ejecutable cron: 0 3 * * * python scripts/run_decay.py
```

**Fórmula de decay:**
```
new_score = C + (old_score − C) × e^(−ln2 × elapsed_days / half_life)
C = 3.0 (prior Bayesiano) · half_life = DECAY_HALF_LIFE_DAYS (config_params, default 180d)
```

A los 180 días: un 5.0 decae a 4.0. A los 360 días: a 3.5. Converge a 3.0 (neutral perpetuo).

---

## 🔲 Pendientes Críticos — Fase 2 (Cierre MVP)

### P3 — VS/Versus
- [x] Backend: `GET /api/v1/versus` + `POST /api/v1/versus/{id}/vote` con tabla `versus_votes` (votos de evento, no afectan `reputation_score` permanente). **Código implementado, tests pendientes.**
- [x] Frontend: página `/versus` con UI head-to-head — dos entidades lado a lado, votación simultánea. **En desarrollo.**

### P4 — Páginas de Sección con Filtros
- [ ] `/politicos`, `/empresas`, `/periodistas` — cada una con filtros propios: región, comuna, partido, búsqueda.
- [ ] Backend: endpoint `/entities` con sort por `reputation_score DESC` (actualmente ordena por `updated_at`).

### P3 — Polls / Encuestas Ciudadanas
- [x] Backend: `GET /api/v1/polls`, `POST /api/v1/polls`, `POST /api/v1/polls/{id}/vote` con tabla `polls` y `poll_votes`. **Código implementado, en desarrollo activo.**
- [x] Frontend: páginas `/app/polls`, `/app/admin/polls` con creación y votación. **En desarrollo.**
- [ ] Tests unitarios/integración para polls endpoints.
- [ ] Documentación API completa en docs/apis.md.

### P3/P4 — Events
- [x] Backend: `GET /api/v1/events`, `POST /api/v1/events/{id}/vote` con tabla `events` y `event_votes`. **Código implementado.**
- [x] Frontend: páginas `/app/events` con participantes y votación. **En desarrollo.**
- [ ] Tests para events endpoints.

### P5 — Verificación de Identidad RUT (BASIC → VERIFIED)
- [ ] `POST /api/v1/user/auth/verify-identity` — ascenso de rango tras validación RUT Módulo 11.
- [ ] Frontend: flujo de upgrade en perfil de usuario.

### Recovery Flow
- [ ] Servicio de recuperación de credenciales ('Olvidé mi contraseña') vía tokens firmados por email, integrado con Supabase Auth + audit_logs.

> ⚠️ **SMTP rate limit Supabase gratuito** — máx. ~3 emails/hora. Para producción configurar Resend SMTP:
> Supabase → Authentication → Email → SMTP Settings. Host: `smtp.resend.com`, Port: `465`, User: `resend`, Pass: API Key de Resend.

### Anti-Brigada (Rate Limiting en Votos)
- [ ] Un voto por usuario por entidad — tabla `entity_reviews` para trazabilidad de votos por usuario.
- [ ] Rate limiting en `POST /vote`: mínimo 3s entre votos; máx. N votos por hora.
- [ ] `is_local_vote` — lógica de detección de brigadas coordinadas por análisis geográfico.

### Mina de Oro
- [ ] `user_asset_calculator.py` — valuación interna en USD de la base de datos por densidad demográfica. **Solo uso interno** (futuro, no exponer al usuario). No forma parte del modelo público de Beacon.

### Efecto Kahoot
- [ ] WebSockets para actualizaciones de rankings en tiempo real y 'Gold Explosions'.

### Zona de Desplazados
- [ ] Reforzar aislamiento y logs en `forensics/displaced/` para capturar patrones de bots.

### Deuda Técnica
- [ ] `identity_service.py`: columnas antiguas (`commune`, `region` como text) → migrar a `comuna_id` FK.
- [ ] `create_admin.py` / `create_test_users.py`: referencian columnas eliminadas (`hashed_password`, `password_history`) — requieren actualización.
- [ ] `entities.py (list_entities + get_entity)`: `reputation_score` y `total_reviews` hardcodeados a 0 — deben leer campos reales desde Supabase.

---

## 🔲 P6 — Scraping & Enrichment de Entidades

> **Objetivo:** Llenar los campos faltantes de la tabla `entities` usando scripts automatizados con Playwright y fuentes pública verificables.

### Estrategia de Fuentes

| Campo objetivo | Fuente primaria | Fuente secundaria |
|---|---|---|
| `photo_path` | Cámara.cl / Senado.cl | Wikipedia (imagen infobox) |
| `bio` | BCN (Biblioteca del Congreso) | Wikipedia (primer párrafo) |
| `position` | BCN + Cámara | Manual |
| `party` | BCN / Servel | Wikipedia |
| `district` / `region` | Cámara / Senado | BCN |
| `official_links` | Sitio oficial, Twitter/X, LinkedIn | Manual |

### Scripts a Implementar en `scrapers/`

- [ ] `scrapers/bcn_scraper.py` — Extrae bio, partido, cargo desde [bcn.cl](https://www.bcn.cl/)
- [ ] `scrapers/camara_scraper.py` — Extrae foto oficial, distrito, región desde [camara.cl](https://www.camara.cl/)
- [ ] `scrapers/senado_scraper.py` — Foto y datos de senadores desde [senado.cl](https://www.senado.cl/)
- [ ] `scrapers/wikipedia_scraper.py` — Foto de infobox + bio resumida desde Wikipedia ES
- [ ] `scrapers/photo_downloader.py` — Descarga imágenes a Storage Supabase o carpeta `public/`
- [ ] `scrapers/enrichment_runner.py` — Orquestador: itera `entities` sin foto/bio y llama scrapers

### Reglas Operativas (Directives 2026)
- Todo dato insertado debe incluir `source_url` y `last_scraped_at`
- Cambios drásticos se marcan para Revisión Humana antes de commitear
- NUNCA insertar sin validación de integridad previa
- Rate limiting entre requests (mín. 2s entre páginas)

---

## 🔲 Fase 3 — Artillería Forense

### Verificación de Identidad SMS (2FA)
- [ ] Integración con proveedor de SMS para envío de códigos OTP
- [ ] Flujo de ascenso: BASIC → VERIFIED requiere verificación SMS
- [ ] Rate limiting anti-abuso (máx. 3 intentos por hora)
- [ ] `IDENTITY_SMS_VERIFIED` en audit_logs al completar verificación

---

## 🔗 Archivos Clave del Búnker

| Módulo | Archivo | Función |
|---|---|---|
| Seguridad | `panic_gate_extreme.py` | Botón Rojo + Redis |
| ACM | `core/auth/access_control_matrix.py` | Permisos con herencia |
| Auth | `AuthModal.tsx` | Login/Registro Dark Premium |
| Hook | `usePermissions.ts` | ACM espejo frontend |
| Identidad | `rut_validator.py` | Hash forense con salt |
| Ranking | `integrity_engine.py` | Bayesian Shrinkage |
| Pivot | `pivot_axis_engine.py` | Fórmula adaptativa |
| Tests | `test_access_control_matrix.py` | 27 tests ACM |
| Tests | `test_redis_panic_gate.py` | 12 tests funcionales |
| Frontend | `page.tsx` | Home Server Component + ISR |
| Votos | `votes.py` | Endpoint Bayesiano POST /vote |
| Frontend | `VerdictButton.tsx` | Estados idle/loading/voted/error |

---

## 📋 Estado Operacional del Sistema — Detalles Técnicos

### 1. Endpoints Activos por Módulo

#### Auth — `/api/v1/user/auth/`

| Método | Endpoint | Auth requerida | Descripción |
|---|---|---|---|
| `POST` | `/register` | No | Registro de nuevo usuario con email + password |
| `POST` | `/sign-in` | No | Login con email + password |
| `POST` | `/confirm-email` | No | Verifica token OTP de confirmación de email |
| `POST` | `/verify-identity` | JWT | Verificación de RUT (Módulo 11 + hash SHA-256) |
| `PUT` | `/profile` | JWT | Actualiza perfil demográfico (region, commune, birth_year) |
| `GET` | `/me` | JWT | Obtiene datos del usuario autenticado |

#### Entidades — `/api/v1/entities/`

| Método | Endpoint | Auth requerida | Descripción |
|---|---|---|---|
| `GET` | `/` | No | Lista entidades con filtros (category, limit, sort) |
| `GET` | `/{entity_id}` | No | Obtiene detalles de una entidad |
| `POST` | `/{entity_id}/vote` | JWT | Emite un voto para una entidad |
| `GET` | `/search` | No | Búsqueda de entidades por nombre/región |

#### Admin — `/api/v1/admin/`

| Método | Endpoint | Auth requerida | Descripción |
|---|---|---|---|
| `GET` | `/entities` | JWT (Admin) | Lista todas las entidades |
| `POST` | `/entities` | JWT (Admin) | Crea nueva entidad |
| `PUT` | `/entities/{id}` | JWT (Admin) | Actualiza entidad |
| `GET` | `/decay/preview` | JWT (Admin) | Vista previa del decay de reputation |
| `POST` | `/decay/run` | JWT (Admin) | Ejecuta el job de decay |
| `GET` | `/audit-logs` | JWT (Admin) | Acceso a audit logs inmutables |

#### Stats — `/api/v1/stats/`

| Método | Endpoint | Auth requerida | Descripción |
|---|---|---|---|
| `GET` | `/aum` | No | Estadísticas globales (usuarios activos, entidades, votos) |
| `GET` | `/health` | No | Health check del servicio |

---

### 2. Migraciones

> Las migraciones se aplican en orden cronológico. **Nunca modificar una migración ya aplicada** — siempre crear una nueva.

| # | Archivo | Fecha | Descripción | Status |
|---|---|---|---|---|
| 001 | `001_initial_schema.sql` | 2026-02-24 | Scaffolding base: `users`, `entities`, `entity_reviews` | ✅ Aplicada |
| 002 | `002_entities_schema.sql` | 2026-02-24 | Extensión de `entities` con campos de scoring | ✅ Aplicada |
| 003-011 | `*` | 2026-02-24 a 2026-03-09 | Incrementos de seguridad, ACM, audit_logs | ✅ Aplicadas |
| 012 | `012_fix_entities_columns.sql` | 2026-03-10 | `ADD COLUMN IF NOT EXISTS` para todas las columnas reales | ✅ Aplicada |
| 013 | `013_add_last_reviewed_at_to_entities.sql` | 2026-03-10 | `last_reviewed_at` para el job de decay | ✅ Aplicada |
| 014 | `014_rank_simplification.sql` | 2026-03-12 | Sistema 2 rangos: BASIC / VERIFIED | ✅ Aplicada |
| 015 | `015_fix_rank_constraint.sql` | 2026-03-12 | Constraint check para los 2 rangos | ✅ Aplicada |
| 016 | `016_add_region_commune_columns.sql` | 2026-03-12 | Columnas region y commune en users | ✅ Aplicada |
| 017 | `017_add_gender_column.sql` | 2026-03-12 | Campo gender en users | ✅ Aplicada |
| 018 | `018_add_voter_rank_to_poll_votes.sql` | 2026-03-12 | Snapshot de rango del votante en poll_votes | ✅ Aplicada |

**Ver esquema completo en docs/esquema_bbdd.md**

---

### 3. Lógicas de Negocio Críticas

#### Validación RUT Chileno (Módulo 11)
**Ubicación:** `backend/app/core/security/rut_validator.py` · `frontend/src/hooks/useRutValidation.ts`
**Cuándo se usa:** Todo campo de RUT en formularios y endpoints.

**Algoritmo:**
1. Limpiar formato: eliminar puntos y guión, convertir a mayúsculas
2. Separar cuerpo (todos los dígitos excepto el último) y dígito verificador (DV)
3. Validar que el cuerpo tenga mínimo 7 dígitos
4. Validar que el DV sea un dígito o la letra K
5. Calcular suma: recorrer el cuerpo de derecha a izquierda, multiplicar cada dígito por el factor del ciclo `2→3→4→5→6→7→2→...`
6. Calcular `resto = 11 - (suma % 11)`
7. El DV esperado es: `K` si resto=10, `0` si resto=11, el número si resto es 1-9
8. Retornar `DV ingresado == DV esperado`

**Almacenamiento:** El RUT nunca se guarda en texto plano — se almacena como `rut_hash` (SHA-256 + salt dinamico desde `RUT_HASH_SALT`).

**Casos de referencia:**
| RUT | Resultado |
|---|---|
| `76354771-K` | ✅ válido |
| `11111111-1` | ✅ válido |
| `12345678-5` | ✅ válido |
| `76354771-9` | ❌ DV incorrecto |

---

#### Fórmula de Ranking Bayesiana (Reputation Score)
**Ubicación:** `backend/app/core/ranking/integrity_engine.py`
**Cuándo se usa:** Cada vez que se emite un voto para una entidad.

**Fórmula:**
```
score = (m·C + Σ_votos) / (m + n)

Donde:
  m = 30 (prior — "confianza inicial")
  C = 3.0 (centro del prior — neutral)
  Σ_votos = suma de todos los votos recibidos
  n = cantidad total de votos
```

**Implicación:** Con pocos votos, el score tiende a 3.0 (neutral). Con muchos votos, converge al promedio real.

---

#### Decay de Reputación (Exponencial)
**Ubicación:** `backend/app/core/decay/reputation_decay.py`
**Cuándo se usa:** Job cron diario (00:03 UTC) que aplica decay a todas las entidades.

**Fórmula:**
```
new_score = C + (old_score − C) × e^(−ln2 × elapsed_days / half_life)

Donde:
  C = 3.0 (prior Bayesiano — asíntota inferior)
  half_life = DECAY_HALF_LIFE_DAYS (default 180 días)
  elapsed_days = días desde last_reviewed_at
```

**Comportamiento:** A los 180 días, un score de 5.0 decae a 4.0. A los 360 días, a 3.5. Converge perpetuamente a 3.0.

---

### 4. Decisiones de Arquitectura (ADRs)

#### ADR-001 — Next.js 14+ como SSR + ISR (No SPA)
**Fecha:** 2026-02-24
**Estado:** ✅ Vigente

**Decisión:** Frontend en Next.js con Server Components (async), no SPA pura.

**Razón:** ISR (Incremental Static Regeneration) permite cachear la home page cada 60s en Vercel, sin depender de que Render esté "caliente". Cold starts de backend no afectan UX del usuario.

**Consecuencia:** Las páginas dinámicas (entity/{id}) se renderizan on-demand; la home se regenera automáticamente. Solves Render Starter's cold start problema elegantemente.

---

#### ADR-002 — RLS (Row Level Security) + service_role Backend
**Fecha:** 2026-02-24
**Estado:** ✅ Vigente

**Decisión:** Toda lectura pública usa `anon` key; operaciones autenticadas usan `service_role` solo desde backend (FastAPI).

**Razón:** El frontend NUNCA ve `service_role`. Evita que un usuario pueda editar query params y acceder a datos privados.

**Consecuencia:** El backend es el único guardián. Todas las validaciones deben ocurrir en FastAPI antes de tocar Supabase.

---

#### ADR-003 — Audit Logs Append-Only (Immutable)
**Fecha:** 2026-02-24
**Estado:** ✅ Vigente

**Decisión:** Tabla `audit_logs` nunca se actualiza ni borra — solo INSERT. Registra toda acción sensible.

**Razón:** Trazabilidad forense. Si alguien manipula datos, el audit log prueba quién, cuándo, y desde dónde.

**Consecuencia:** Los auditors y admins pueden reconstruir cualquier evento pasado. No hay "borrador de historia".

---

#### ADR-004 — DNA Scanner (Clasificación de Tráfico)
**Fecha:** 2026-02-24
**Estado:** ✅ Vigente

**Decisión:** Cada request HTTP se analiza antes de tocar lógica: HUMAN (>70) / SUSPICIOUS (30-70) / DISPLACED (≤30).

**Razón:** Detectar y aislar bots/scrapers sin alertarlos. Los DISPLACED siguen votando (creen que funciona) pero sus votos se silencian.

**Consecuencia:** El atacante no sabe que fue detectado. Mejora la cadena de inteligencia.

---

### 5. Tests Documentados

#### Backend (pytest)

| Archivo | Capa | Función / qué verifica |
|---|---|---|
| `tests/test_access_control_matrix.py` | ACM | 27 tests: herencia de permisos, pesos de voto, auditoría |
| `tests/test_redis_panic_gate.py` | Redis/Panic | 12 tests: propagación de nivel de seguridad, fallback, CAPTCHA |
| `tests/test_rut_validator.py` | Seguridad | Módulo 11 validation, hash irreversibilidad, colisiones |
| `tests/core/test_reputation_decay.py` | Decay | Fórmula exponencial, convergencia a 3.0 |
| `tests/api/test_votes.py` | Votos | Endpoint bayesiano, weight application, atomic updates |

#### Frontend (vitest + Testing Library)

| Archivo | Componente | Función / qué verifica |
|---|---|---|
| `frontend/src/components/bunker/__tests__/AuthModal.test.tsx` | `AuthModal` | Login/registro, validación RUT local, feedback |
| `frontend/src/components/status/__tests__/VerdictButton.test.tsx` | `VerdictButton` | Estados (idle/loading/voted), partículas doradas |
| `frontend/src/components/home/__tests__/HomeHeroClient.test.tsx` | `HomeHeroClient` | Hero render, CTA visibility según auth state |

---

### 6. Estado de Features

#### ✅ Completadas

| Feature | Módulo | Fecha | Notas |
|---|---|---|---|
| Autenticación email + password | `auth` | 2026-02-24 | Sign-up/sign-in con Supabase Auth |
| Confirmación de email | `auth` | 2026-03-09 | OTP vía email, flujo /auth/callback |
| Verificación RUT (Módulo 11) | `identity` | 2026-03-12 | SHA-256 hash, sin persistencia de RUT en texto plano |
| Sistema de ranking Bayesiano | `ranking` | 2026-02-24 | Prior m=30, C=3.0, shrinkage estadístico |
| DNA Scanner (Detección de bots) | `security` | 2026-02-24 | HUMAN/SUSPICIOUS/DISPLACED, user-agent analysis |
| Panic Gate Extreme (Redis) | `security` | 2026-02-24 | 3 niveles (GREEN/YELLOW/RED), failsafe sin Redis |
| Votación Bayesiana | `votes` | 2026-03-10 | Endpoint POST /vote, atomic updates, weight application |
| Decay de reputación | `decay` | 2026-03-10 | Job cron, fórmula exponencial, convergencia |
| Audit logs inmutables | `audit` | 2026-02-24 | Append-only, trazabilidad forense completa |
| UI Dark Premium | `frontend` | 2026-03-09 | Next.js 14, Tailwind 4, Server Components, ISR |
| Home Page (Server Component) | `frontend` | 2026-03-09 | ISR 60s, cacheo en Vercel, zero Render cold start |
| Reencuadre ciudadano (manifiesto v4) | `product` | 2026-04-06 | Copy, navegación simplificada (4 secciones), hero nuevo |
| Encuestas — Fase 1 (infraestructura) | `encuestas` | 2026-04-12 | 4 preguntas máx, duración 1–30 días, escala 2–10 pts, labels por punto, contexto editorial, escala 6 sin punto neutral |
| Encuestas — Fase 2 (cross-tabs) | `encuestas` | 2026-04-12 | Endpoint `GET /polls/{id}/crosstabs?dimension=age\|region\|commune\|country`, privacidad n<5, histograma completo en escala |
| Encuestas — Fase 2.5 (distribución escala) | `encuestas` | 2026-04-12 | Distribución completa por punto en cross-tabs (no solo promedio) |
| Encuestas — Fase 3 (ranking) | `encuestas` | 2026-04-12 | Tipo `ranking` con drag-and-drop, Borda + pos. promedio + frec. #1, cross-tabs de ranking por grupo |
| Encuestas — ordenamiento por votos | `encuestas` | 2026-04-12 | Lista `/polls` ordenada por `total_votes` desc |
| CreatePollButton desbloqueado para VERIFIED | `frontend` | 2026-04-12 | Ciudadanos VERIFIED pueden crear encuestas desde la UI |

#### 🚧 En Desarrollo

| Feature | Módulo | Responsable | Bloqueada por |
|---|---|---|---|
| Propuesta ciudadana de preguntas (RE-3) | `encuestas` | IA | Design de UX para propuesta + moderación |
| Informes B2B bajo demanda (RE-4) | `b2b` | IA | Definición de estructura de informe |

#### ⏸️ Pendientes (Roadmap)

| Feature | Módulo | Prioridad | Notas |
|---|---|---|---|
| P3 — VS/Versus (head-to-head) | `events` | Alta | Event votes, UI comparativa lado a lado |
| P4 — Páginas de sección con filtros | `entities` | Alta | `/politicos`, `/empresas` con filtros region/partido |
| P5 — Flujo de upgrade RUT → Verificado | `identity` | Media | SMS 2FA opcional, UI de perfil |
| P6 — Scrapers de enrichment | `scrapers` | Media | BCN, Cámara, Senado, Wikipedia (bio/foto) |
| Recovery flow (Olvidé contraseña) | `auth` | Media | Tokens firmados, SMTP Resend |
| Anti-brigada (Rate limiting) | `security` | Media | 1 voto por user/entity, detección geográfica |
| Mina de Oro (Asset valuation) | `valuation` | Baja | USD internos, solo uso backend futuro |
| Efecto Kahoot (WebSockets RT) | `infrastructure` | Baja | Ranking updates en tiempo real |

---

<sub>

**📝 Verificación de Integridad**

Este documento ha sido chequeado y aprobado bajo los estándares de las **Technical Directives 2026**.

Última actualización: `2026-04-12T00:00:00-03:00`
Autor: Beacon Protocol — Motor de Integridad Digital
Commits de referencia:
- `223bafd` — Home Server Component + ISR + CORS fix producción
- `7e15a4e` — Vote endpoint Bayesiano + VerdictButton estados + Navbar refinements
- `2544971` — Confirmación de email: sign_up real + /auth/callback + template BEACON

_"Lo que vale, brilla. Lo que no, desaparece."_

</sub>
