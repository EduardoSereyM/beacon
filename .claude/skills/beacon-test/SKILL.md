---
name: beacon-test
description: Estrategia de tests BEACON (unit/integration), criterios de aceptación y DoD
allowed-tools: Read, Grep, Glob
disable-model-invocation: false
---

Cuando se invoque /beacon-test:
- Para cada feature: lista tests mínimos (unit + integration), mocks necesarios, edge cases.
- Mantén pruebas rápidas y deterministas (sin depender de Supabase real por defecto).
- Señala cobertura faltante y riesgos.
