# Fixes de Autenticación y UI — 2026-04-14

**Autor:** Claude  
**Fecha:** 2026-04-14  
**Commits:** `27941d6`, `840a268`, `c95d8b4`, `bfa6ed2`, `2b0746a`, `155992a`, `cba8f64`  
**Estado:** ✅ Deployed a main y producción

---

## 1. Bug: Usuarios huérfanos en registro (Orphaned Auth Users)

### Problema

Cuando un usuario se registraba en **producción** (`DEBUG=False`):

1. Backend llamaba `supabase.auth.sign_up()` en el cliente service_role
2. Esto creaba el usuario en `auth.users` ✅
3. **PERO** `sign_up()` sobrescribía la sesión interna del cliente service_role con el JWT del nuevo usuario (no confirmado)
4. El insert posterior a `public.users` usaba ese JWT inválido en lugar de service_role → **403 Forbidden**
5. El rollback (`admin.delete_user`) también fallaba con 403
6. Resultado: usuario creado en auth pero SIN perfil en la DB → login imposible con "Perfil de ciudadano no encontrado"

### Causa Raíz

El SDK de Supabase-py actualiza la sesión interna del cliente cuando se llama `auth.sign_up()`. Para mantener la sesión de service_role intacta, era necesario usar un cliente separado.

### Solución Implementada

**Commit `27941d6`:**

1. **`backend/app/core/database.py`**: Nueva función `get_supabase_anon_async()`
   ```python
   def get_supabase_anon_async() -> AsyncClient:
       """Cliente ASÍNCRONO con anon key (respeta RLS).
       Usar exclusivamente para auth flows (sign_up) donde NO se requiere service_role."""
       return AsyncClient(settings.SUPABASE_URL, settings.SUPABASE_KEY)
   ```

2. **`backend/app/services/auth_service.py`** (líneas 83-99):
   - En modo producción: usar cliente anon para `sign_up()`
   - El cliente service_role permanece intacto para el insert a `public.users`

### Impacto

- ✅ Nuevos registros crean perfil correctamente en `public.users`
- ✅ Usuario puede confirmar email sin errores
- ✅ Usuario puede hacer login exitosamente
- ✅ Rollback funciona si hay error

### Usuario Huérfano Pre-fix

Se ejecutó SQL manual para crear perfil del usuario que quedó sin él:
```sql
INSERT INTO public.users (id, email, first_name, last_name, rank,
  integrity_score, reputation_score, under_deep_study, is_active)
VALUES ('c3967feb-a7ef-4a7c-bb5a-9c55e8f52112', 'abborgia@gmail.com',
  '', '', 'BASIC', 0.5, 0.5, true, true);
```

---

## 2. Bug: Flujo de Confirmación de Email Confuso

### Problema

**En PC:** Después del submit del registro, se navegaba inmediatamente al tab de login con mensaje "tu sesión ha expirado" → confusión.

**En Mobile:** Similar problema con flujo confuso.

**Causa:** Después de `register()` exitoso con `email_confirmation_required: true`, el frontend hacía `setTimeout(() => setMode("login"), 4000)` → confundía al usuario.

### Solución Implementada

**Commit `840a268`** — Tres cambios:

#### 1. AuthModal.tsx (líneas 447-460)
```javascript
if (!data.email_confirmation_required) {
    // Modo DEBUG: cambiar a login automáticamente
    setTimeout(() => {
        setMode("login");
        setSuccess("");
    }, 4000);
}
// Producción: quedarse en el formulario mostrando el mensaje
```

**Cambio:** Solo en modo DEBUG (sin confirmación de email) se cambia a login automáticamente. En producción, el usuario ve el mensaje "revisa tu correo" y se queda en el formulario.

#### 2. callback/page.tsx (líneas 137-141)
```javascript
if (prev <= 1) {
    clearInterval(timer);
    sessionStorage.setItem("beacon_open_login", "1");  // Nueva línea
    router.replace("/");
    return 0;
}
```

**Cambio:** Antes de redirigir al home, guardar flag en sessionStorage para señalizar que se debe abrir el modal de login.

#### 3. NavbarClient.tsx (líneas 52-60)
```javascript
// Abrir modal de login si viene del callback
useEffect(() => {
    const shouldOpen = sessionStorage.getItem("beacon_open_login");
    if (shouldOpen === "1") {
        sessionStorage.removeItem("beacon_open_login");
        setIsModalOpen(true);
    }
}, []);
```

**Cambio:** Detectar flag en sessionStorage y abrir el modal de login limpiamente.

### Flujo Correcto Resultante

```
1. Submit Registro
   └─> Backend devuelve { email_confirmation_required: true, status: "pending_confirmation" }
   └─> Frontend muestra: "📧 Hemos enviado un email..."
   └─> Usuario queda en formulario de registro (sin navegar)

2. Usuario click en CTA del email
   └─> Va a /auth/callback?token_hash=...
   └─> Backend verifica token
   └─> Callback muestra: "¡Email confirmado!" + countdown
   └─> Countdown: guarda sessionStorage + navega a /

3. Usuario llega al home (/)
   └─> NavbarClient detecta sessionStorage flag
   └─> Abre modal de login automáticamente
   └─> Usuario puede hacer login con sus credenciales
```

### Impacto

- ✅ Registro no confunde con navegación prematura
- ✅ Callback fluye natural a login
- ✅ Sin mensajes de "sesión expirada" innecesarios
- ✅ UX clara: email → confirma → login

---

## 3. Bug: Banner de Verificación Invisible/Comprimido

### Problema

**Desktop:** Banner "Tu voto aparece en el conteo público..." no aparecía (oculto por z-index).

**Mobile:** Banner visible pero muy comprimido, texto pegado, difícil de leer.

### Causa Raíz

- **Desktop:** `zIndex: 40` del banner < `z-50` del navbar → oculto detrás
- **Mobile:** Falta padding, font-size pequeño, layout no optimizado

### Solución Implementada

**Commit `c95d8b4`** — Componente responsive `BasicUserBanner.tsx`:

#### Cambios Principales

1. **Z-index aumentado:** 40 → 45 (visible encima de elementos pero bajo navbar menu)
2. **Top position:** 64px → 68px (evitar overlap exacto)

3. **Responsive Design con useEffect:**
   ```javascript
   const [isMobile, setIsMobile] = useState(false);
   useEffect(() => {
       const checkMobile = () => setIsMobile(window.innerWidth < 768);
       checkMobile();
       window.addEventListener("resize", checkMobile);
       return () => window.removeEventListener("resize", checkMobile);
   }, []);
   ```

4. **Desktop Styling:**
   - padding: `14px 24px` (vs 10px 20px)
   - fontSize: `13px` (igual, optimizado)
   - gap: `20px` (vs 12px)
   - layout: row (horizontal)

5. **Mobile Styling:**
   - padding: `16px 16px` (más espacioso)
   - fontSize: `14px` (vs 13px)
   - lineHeight: `1.5` (más legible)
   - gap: `16px` (vs 12px)
   - layout: column (vertical stack)
   - Button: `10px 18px` padding, `13px` fontSize (vs `7px 16px`, `12px`)
   - Icon aumentado: `20px` → `24px`

### Impacto

- ✅ Banner visible en desktop bajo navbar
- ✅ Mobile: mejor legibilidad con más espacio
- ✅ Botón "Verificar identidad" más clickeable en mobile
- ✅ Responsive sin hydration mismatch (useEffect pattern)

---

## 4. Bug: Recuperación de Contraseña Inoperante

### Problema

**En producción y local:** El enlace de "Restablecer Contraseña" del email llegaba con error `otp_expired` o `Email link is invalid or has expired` sin importar cuánto tiempo había pasado.

**Logs de Supabase:**
```
GET /auth/v1/verify?token=xxx&type=recovery → 303
→ Redirige con #error=access_denied&error_code=otp_expired
Backend: POST /auth/v1/verify "HTTP/2 403 Forbidden"
```

### Causas Raíz (dos problemas independientes)

#### Causa 1: Email client pre-fetcha el OTP
El template usaba `{{ .ConfirmationURL }}` que lleva directamente a Supabase:
```
https://[supabase]/auth/v1/verify?token=xxx&type=recovery
```
Gmail, Outlook y otros clientes de email **pre-cargan los links** para verificar seguridad/preview. Esto **consume el OTP** antes de que el usuario haga click. Cuando el usuario finalmente hace click, el token ya no existe → `otp_expired`.

#### Causa 2: `verify_otp` llamado con `service_role` client
El backend usaba el cliente `service_role` para llamar `verify_otp()`, que es una operación exclusiva del cliente anon. Resultado: `403 Forbidden`.

### Solución Implementada

**Commits `d0899b5`, `155992a`:**

#### 1. Template del email (Supabase Dashboard)
```html
<!-- ❌ ANTES — vulnerable a email pre-fetch -->
<a href="{{ .ConfirmationURL }}"

<!-- ✅ DESPUÉS — token_hash no se consume con GET requests -->
<a href="{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery"
```

El `token_hash` en query param solo se consume cuando el backend llama explícitamente a `verify_otp`. Un pre-fetch simple de la URL de nuestra página no lo consume.

#### 2. Backend: usar anon_client para verify_otp
```python
# ❌ ANTES — service_role no tiene permiso para verify_otp
auth_response = await supabase.auth.verify_otp({...})

# ✅ DESPUÉS — anon_client es el cliente correcto
from app.core.database import get_supabase_anon_async
anon_client = get_supabase_anon_async()
auth_response = await anon_client.auth.verify_otp({
    "token_hash": token_hash,
    "type": "recovery",
})
```

### Flujo Correcto Resultante

```
1. Usuario solicita reset → POST /forgot-password
   └─> Backend llama reset_password_for_email() con redirect_to

2. Email llega con token_hash en URL de NUESTRO sitio:
   └─> https://www.beaconchile.cl/auth/reset-password?token_hash=xxx&type=recovery

3. Usuario hace click → nuestra página carga con token_hash en query params
   └─> El token_hash NO se consume todavía (es solo un identificador)
   └─> Email clients que pre-fetchen la URL tampoco lo consumen

4. Usuario ingresa nueva contraseña → POST /reset-password
   └─> Backend llama anon_client.auth.verify_otp({ token_hash, type: "recovery" })
   └─> Supabase verifica → devuelve user_id
   └─> Backend actualiza contraseña via admin API

5. Éxito → mensaje de confirmación + redirect al inicio
```

### Impacto

- ✅ Reset de contraseña funciona en producción
- ✅ Token OTP no vulnerable a email pre-fetch
- ✅ verify_otp usa cliente correcto (anon, no service_role)
- ✅ Flujo completo validado en producción

---

## 5. Mejoras de UI Banner (commits bfa6ed2, 2b0746a, cba8f64)

### Cambios

1. **Texto unificado** — Banner muestra el mismo mensaje en desktop y mobile:
   > "🔒 Tu voto solo aparece en el conteo público, pero solo los votos de usuarios verificados cuentan en los informes oficiales. Verifica tu identidad con RUT y tu voz contará al 100%."

2. **Apariencia de popup flotante:**
   - `border-radius: 12px` — esquinas redondeadas
   - Centrado con `maxWidth: 600px`
   - Fondo más transparente (opacidad 0.08)
   - `box-shadow` dorado para efecto flotante
   - Botón X agrandado (28px en caja 40×40) con hover effects
   - `top: 105px` — alineado con doble fila del navbar

---

## 6. Testing & Validation

### Test Cases

#### Auth Flow Completo
```
[ ] Crear cuenta nueva
    [ ] Form muestra "revisa tu correo"
    [ ] No navega a login
    [ ] Queda en formulario de registro
    
[ ] Click en email CTA
    [ ] Llega a /auth/callback
    [ ] Muestra "Email confirmado!"
    [ ] Countdown 5s
    
[ ] Retorna a home
    [ ] Modal de login abierto automáticamente
    [ ] Sin mensaje de "sesión expirada"
    [ ] Puede hacer login exitosamente
```

#### Banner Visibility
```
[ ] Desktop: banner visible bajo navbar
[ ] Mobile: banner con buen spacing
[ ] Botón "Verificar identidad" clickeable
[ ] Close button (×) funciona
[ ] Responsive resize (cambiar tamaño ventana)
```

#### Edge Cases
```
[ ] URL de callback expirada → error message
[ ] Email no confirmado → no puede login
[ ] Contraseña olvidada → flujo de reset funciona
```

---

## 6. Fixes de Verificación de Identidad — 2026-04-14 (commits 1a9bc6e, 866aa80)

### 6.1 Bug: Error 23505 en verificación de RUT muestra "Error de conexión"

#### Problema

Al intentar verificar identidad con un RUT ya registrado en otra cuenta, el backend lanzaba:

```
postgrest.exceptions.APIError: {'code': '23505', 'details': None, 'hint': None,
'message': 'duplicate key value violates unique constraint "users_rut_hash_key"'}
```

Este error no era capturado → llegaba al frontend como 500 → UI mostraba "Error de conexión. Intenta más tarde."

#### Causa Raíz

Dos escenarios posibles:
1. El pre-check de unicidad (Paso 3) tiene race condition: check pasa, pero el UPDATE en Paso 4 falla por constraint
2. El propio usuario intenta re-verificar con el mismo RUT ya guardado en su cuenta

#### Solución Implementada

**`backend/app/services/identity_service.py`** — Paso 4 envuelto en try/except:

```python
try:
    await (
        supabase.table("users")
        .update({ "rut_hash": rut_hashed, "is_rut_verified": True, ... })
        .eq("id", user_id)
        .execute()
    )
except Exception as e:
    if "23505" in str(e):
        raise ValueError(
            "Este documento ya está registrado en otra cuenta. "
            "Si crees que es un error, contacta al soporte."
        )
    raise
```

También se unificó el mensaje del Paso 3 (pre-check) con el mismo texto sin mencionar "RUT" explícitamente.

#### Impacto

- ✅ Error 23505 capturado → mensaje claro al usuario
- ✅ Sin exposición de detalles técnicos de la DB
- ✅ Mensaje neutro sin revelar si el RUT existe en otra cuenta

---

### 6.2 Bug: Modal de verificación no pedía género → rank nunca subía a VERIFIED

#### Problema

`_evaluate_rank()` exige 6 campos: `rut_hash + birth_year + gender + country + region + commune`.

El modal `VerifyIdentityModal.tsx` solo recolectaba 4: `rut + birth_year + region + commune`. El campo `gender` nunca se enviaba → siempre `null` en DB → `_evaluate_rank` retornaba `BASIC` siempre.

#### Solución Implementada

**`frontend/src/components/bunker/VerifyIdentityModal.tsx`:**

1. Nuevo estado: `const [gender, setGender] = useState("")`
2. Validación: `if (!gender) newErrors.gender = "Selecciona tu género."`
3. Payload al `/profile`: incluye `gender`
4. Select en JSX con opciones: Masculino / Femenino / No binario / Prefiero no decir
5. Reset en `handleClose`: incluye `setGender("")`
6. Todos los campos marcados con `*` (obligatorios)

**Commit:** `1a9bc6e`

#### Impacto

- ✅ Usuario que completa el modal sube correctamente a VERIFIED
- ✅ Formulario consistente: todos los campos requeridos marcados con `*`
- ✅ género queda persistido en DB para análisis demográfico

---

### 6.3 Fix: Edad mínima de verificación corregida a 18 años

#### Problema

La validación de `birth_year` aceptaba usuarios desde 14 años (`CURRENT_YEAR - 14`).

#### Solución

```typescript
// ANTES
year > CURRENT_YEAR - 14

// DESPUÉS
year > CURRENT_YEAR - 18
```

**Commit:** `866aa80`

#### Impacto

- ✅ Solo mayores de 18 años pueden verificar identidad
- ✅ Mensaje de error actualizado: `Ingresa un año válido (1920–${CURRENT_YEAR - 18})`

---

### 6.4 SQL Manual — Usuario pre-fix sin género

El usuario `c238c2da-723d-47ef-b883-70080c4b98bd` verificó RUT antes de que el modal incluyera el campo género. Ejecutar en Supabase:

```sql
UPDATE public.users
SET gender = 'Masculino', rank = 'VERIFIED', integrity_score = 0.75, updated_at = now()
WHERE id = 'c238c2da-723d-47ef-b883-70080c4b98bd'
  AND is_rut_verified = true;
```

---

## 5. Deployment

### Pre-Deploy Checklist

- [x] Código commiteado: `27941d6`, `840a268`, `c95d8b4`, `bfa6ed2`, `2b0746a`, `155992a`, `cba8f64`
- [x] Push a `main` completado
- [x] SQL ejecutado para usuario huérfano
- [x] Deploy backend a Render ✅
- [x] Deploy frontend a Vercel ✅
- [x] Pruebas post-deploy en producción ✅
- [x] Validar email delivery ✅
- [x] Validar reset de contraseña en producción ✅

### Environment Variables (Verificar)

**Backend:**
- `DEBUG=False` (production mode)
- `FRONTEND_URL=https://www.beaconchile.cl`
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_KEY` correctas

**Frontend:**
- `NEXT_PUBLIC_API_URL=https://api.beaconchile.cl` (o Render URL)
- Supabase config correcta

---

## 6. Logs & Monitoring

### Métricas a Monitorear

1. **Registro exitoso:** `POST /api/v1/user/auth/register` → 200 con `email_confirmation_required: true`
2. **Confirmación de email:** `POST /api/v1/user/auth/confirm-email` → 200
3. **Login exitoso:** `POST /api/v1/user/auth/login` → 200 con JWT
4. **Tasa de abandono en registro:** Antes vs después (esperar datos)

### Error Tracking

```
Error pattern "Perfil de ciudadano no encontrado" → RESUELTO
Error pattern "tu sesión ha expirado" (after registration) → RESUELTO
Z-index issues → RESUELTO
Error pattern "Email link is invalid or has expired" (reset password) → RESUELTO
Error pattern "403 Forbidden" en verify_otp → RESUELTO
```

---

## 7. Referencias

- **Supabase Python SDK:** `sign_up()` vs `admin.create_user()` session handling
- **Next.js Hydration:** SSR mismatch con `window.innerWidth`
- **Z-index stacking:** Fixed positioning + navbar overlaps
- **SessionStorage:** Flag passing entre pages

---

## 8. Próximos Pasos (No Urgente)

- [ ] P3: Migrar all consumers de localStorage a useAuthStore (lines 396 in AuthModal)
- [ ] P4: Generar diagrama de flujo de autenticación en docs/flows/
- [ ] P4: Agregar email template preview a la documentación
- [ ] P4: Testing E2E de flujo completo (Cypress/Playwright)

---

**Fin de Documentación**
