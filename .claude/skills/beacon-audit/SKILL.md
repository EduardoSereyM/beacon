---
name: beacon-audit
description: Auditoría BEACON fase por fase, hallazgos por severidad y plan de PRs pequeños
allowed-tools: Read, Grep, Glob
disable-model-invocation: false
---

Cuando se invoque /beacon-audit:
- Lee el repo y reporta hallazgos: Bloqueante, Alto, Medio, Bajo.
- Confirma si faltan módulos, imports rotos, configuraciones incompletas.
- Entrega un checklist por fase (0,1,2...).
- Propón PRs pequeños (≤300 líneas) con objetivo y criterios de aceptación.
- Nunca modifiques archivos ni ejecutes comandos (read-only).
