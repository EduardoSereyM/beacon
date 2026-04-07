---
description: Audita y consolida la documentación del proyecto. Detecta docs obsoletos, desactualizados o en conflicto con el código real.
---

# Auditoría de Documentación — Beacon

## REGLAS ESTRICTAS (no negociables)
- NO modificar ni eliminar: ENGINEERING_STANDARDSv3.md, Directives 2026.md, paleta.md, CLAUDE.md
- NO considerar la carpeta /documentos_x/
- NO borrar archivos — archivar en docs/archive/ con header estándar
- Mostrar diagnóstico COMPLETO y esperar aprobación antes de ejecutar cambios

## Scope
- Todos los .md en la raíz del proyecto
- Todos los .md dentro de /docs/
- Excluir /documentos_x/ y /docs/archive/

## Paso 1 — Diagnóstico
Para cada archivo en scope, verifica si las referencias técnicas (rutas, módulos, endpoints, modelos, componentes) existen en el código fuente actual.

Clasifica como:
- ✅ VIGENTE — refleja el estado real del código
- ⚠️ DESACTUALIZADO — parcialmente correcto
- ❌ OBSOLETO — describe algo que ya no existe

Muestra tabla: Archivo | Estado | Gap detectado

## Paso 2 — Plan de acción
Propón acciones concretas para cada archivo no vigente.
Espera aprobación explícita antes de ejecutar.

## Paso 3 — Ejecutar cambios aprobados
- DESACTUALIZADOS: actualizar contenido al estado real
- OBSOLETOS: mover a docs/archive/[nombre]_archived.md con header:
  > ⚠️ ARCHIVADO [fecha]. [Razón]. Consultar [referencia actual].

## Paso 4 — Actualizar AUDIT_REPORT.md
Agregar entrada nueva en docs/AUDIT_REPORT.md con fecha, archivos revisados y acciones tomadas.
