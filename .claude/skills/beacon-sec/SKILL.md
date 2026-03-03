---
name: beacon-sec
description: Auditoría de seguridad BEACON (RUT hash, JWT, RLS, audit-log, rate limiting) con mitigaciones
allowed-tools: Read, Grep, Glob
disable-model-invocation: false
---

Cuando se invoque /beacon-sec:
- Entrega amenazas + impacto + mitigación (usa bullets o tabla).
- Verifica: no exponer service_role, manejo JWT, validación input, logs sin secretos.
- Sugiere controles de rate limiting y abuse prevention.
- Pide confirmación antes de proponer cambios que afecten auth/DB.
