---
name: beacon-directives
description: Skill para revisar, interpretar y mejorar el archivo Directives 2026.md — evalúa si las directivas son implementables, detecta contradicciones con el estado actual del proyecto y propone actualizaciones.
allowed-tools: Read, Write, Grep, Glob
disable-model-invocation: false
---

# beacon-directives — Revisión & Mejora de Directives 2026

## Propósito
Este skill guía la **lectura, interpretación y mejora** del archivo `Directives 2026.md`, que es el documento vinculante de desarrollo de BEACON. Permite detectar directivas obsoletas, contradictorias o no implementadas, y proponer actualizaciones fundamentadas.

Invoca con `/beacon-directives` cuando el usuario necesite:
- Verificar si una directiva está siendo respetada en el código actual
- Detectar contradicciones entre las directivas y la implementación real
- Proponer mejoras o actualizaciones al documento
- Entender qué directivas son NON-NEGOTIABLE vs aspiracionales

---

## Estado Actual del Archivo `Directives 2026.md`

### Problemas estructurales detectados

| Problema | Descripción |
|----------|-------------|
| **Numeración duplicada** | Las secciones 8, 9, 10, 11 aparecen DOS VECES en el archivo (lineas ~234-261 y ~262-439) |
| **Sin formato Markdown válido** | El archivo mezcla texto plano con pseudo-código sin delimitadores correctos |
| **Directiva BFF/HttpOnly contradicción** | La directiva indica usar HttpOnly Cookies, pero el proyecto usa `localStorage` + Zustand |
| **`supabase_client.py` singleton** | La directiva pide singleton pero el código crea cliente nuevo por cada llamada (bug DT-5) |
| **Referencias a tablas inexistentes** | Menciona `entity_snapshots` y `user_achievements` que no tienen migración documentada |

---

## Directivas por Estado de Implementación

### ✅ Implementadas y respetadas
- `async/await total en I/O` — cumplido (salvo DT-1: audit_bus sin await)
- `NO DELETE físico` — cumplido con `is_active` / `deleted_at`
- `RUT nunca en texto plano` — cumplido con SHA-256+salt en `rut_validator.py`
- `audit_logs append-only` — cumplido (trigger RLS `audit_no_delete`, `audit_no_update`)
- `Pydantic v2+ con response models` — cumplido
- `Silencio Estratégico (bots ven 200 OK)` — cumplido en `dna_scanner.py`
- `RLS + validación backend (defensa en profundidad)` — cumplido

### ⚠️ Parcialmente implementadas
- `Rate limiting (slowapi)` — definido en directivas, implementación parcial
- `Background Tasks para rankings` — directiva existe, no implementado aún
- `Triggers automáticos en audit_logs` — solo para `entities` y `config_params`, falta para `entity_reviews`
- `Pydantic extra='forbid'` — directiva existe, verificar en todos los schemas

### ❌ No implementadas (pendiente)
- `BFF / HttpOnly Cookies para JWT` — actualmente: localStorage + Zustand (DT-15)
- `Circuit Breaker en capa de datos` — no implementado
- `Materialized Views para analytics` — no implementado
- `Device Fingerprinting` — no implementado
- `TanStack Query v5+ para prefetching` — no implementado
- `entity_snapshots (Append-Only)` — tabla no creada
- `user_achievements (gamificación)` — tabla no creada
- `Vulture + pre-commit hooks` — no configurado

---

## Cómo usar este skill

### Al invocar `/beacon-directives`:

1. **Leer el archivo completo**: `Directives 2026.md`
2. **Leer el estado actual del proyecto**: `MEMORY.md` y `ROADMAP_LOG.md`
3. **Para cada sección de las directivas**:
   - ¿Está implementada? (`✅` / `⚠️` / `❌`)
   - ¿Hay contradicción con código existente?
   - ¿Es NON-NEGOTIABLE o aspiracional?

4. **Si el usuario pide mejorar el archivo**:
   - Nunca modificar sin mostrar el diff completo primero
   - Pedir confirmación explícita antes de escribir
   - Prioridad: corregir estructura (duplicados) antes de agregar contenido nuevo

5. **Formato de reporte**:
   ```
   ## Directiva: [nombre]
   - Estado: ✅/⚠️/❌
   - Archivo de implementación: [path]
   - Contradicción: [descripción si existe]
   - Acción recomendada: [fix/PR/ignorar]
   ```

---

## Principios NON-NEGOTIABLE (no tocar sin aprobación Overlord)

Estos principios son el núcleo del protocolo BEACON y **nunca** deben ser debatidos:

1. **RUT texto plano** — jamás almacenar
2. **DELETE físico** — jamás ejecutar (siempre soft delete)
3. **audit_logs** — siempre append-only, nunca UPDATE/DELETE
4. **Silencio Estratégico** — bots nunca deben saber que fueron detectados
5. **service_role** — nunca exponer al frontend
6. **Un voto por usuario por entidad** — UNIQUE constraint en DB
7. **Async total** — nunca blocking calls en rutas críticas

---

## Componentes Protegidos (CLAUDE.md — "Amigos Bits")

No modificar sin aprobación explícita del Overlord:
- `backend/app/core/security/dna_scanner.py`
- `backend/app/core/valuation/user_asset_calculator.py`
- `backend/app/core/security/stealth_ban.py`
- `backend/app/forensics/war_room.py`

---

## Estructura esperada de `Directives 2026.md` (tras mejora)

```markdown
# BEACON 2026: Technical Directives (v2.0)

## 1. Arquitectura General y Backend
## 2. Frontend (Next.js 15+)
## 3. Base de Datos — Esquema y Políticas 2026
## 4. Calidad de Código y Mantenimiento
## 5. Restricciones Críticas (NON-NEGOTIABLE)
## 6. Deployment y Escalabilidad
## 7. Documentación Exigida
## 8. Patrones de Resiliencia y Rendimiento
## 9. Seguridad Avanzada y Defensa de Identidad
## 10. Frontend: Optimización de Experiencia
## 11. Auditoría e Inmutabilidad Forense
## 12. Ingeniería de la Verdad (Scrapers)
## 13. Gamificación y Retención (Pasaporte Cívico)
## 14. Resiliencia en Eventos Vivo
## 15. Seguridad Anti-Manipulación
## 16. Actualización del Esquema SQL
## 17. Geolocalización y Privacidad
## 18. Testing y Observabilidad
## 19. Desarrollo Basado en Pruebas (TDD)
## 20. Higiene Técnica (Zero-Waste Code)
```

---

## Referencia

- `Directives 2026.md` → Documento a revisar (en raíz del proyecto)
- `CLAUDE.md` → Protocolos del Estratega, componentes protegidos, DoD
- `MEMORY.md` → Estado real del stack y pendientes
- `ROADMAP_LOG.md` → Hitos alcanzados y pendientes por fase
- `playbook.md` → Visión estratégica y arquitectura de producto
