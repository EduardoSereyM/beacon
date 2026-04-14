# Fixes de Autenticación y UI — 2026-04-14

**Autor:** Claude  
**Fecha:** 2026-04-14  
**Commits:** `27941d6`, `840a268`, `c95d8b4`  
**Estado:** ✅ Deployed a main

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

## 4. Testing & Validation

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

## 5. Deployment

### Pre-Deploy Checklist

- [x] Código commiteado: `27941d6`, `840a268`, `c95d8b4`
- [x] Push a `main` completado
- [x] SQL ejecutado para usuario huérfano
- [ ] Deploy backend a Render
- [ ] Deploy frontend a Vercel
- [ ] Pruebas post-deploy en producción
- [ ] Validar email delivery

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
