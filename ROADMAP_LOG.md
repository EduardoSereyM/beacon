<!--
 ════════════════════════════════════════════════════════════
 BEACON PROTOCOL — Registro de Blindaje y Hoja de Ruta
 ════════════════════════════════════════════════════════════
 Estándar: Technical Directives 2026
 Clasificación: DOCUMENTO OFICIAL DE TRAZABILIDAD
 Mantra: "Lo que no es íntegro, no existe."
-->

# 🛡️ BEACON: Registro de Blindaje y Hoja de Ruta

> **Estado actual:** `Fase 1: Auth e Identidad — FINALIZADA & BLINDADA`
>
> **Mantra:** _"Lo que no es íntegro, no existe."_

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
  - Requiere JWT autenticado (mínimo BRONZE).

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

## 🔲 Pendientes Críticos — Fase 2 (Cierre MVP)

### P3 — VS/Versus
- [ ] Backend: `GET /api/v1/versus` + `POST /api/v1/versus/{id}/vote` con tabla `event_votes` (votos de evento, no afectan `reputation_score` permanente).
- [ ] Frontend: página `/versus` con UI head-to-head — dos entidades lado a lado, votación simultánea.

### P4 — Páginas de Sección con Filtros
- [ ] `/politicos`, `/empresas`, `/periodistas` — cada una con filtros propios: región, comuna, partido, búsqueda.
- [ ] Backend: endpoint `/entities` con sort por `reputation_score DESC` (actualmente ordena por `updated_at`).

### P5 — Verificación de Identidad RUT (BRONZE → SILVER)
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
- [ ] Activación del `user_asset_calculator.py` para proyectar el valor en dólares de la base de datos basado en densidad demográfica.

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
- [ ] Flujo de ascenso: BRONZE → SILVER requiere verificación SMS
- [ ] Rate limiting anti-abuso (máx. 3 intentos por hora)
- [ ] `IDENTITY_SMS_VERIFIED` en audit_logs al completar verificación

---

## 🔗 Archivos Clave del Búnker

| Módulo | Archivo | Función |
|---|---|---|
| Seguridad | `panic_gate_extreme.py` | Botón Rojo + Redis |
| ACM | `access_control_matrix.py` | Permisos con herencia |
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

<sub>

**📝 Verificación de Integridad**

Este documento ha sido chequeado y aprobado bajo los estándares de las **Technical Directives 2026**.

Última actualización: `2026-03-09T17:10:00-03:00`
Autor: Beacon Protocol — Motor de Integridad Digital
Commits de referencia:
- `223bafd` — Home Server Component + ISR + CORS fix producción
- `7e15a4e` — Vote endpoint Bayesiano + VerdictButton estados + Navbar refinements
- `2544971` — Confirmación de email: sign_up real + /auth/callback + template BEACON

_"Lo que vale, brilla. Lo que no, desaparece."_

</sub>
