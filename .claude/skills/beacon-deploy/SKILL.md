---
name: beacon-deploy
description: Checklist completo de deploy de BEACON a Render (backend) + Vercel (frontend). Cubre variables de entorno, CORS, cold start, verificación post-deploy y rollback.
allowed-tools: Read, Bash, Grep, Glob
disable-model-invocation: false
---

# beacon-deploy — Protocolo de Deploy BEACON

## Propósito
Este skill guía el proceso de deploy de BEACON a producción de forma segura, verificando cada capa antes de dar el OK final.

Invoca con `/beacon-deploy` cuando el usuario necesite:
- Hacer deploy de una nueva versión
- Diagnosticar por qué producción falla tras un deploy
- Verificar que variables de entorno están correctas
- Entender la diferencia entre entorno local y producción

---

## Arquitectura de Producción

```
www.beaconchile.cl (Vercel)
    │
    │  NEXT_PUBLIC_API_URL → https://beacon-f477.onrender.com
    │
    ▼
beacon-f477.onrender.com (Render — Starter Plan)
    │
    │  SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_SECRET_KEY...
    │
    ▼
ejholgyffguoxlflvoqx.supabase.co (Supabase — mismo para local y prod)
```

---

## ⚠️ Regla Crítica: render.yaml NO actualiza servicios existentes

> **DIAGNÓSTICO CONOCIDO** (commit 223bafd): `render.yaml` NO actualiza automáticamente los env vars de servicios ya existentes en Render. Toda variable nueva o cambiada DEBE configurarse **manualmente** en el Render Dashboard.

---

## Diferencia Local vs Producción

| Capa | Local | Producción |
|------|-------|------------|
| API URL | `frontend/.env.local` → `http://localhost:8000` | `frontend/vercel.json` → `https://beacon-f477.onrender.com` |
| Backend | `uvicorn --reload --port 8000` | Render auto-deploy desde `main` |
| DB | Mismo Supabase (Transaction Pooler 6543) | Mismo Supabase (Transaction Pooler 6543) |
| Redis | Opcional, `localhost:6379` | No disponible en Render Starter → Panic Gate en modo YELLOW |

> ⚠️ **Nunca modificar `vercel.json` para pruebas locales** — `.env.local` tiene prioridad automáticamente.

---

## Checklist Pre-Deploy (backend — Render)

### Variables de entorno en Render Dashboard (manual)
```
SUPABASE_URL=https://ejholgyffguoxlflvoqx.supabase.co
SUPABASE_KEY=<anon_key>
SUPABASE_SERVICE_KEY=<service_role_key>    # NUNCA exponer al frontend
DATABASE_URL=postgresql://...pooler...:6543/postgres
JWT_SECRET_KEY=beacon-sovereign-key-2026-...
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
FRONTEND_URL=https://www.beaconchile.cl
RUT_HASH_SALT=beacon-forensic-salt-2026-...
DEBUG=False                                # CRÍTICO: False en producción
```

### CORS — campo crítico
Verificar en Render Dashboard que `CORS_ORIGINS` incluye:
- `https://www.beaconchile.cl`
- `https://beaconchile.cl`
- (NO incluir localhost en producción)

### Verificación pre-deploy
```bash
# En local, antes de hacer push al main:
cd backend
pytest tests/ -v --tb=short   # Todos los tests deben pasar
```

---

## Checklist Pre-Deploy (frontend — Vercel)

### `frontend/vercel.json` — verificar
```json
{
  "env": {
    "NEXT_PUBLIC_API_URL": "https://beacon-f477.onrender.com"
  }
}
```

### Variables en Vercel Dashboard
```
NEXT_PUBLIC_SUPABASE_URL=https://ejholgyffguoxlflvoqx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
```
> ⚠️ `NEXT_PUBLIC_API_URL` ya está en `vercel.json` → NO duplicar en Vercel Dashboard

---

## Verificación Post-Deploy (en orden)

### 1. Health check del backend
```bash
curl https://beacon-f477.onrender.com/health
# Esperado: {"status": "ok", "panic_level": "YELLOW"}
```

### 2. Test de CORS
```bash
curl -H "Origin: https://www.beaconchile.cl" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://beacon-f477.onrender.com/api/v1/entities
# Esperado: 200 con header Access-Control-Allow-Origin: https://www.beaconchile.cl
```

### 3. Test de autenticación
Login con credencial de prueba USER `ciudadano2026@beacon.com` / `CiudadanoPassword2026*`
Verificar que devuelve JWT válido.

### 4. Test de entidades
```bash
curl https://beacon-f477.onrender.com/api/v1/entities?limit=3
# Esperado: lista de entidades con datos reales (NO scores en 0)
```

### 5. Verificación visual en www.beaconchile.cl
- Home carga con datos (ISR activo)
- NavBar muestra botón de login
- EntityCard muestra foto y score real

---

## Diagnóstico de Problemas Comunes

| Síntoma | Causa probable | Fix |
|---------|---------------|-----|
| CORS error en browser | `CORS_ORIGINS` desactualizado en Render | Actualizar manualmente en Render Dashboard |
| Cold start lento (30s+) | Render Starter hiberna sin tráfico | Normal — no es un bug |
| 500 en `/entities` | `DEBUG=True` en producción mostrando error detallado | Cambiar `DEBUG=False` en Render |
| Login devuelve 400 | Email no confirmado en Supabase | Dashboard Supabase → Auth → Users → Confirm email |
| Frontend carga pero sin datos | Vercel no ve `NEXT_PUBLIC_API_URL` | Verificar `vercel.json` y redeployar |
| Redis warnings en logs | Render Starter no tiene Redis | Normal — Panic Gate en YELLOW (fail-safe) |

---

## Rollback de emergencia

```bash
# En Render Dashboard: Deployments → seleccionar deploy anterior → Rollback
# En Vercel: Deployments → seleccionar deploy anterior → Promote to Production

# En git (nunca force-push a main):
git revert <commit-hash>
git push origin main
```

---

## Credenciales de prueba (verificación post-deploy)

| Rol | Email | Contraseña | Rango |
|-----|-------|------------|-------|
| ADMIN | `overlord2026@beacon.com` | `OverlordPassword2026*` | DIAMOND |
| USER | `ciudadano2026@beacon.com` | `CiudadanoPassword2026*` | BRONZE |
| USER | `beacon@testdesarrollo.cl` | `Password#2026` | BRONZE |

---

## Archivos clave de deploy

- `render.yaml` → Configuración del servicio Render (referencia solamente)
- `frontend/vercel.json` → URL de API para producción
- `backend/.env` → Variables locales (NO commitear)
- `frontend/.env.local` → Variables locales frontend (NO commitear)
- `MEMORY.md` → Referencia completa de variables de entorno
