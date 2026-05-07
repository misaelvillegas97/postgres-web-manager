# PLAN.md — PgStudio Gateway

> Fuente principal: [PRD.md](PRD.md). Este plan convierte la visión del PRD en una ruta de implementación incremental para el monorepo Nx actual.
>
> Tablero operativo: [TASKS.md](TASKS.md). Cada avance de implementación debe actualizar ese archivo para conservar contexto, estado, decisiones y rutas afectadas.

## 1. Propósito

Construir **PgStudio Gateway**, una herramienta web para administrar PostgreSQL desde el navegador con arquitectura segura:

```txt
Angular App → HTTPS / WebSocket → NestJS Gateway → PostgreSQL
```

Principios obligatorios derivados de [PRD.md](PRD.md):

- El frontend nunca se conecta directo a PostgreSQL.
- Toda operación PostgreSQL pasa por el gateway NestJS bajo `/api/*` o WebSocket.
- Los contratos TypeScript compartidos viven en [libs/contracts](libs/contracts).
- El gateway valida permisos, clasifica riesgo SQL, aplica límites, maneja credenciales y audita operaciones.
- El desarrollo debe avanzar por fases pequeñas, validables y con contexto preservado en [TASKS.md](TASKS.md).

## 2. Estado actual del repositorio

Fecha de análisis: 2026-05-06.

| Área                       | Estado actual                                                                                                                       | Rutas relevantes                                                                                                                           | Observaciones                                                                                            |
|----------------------------|-------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Nx monorepo                | Configurado con proyectos `web`, `@org/api`, `@postgres-web-manager/contracts`, `web-e2e`, `@org/api-e2e`.                          | [nx.json](nx.json), [package.json](package.json)                                                                                           | Usar `npm exec nx ...` para build, test, lint y e2e.                                                     |
| Backend NestJS             | Módulos principales implementados y protegidos con JWT/roles.                                                                       | [apps/api/src/app/app.module.ts](apps/api/src/app/app.module.ts), [apps/api/src/modules](apps/api/src/modules)                             | Auth DB-backed, conexiones, queries, metadata, table-data, DDL, explain, audit y sessions están activos. |
| API prefix                 | El backend expone prefijo global `/api`.                                                                                            | [apps/api/src/main.ts](apps/api/src/main.ts)                                                                                               | Las rutas documentadas en el PRD deben considerarse públicas como `/api/...`.                            |
| Contratos compartidos      | Contratos de auth, conexiones, query, metadata, table-data, DDL, explain, sessions, auditoría y workspaces exportados.              | [libs/contracts/src/lib](libs/contracts/src/lib), [libs/contracts/src/index.ts](libs/contracts/src/index.ts)                               | Son fuente compartida para frontend/backend.                                                             |
| PostgreSQL gateway helpers | `PostgresPoolManager`, mapper de errores, migraciones, cifrado y persistencia interna conectados a servicios.                       | [apps/api/src/postgres](apps/api/src/postgres), [apps/api/src/database](apps/api/src/database)                                             | Las migraciones se empaquetan en `apps/api/dist/migrations`.                                             |
| Frontend Angular           | Shell de producto, login, Connection Manager, workspace SQL, metadata tree, table browser, table designer y analyzer implementados. | [apps/web/src/app](apps/web/src/app)                                                                                                       | Nx welcome eliminado.                                                                                    |
| Docker                     | Stack dev/prod con API, web y PostgreSQL.                                                                                           | [docker/docker-compose.yml](docker/docker-compose.yml), [docker/docker-compose.dev.yml](docker/docker-compose.dev.yml)                     | Mantener variables seguras desde `.env.example`.                                                         |
| Pruebas                    | Unit/build/lint/typecheck/e2e reales pasan con Nx.                                                                                  | [apps/api-e2e/src/api/api.spec.ts](apps/api-e2e/src/api/api.spec.ts), [apps/web-e2e/src/example.spec.ts](apps/web-e2e/src/example.spec.ts) | API e2e cubre auth, conexiones, queries, metadata y table-data.                                          |

## 3. Decisiones de arquitectura para este repo

### 3.1 Rutas públicas del gateway

El backend tiene `app.setGlobalPrefix('api')` en [apps/api/src/main.ts](apps/api/src/main.ts). Por eso, las rutas externas deben exponerse con prefijo `/api` aunque [PRD.md](PRD.md) las describa sin prefijo.

Rutas objetivo del MVP:

| Módulo      | Rutas objetivo                                                                                                                                           | Estado actual                                                                 |
|-------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| Auth        | `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`                                                                               | Implementado con usuarios DB-backed, JWT y refresh token rotation persistida. |
| Connections | `/api/connections`, `/api/connections/:id`, `/api/connections/test`, `/api/connections/:id/test`, `/api/connections/:id/unlock`                          | Implementado con workspace isolation, cifrado opcional y unlock.              |
| Queries     | `/api/queries/execute`, `/api/queries/explain`, `/api/queries/cancel`, `/api/queries/history`                                                            | Implementado con clasificación de riesgo, history y auditoría.                |
| Metadata    | `/api/metadata/:connectionId/schemas`, `/api/metadata/:connectionId/schemas/:schema/tables`, `/api/metadata/:connectionId/schemas/:schema/tables/:table` | Implementado.                                                                 |
| Table Data  | `/api/table-data/read`, `/api/table-data/preview-changes`, `/api/table-data/apply-changes`                                                               | Implementado con edición transaccional y validación de identificadores.       |
| DDL         | `/api/ddl/create-table/preview`, `/api/ddl/create-table/execute`, `/api/ddl/alter-table/preview`, `/api/ddl/alter-table/execute`                         | Implementado.                                                                 |
| Sessions    | `WS /sessions` con eventos `session.open`, `session.close`, `query.execute`, `query.rows`, `query.done`, `query.error`, `query.cancelled`                | Implementado con JWT handshake, streaming y cancelación.                      |

### 3.2 Contratos como fuente de verdad

- Toda request/response usada por frontend y backend debe agregarse primero en [libs/contracts/src/lib](libs/contracts/src/lib).
- Si una ruta cambia, actualizar contrato, controller, servicio Angular y [TASKS.md](TASKS.md) en el mismo cambio.
- Mantener `SqlRiskLevel`, `ConnectionMode`, `UserRole` y DTOs compartidos compatibles con el PRD.

### 3.3 Persistencia interna del gateway

El PRD define una base interna para `workspaces`, `connection_profiles`, `query_history` y `audit_logs`. Esa base es distinta de las bases PostgreSQL administradas por los usuarios.

Plan recomendado:

1. Agregar configuración de entorno y validación.
2. Agregar módulo de base interna y migraciones.
3. Persistir conexiones sin password por defecto.
4. Cifrar passwords solo si el usuario decide guardarlas.
5. Guardar historial y auditoría desde el primer MVP real.

### 3.4 Seguridad SQL obligatoria

Antes de ejecutar SQL:

- Clasificar riesgo: `SAFE`, `WRITE`, `DDL`, `DESTRUCTIVE`, `ADMIN`, `UNKNOWN`.
- Bloquear escritura si la conexión es read-only.
- Aplicar `statement_timeout` y `maxRows`.
- Parametrizar SQL generado por Table Data y DDL helpers.
- Auditar `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, `ALTER` y DDL.
- No loguear passwords ni stack traces crudos al frontend.

## 4. Roadmap por fases

### Fase 0 — Alineación y base técnica

Objetivo: dejar el repo listo para implementar sin ambigüedades.

Incluye:

- Mantener [PLAN.md](PLAN.md), [TASKS.md](TASKS.md), [README.md](README.md) y [PRD.md](PRD.md) sincronizados.
- Alinear rutas REST actuales con rutas objetivo.
- Completar contratos faltantes para MVP.
- Definir variables de entorno, configuración y estrategia de base interna.
- Confirmar comandos Nx de validación por proyecto.

Criterio de salida:

- [TASKS.md](TASKS.md) refleja prioridades, tareas activas y convenciones de actualización.
- Los endpoints objetivo están documentados y no hay conflicto singular/plural (`query` vs `queries`).

### Fase 1 — Gateway MVP backend

Objetivo: conectar el gateway NestJS a PostgreSQL real con flujo mínimo funcional.

Incluye:

- Auth básico para desarrollo y estructura para roles.
- CRUD de conexiones y `test connection`.
- Gestión de pools por conexión.
- Ejecución de queries aisladas con timeout, límite de filas, errores mapeados e historial.
- Metadata de schemas, tablas, columnas, índices, constraints, funciones y extensiones.
- `EXPLAIN` básico.
- Auditoría inicial para operaciones riesgosas.

Criterio de salida:

- Desde API e2e se puede crear/probar una conexión, ejecutar `SELECT`, consultar metadata y obtener historial.

### Fase 2 — Frontend MVP

Objetivo: reemplazar el Nx welcome por una experiencia usable.

Incluye:

- Shell de aplicación: topbar, sidebar, workspace y panel inferior.
- Servicios Angular para API y WebSocket.
- Connection Manager.
- Schema Explorer.
- SQL Workspace con editor básico, botón Run y resultados en grilla.
- Historial de queries.
- Export CSV/JSON inicial.

Criterio de salida:

- Desde la UI se puede crear/probar conexión, explorar schemas/tablas, ejecutar SQL y exportar resultados.

### Fase 3 — Editor SQL avanzado

Objetivo: mejorar productividad del usuario.

Incluye:

- Monaco Editor.
- Tabs múltiples de query.
- Shortcuts.
- Autocompletado basado en metadata.
- Formatter SQL.
- Paneles de errores, notices y mensajes.

Criterio de salida:

- El SQL Workspace soporta varias pestañas, ejecución de selección y feedback visual de errores.

### Fase 4 — Table Browser editable

Objetivo: ver y editar datos con seguridad.

Incluye:

- Lectura paginada, filtros y ordenamiento.
- Detección de primary key o unique key confiable.
- Edición inline con cambios pendientes.
- Preview SQL parametrizado.
- Aplicación en transacción.
- Bloqueo o confirmación avanzada si no hay PK/unique key.

Criterio de salida:

- Se pueden aplicar cambios de tabla de forma transaccional y auditable.

### Fase 5 — DDL visual

Objetivo: crear y modificar estructura sin escribir SQL manualmente.

Incluye:

- Table Designer.
- Crear tabla, columnas, primary key, unique, foreign keys, checks e índices.
- Alter table visual.
- Preview SQL y ejecución confirmada.
- Auditoría de DDL.

Criterio de salida:

- El usuario puede generar y ejecutar DDL desde UI con preview y confirmación.

### Fase 6 — Query Analyzer

Objetivo: analizar rendimiento con `EXPLAIN` y `EXPLAIN ANALYZE`.

Incluye:

- `EXPLAIN (FORMAT JSON)`.
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` con advertencias.
- Árbol visual del plan.
- Planning time, execution time, costos, filas estimadas vs reales y buffers.
- Protección para `EXPLAIN ANALYZE` sobre escrituras o DDL.

Criterio de salida:

- Se visualizan planes y advertencias básicas de performance desde UI.

### Fase 7 — Seguridad SaaS y auditoría avanzada

Objetivo: preparar el producto para uso multiusuario.

Incluye:

- Workspaces.
- Usuarios, roles y permisos.
- Guards NestJS.
- Cifrado robusto de credenciales.
- API keys futuras.
- Auditoría completa y filtros.
- Read-only mode real.
- Límites por usuario/workspace.

Criterio de salida:

- Las operaciones están protegidas por rol, auditadas y aisladas por workspace.

### Fase 8 — Calidad, despliegue y documentación

Objetivo: dejar el producto mantenible y desplegable.

Incluye:

- Pruebas unitarias, integración y e2e reales.
- CI con Nx affected/run-many.
- Docker dev/prod.
- Documentación de variables, despliegue y seguridad.
- Observabilidad básica: logs estructurados, métricas y healthchecks.

Criterio de salida:

- Cada fase anterior tiene pruebas, documentación y comandos de validación claros.

## 5. Comandos de validación esperados

Usar siempre Nx desde el package manager del repo:

- Validar contratos: `npm exec nx build @postgres-web-manager/contracts`
- Validar API: `npm exec nx build @org/api`
- Validar web: `npm exec nx build web`
- Validar lint: `npm exec nx run-many -t lint`
- Validar pruebas relevantes: `npm exec nx test web`, `npm exec nx e2e web-e2e`, `npm exec nx e2e @org/api-e2e`

Si un comando cambia, actualizar [TASKS.md](TASKS.md) y [README.md](README.md).

## 6. Definición de hecho global

Una tarea o fase se considera terminada cuando:

- La implementación respeta [PRD.md](PRD.md) o documenta explícitamente una desviación.
- Los contratos compartidos están sincronizados con API y UI.
- Las rutas afectadas están mencionadas en [TASKS.md](TASKS.md).
- Hay pruebas o validación manual documentada.
- No se introducen conexiones directas desde frontend a PostgreSQL.
- No se exponen passwords, secretos ni stack traces crudos.
- [TASKS.md](TASKS.md) queda actualizado con estado, fecha, notas y próximos pasos.

## 7. Riesgos y decisiones pendientes

| Riesgo / decisión                               | Impacto     | Resolución propuesta                                                                                  |
|-------------------------------------------------|-------------|-------------------------------------------------------------------------------------------------------|
| Rutas `query` vs `queries` y `explain` separado | Resuelto.   | Rutas públicas estandarizadas en plural `/api/queries/*`.                                             |
| Persistencia interna no definida                | Resuelto.   | Migraciones `001`-`004` crean base interna, usuarios dev, hashes de password y refresh tokens.        |
| Auth no implementado                            | Resuelto.   | Auth DB-backed con JWT, guards globales y roles.                                                      |
| Guardar passwords                               | Controlado. | Por defecto no se guarda password; si `savePassword=true`, se cifra con `CREDENTIALS_ENCRYPTION_KEY`. |
| Table editing sin PK                            | Controlado. | UI/servicio bloquean o restringen edición cuando no hay PK/unique key confiable.                      |
| `EXPLAIN ANALYZE` ejecuta la consulta           | Controlado. | `ExplainService` clasifica riesgo y exige confirmación para operaciones no seguras.                   |
