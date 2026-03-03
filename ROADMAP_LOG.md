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
| **Fase 2** — Territorio + Valor | 🔄 EN CURSO | █████████░░░░ 65% |
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

### 3. Ingeniería Civil (Lógica de Votaciones MVP)
- [x] Aislamiento de categorías: `POLITICO` vs `PERSONA_PUBLICA` diferenciando roles.
- [x] Implementación de **Pivot Axis Engine** para evaluación de políticos (Transparencia, Gestión, Coherencia).
- [x] **Fricción Inteligente Anti-Brigada**: Freno a ráfagas coordinadas (< 3.0s con 1.0 base) requiriendo "Hechos Concretos".

### 4. Garantía Zero-Waste & Async Purity
- [x] Inspección async en controladores de FastAPI y delegación I/O al Transaction Pooler.
- [x] Limpieza extrema de logs y redundancias técnicas dictaminadas.

---

## 🔲 Pendientes Críticos — Fase 2 (Estabilización MVP)

### Dual-Role Admin Access
- [x] Implementar lógica en el Login para usuarios con rol ADMIN. Al autenticarse, el sistema debe presentar un 'Intersticial de Rol' que permita elegir entre:
  - **Admin Mode:** Acceso total al Overlord Dashboard y gestión sistemática.
  - **User Test Mode:** Acceso a la interfaz de usuario con privilegios máximos (Rango Diamond automático) para validación de funcionamiento y pruebas de UX.

> **CREDENCIALES DE PRUEBA PERMANENTES GENERADAS:**
> - **[ADMIN]** `overlord2026@beacon.com` / `OverlordPassword2026*` (Rango: DIAMOND, Rol: ADMIN)
> - **[USER]** `ciudadano2026@beacon.com` / `CiudadanoPassword2026*` (Rango: BRONZE, Rol: USER)

### Recovery Flow
- [ ] Implementar el servicio de recuperación de credenciales ('Olvidé mi contraseña') mediante el envío de tokens firmados vía email, integrándolo con el flujo de auditoría de Supabase Auth.

### Vínculo Territorial
- [ ] Lógica de detección de brigadas coordinadas mediante análisis geográfico (`is_local_vote`).

### Mina de Oro
- [ ] Activación del `user_asset_calculator.py` para proyectar el valor en dólares de la base de datos basado en densidad demográfica.

### Efecto Kahoot
- [ ] Configuración de WebSockets para actualizaciones de rankings en tiempo real y 'Gold Explosions'.

### Zona de Desplazados
- [ ] Reforzar aislamiento y logs en `forensics/displaced/` para capturar patrones de bots.

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
| Frontend | `page.tsx` | Category Switcher + Suspense |

---

<sub>

**📝 Verificación de Integridad**

Este documento ha sido chequeado y aprobado bajo los estándares de las **Technical Directives 2026**.

Última actualización: `2026-02-25T16:30:00-03:00`
Autor: Beacon Protocol — Motor de Integridad Digital
Commit de referencia: `ACM-auth-modal`

_"Lo que vale, brilla. Lo que no, desaparece."_

</sub>
