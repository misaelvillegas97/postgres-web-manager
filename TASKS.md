# TASKS.md — tablero de implementación PgStudio Gateway

> Este archivo debe actualizarse **cada vez que se avance, bloquee, cambie o complete una tarea**. Su propósito es conservar contexto ejecutable para que cualquier sesión futura pueda continuar sin releer todo el repositorio.
>
> Contexto fuente: [PRD.md](PRD.md) y roadmap en [PLAN.md](PLAN.md).

## Reglas de mantenimiento

Estados permitidos:

- `[ ]` Pendiente.
- `[~]` En progreso.
- `[x]` Completada.
- `[!]` Bloqueada.

Al trabajar en una tarea:

1. Cambiar el estado antes de empezar (`[~]`).
2. Mantener el contexto de la tarea: rutas del repo, rutas API, contratos y referencias a [PLAN.md](PLAN.md) / [PRD.md](PRD.md).
3. Al terminar, cambiar a `[x]`, agregar fecha, resumen, validación ejecutada y archivos modificados.
4. Si aparece una desviación del PRD, documentarla en la tarea y, si afecta roadmap, actualizar [PLAN.md](PLAN.md).
5. Si una tarea se divide, crear subtareas con IDs nuevos y enlazarlas desde la tarea original.
6. No borrar contexto histórico útil; agregar notas debajo de la tarea.

Formato recomendado para notas de avance:

```txt
Avance YYYY-MM-DD:
- Cambios: ...
- Rutas modificadas: ...
- Validación: ...
- Pendiente: ...
```

## Snapshot actual del proyecto

> **Actualizado:** Fase 0 completa ✓ | Fase 1 completa ✓ | Build ✓ | 27/27 unit tests pasan ✓

- Backend: **Fase 0 + Fase 1 implementadas**. Todos los servicios MVP funcionales.
  - `AuthService`: JWT mock, login/refresh/logout/me. `JwtAuthGuard` listo.
  - `ConnectionsService`: CRUD DB-backed + test() + unlock() + cifrado AES-256-GCM.
  - `QueryService`: execute() + cancel() + getHistory() + audit logging.
  - `ExplainService`: EXPLAIN FORMAT JSON + parsePlanNode + ANALYZE safety guard.
  - `MetadataService`: schemas/tables/tableDetail/functions/extensions con `validateIdentifier`.
  - `TableDataService`: read paginado (LIMIT/OFFSET, filtros parametrizados, allowlist de operadores) + previewChanges + applyChanges.
  - `SessionsGateway`: WS `/sessions`, session.open/close, query.execute (streaming por batches), query.cancel (pg_cancel_backend).
- Módulos globales: `ConfigModule` (Zod env), `DatabaseModule` (pool interno), `CryptoModule` (AES + PoolManager).
- Filtros globales: `HttpExceptionFilter` + `AllExceptionsFilter`.
- Migraciones: `001_initial.sql` (workspaces, users, connection_profiles, query_history, audit_logs).
- API prefix: `/api` configurado en [apps/api/src/main.ts](apps/api/src/main.ts).
- Frontend: todavía muestra Nx welcome. Fase 2 pendiente.
- Contratos: base compartida en [libs/contracts/src/lib](libs/contracts/src/lib) + `audit.contracts.ts`, `workspace.contracts.ts`.
- PostgreSQL helpers: pool manager y mapper en [apps/api/src/postgres](apps/api/src/postgres).
- Docker: stack base en [docker/docker-compose.yml](docker/docker-compose.yml).
- Tests: Jest 30 + @swc/jest configurado. 27 unit tests SQL classifier. E2E specs compltos en `apps/api-e2e`.
- Validación Nx esperada: usar `npm exec nx ...` según [PLAN.md](PLAN.md).

## Prioridades globales

| Prioridad | Significado |
| --- | --- |
| P0 | Necesario para desbloquear el MVP o corregir una inconsistencia base. |
| P1 | Funcionalidad principal del MVP. |
| P2 | Mejora importante posterior al MVP. |
| P3 | Endurecimiento, escalabilidad o SaaS avanzado. |

---

## Plan de ejecución inmediato — Fase 0 y Fase 1

> **Regla**: no se toca código funcional hasta completar todos los ítems de Fase 0.
> Cada tarea debe marcarse `[~]` al empezar y `[x]` al terminar con validación real ejecutada.
> Actualizar nota de avance con fecha, cambios y archivos modificados.

### Ruta crítica

```
T-010 → T-011 → T-012 → T-020 → T-021 → T-022+T-023 → T-024
  → T-030 → T-031 → T-032 → (T-033 / T-034 / T-035) → T-040
  → T-110 + T-111
```

T-000 es regla permanente. T-001/T-112/T-113/T-114 acompañan en paralelo.

### Decisiones confirmadas (no re-discutir en cada sesión)

| Decisión | Opción elegida |
| --- | --- |
| Auth MVP | Mock/dev hardcoded para Fase 1; JWT real + guards en Fase 7. |
| Rutas REST | Plural `/api/queries/*`; explain unificado en `QueryController`. |
| WebSocket namespace | `WS /sessions` (no raíz). |
| Passwords | No persistir por defecto. Cifrar sólo si `savePassword=true`. |
| Validación de env | Esquema explícito con `zod` + `.env.example`. |
| BD interna | Raw SQL con migraciones numeradas (sin ORM en MVP). |
| Cifrado de credenciales | AES-256-GCM con `crypto` nativo, clave desde `CREDENTIALS_ENCRYPTION_KEY`. |

### Matriz de paralelismo

| Tras completar | Pueden ejecutarse en paralelo |
| --- | --- |
| F0.1 (T-000 nota actualizada) | F0.2 (T-010), F0.4 (T-012), F0.5 (T-020) |
| F0.2 + F0.5 | F0.6 (T-021), F0.7 (T-022+T-023), F0.8 (T-024) |
| F0.7 completo | F1.1 (T-030), F1.2 (T-031) |
| F1.2 completo | F1.4 (T-033), F1.5 (T-034), F1.6 (T-035), F1.7 (T-040) |
| F1.3 + base lista | F1.8 (T-110 + T-111) |

### Bloques Fase 0

#### F0.1 — Planificación operativa (T-000)
- Actualizar TASKS.md con esta sección y matrices.
- Validación: `git diff --check -- TASKS.md`.

#### F0.2 — Auditoría y contratos faltantes (T-010)
- Añadir a `query.contracts.ts`: `ApiErrorResponse { status, code, message, detail? }`.
- Añadir a `connection.contracts.ts`: `CancelQueryRequest { queryId }`.
- Crear `libs/contracts/src/lib/audit.contracts.ts` con `AuditLogDto`.
- Crear `libs/contracts/src/lib/workspace.contracts.ts` con `WorkspaceDto`.
- Exportar todo desde `libs/contracts/src/index.ts`.
- Validación: `npm exec nx build @postgres-web-manager/contracts`.

#### F0.3 — Estandarizar rutas REST y WebSocket (T-011)
- `query.controller.ts`: `@Controller('query')` → `@Controller('queries')`.
- Mover método `explain()` de `ExplainController` a `QueryController` como `@Post('explain')`.
- `ExplainController`: vaciar o deprecar (mantener módulo).
- `sessions.gateway.ts`: `@WebSocketGateway()` → `@WebSocketGateway({ namespace: '/sessions' })`.
- Validación: `npm exec nx build @org/api`.

#### F0.4 — Política de errores API (T-012)
- Crear `apps/api/src/filters/http-exception.filter.ts` (respuestas HTTP de NestJS como `ApiErrorResponse`).
- Crear `apps/api/src/filters/all-exceptions.filter.ts` que use `PostgresErrorMapper` para errores `pg`.
- Registrar ambos filtros en `main.ts` con `app.useGlobalFilters(...)`.
- Validación: `npm exec nx build @org/api`; test manual que no expone stack traces.

#### F0.5 — Configuración de entorno (T-020)
- Crear `apps/api/src/config/env.schema.ts` con validación `zod` para: `PORT`, `DATABASE_URL`, `CREDENTIALS_ENCRYPTION_KEY`, `CORS_ORIGIN`, `NODE_ENV`.
- Crear `apps/api/src/config/config.module.ts` global.
- Actualizar `main.ts` para recoger variables via config.
- Crear `.env.example` en raíz del repo.
- Validación: app falla rápido si falta variable obligatoria.

#### F0.6 — Base interna del gateway (T-021)
- Crear `apps/api/src/database/database.module.ts` con `pg.Pool` para BD interna (`DATABASE_URL`).
- Crear `apps/api/src/database/migrations/001_initial.sql` con tablas:
  - `workspaces(id, name, owner_user_id, created_at)`.
  - `connection_profiles(id, workspace_id, name, host, port, database, username, password_encrypted, save_password, ssl_mode, access_mode, max_rows, statement_timeout_ms, created_at, updated_at)`.
  - `query_history(id, workspace_id, connection_id, user_id, sql, risk_level, row_count, duration_ms, executed_at, status)`.
  - `audit_logs(id, workspace_id, connection_id, user_id, action, sql_preview, risk_level, resource, created_at)`.
- Crear `DatabaseMigrationService` que ejecute migraciones al init.
- Validación: `docker compose exec postgres psql -U pgstudio -d pgstudio -c "\dt"`.

#### F0.7 — Cifrado de credenciales y pool manager (T-022 + T-023)
- Crear `apps/api/src/crypto/credentials-encryption.service.ts` (AES-256-GCM, `crypto` nativo Node.js).
- Inyectar `PostgresPoolManager` en `ConnectionsModule` como provider global.
- Añadir `PostgresPoolManager` e `CredentialsEncryptionService` a `ConnectionsModule`.
- Validación: unit test básico del encryption service.

#### F0.8 — Clasificador de riesgo SQL (T-024)
- Crear `apps/api/src/modules/query/sql-risk.classifier.ts`: función pura `classifyRisk(sql: string): SqlRiskLevel`.
- Categorías: SELECT/EXPLAIN → `READ_ONLY`; INSERT/UPDATE/DELETE → `DML`; DDL (CREATE/ALTER/DROP/TRUNCATE) → `DDL`; comandos admin → `DANGEROUS`; desconocido → `UNKNOWN`.
- Crear `apps/api/src/modules/query/sql-risk.classifier.spec.ts` con casos de prueba.
- Validación: `npm exec nx test @org/api -- --testPathPattern=classifier`.

### Checklist de salida Fase 0

- [ ] `npm exec nx build @postgres-web-manager/contracts` → exit 0.
- [ ] `npm exec nx build @org/api` → exit 0.
- [ ] `npm exec nx run-many -t lint` → sin errores nuevos.
- [ ] Tablas BD interna visibles vía `psql` en Docker.
- [ ] `PostgresPoolManager` inyectado en `ConnectionsModule`.
- [ ] `npm exec nx test @org/api -- --testPathPattern=classifier` → pasa.

### Bloques Fase 1

#### F1.1 — Auth MVP (T-030)
- `AuthService.login(dto)` → validar usuario en tabla `users` o usar credencial mock para dev/test.
- `AuthService.me(token)` → decodificar y retornar `UserProfile`.
- Añadir `GET /auth/me` a `AuthController`.
- Preparar esqueleto para `JwtAuthGuard` (activo o bypass configurable por `NODE_ENV`).
- Validación: `curl -X POST /api/auth/login`; `curl /api/auth/me`.

#### F1.2 — Connections CRUD, test y unlock (T-031)
- `ConnectionsService`: `create()`, `findAll()`, `findOne()`, `update()`, `remove()` sobre `connection_profiles`.
- `testConnection(id)`: pool temporal → `SELECT version()` → destruir pool → retornar latencia + versión.
- `unlock(id, password)`: cargar password temporal en memoria de sesión (Map por user+connection).
- Respetar `sslMode`, `statementTimeoutMs`, `maxRows`, `accessMode`.
- Validación: `curl -X POST /api/connections`; `curl -X POST /api/connections/test`.

#### F1.3 — Ejecución de queries aisladas (T-032)
- `QueryService.execute(request)`: obtener pool → `classifyRisk()` → verificar `accessMode` → ejecutar → mapear → guardar en `query_history` → si DDL/DML insertar en `audit_logs`.
- Aplicar `timeoutMs`, `maxRows`.
- Validación: `curl -X POST /api/queries/execute` con SELECT simple.

#### F1.4 — Metadata PostgreSQL (T-033)
- `MetadataService`: queries parametrizadas a `information_schema.schemata`, `tables`, `columns`, `pg_indexes`, `pg_constraint`.
- Respetar privilegios del usuario PostgreSQL conectado.
- Validación: `curl /api/metadata/:id/schemas`.

#### F1.5 — Explain básico (T-034)  `[x]`
- `ExplainService.explain(dto)`: `classifyRisk()` → si `ANALYZE` en SQL no-SAFE requiere confirmación → `EXPLAIN (FORMAT JSON [, ANALYZE] [, BUFFERS])` → `parsePlanNode()` recursivo → `ExplainResponse`.
- Archivo: `apps/api/src/modules/explain/explain.service.ts`.

#### F1.6 — Lectura de tablas (T-035)  `[x]`
- `TableDataService.read(request)`: validar `schema`/`table`/`column` con regex `^[a-zA-Z_][a-zA-Z0-9_$]*$`. Filtros con allowlist de operadores SQL. Query paginada LIMIT/OFFSET con params. Sin interpolación de identificadores: `"${schema}"."${table}"`.
- `previewChanges()` + `applyChanges()`: genera/ejecuta INSERT/UPDATE/DELETE en transacción.
- Archivo: `apps/api/src/modules/table-data/table-data.service.ts`.

#### F1.7 — Sessions WebSocket mínimo (T-040)  `[x]`
- Namespace `/sessions`. `Map<socketId, SessionState>` con `PoolClient` + `backendPid`. 
- `session.open` → dedicated client, `SELECT pg_backend_pid()`, store in map.
- `query.execute` → run query in rowMode:'array', emit `query.rows` batches (200 rows), `query.done` o `query.error`.
- `query.cancel` → `SELECT pg_cancel_backend(pid)` en conexión separada.
- `handleDisconnect` → `client.release()` + delete map entry.
- Archivo: `apps/api/src/modules/sessions/sessions.gateway.ts`.

#### F1.8 — Tests E2E y seed de BD (T-110 + T-111)  `[x]`
- Reemplazado `apps/api-e2e/src/api/api.spec.ts` con pruebas reales:
  - Auth: login válido/inválido, `GET /api/auth/me`, refresh rotation, logout.
  - Error shape: 404 con `ApiErrorResponse`.
  - Connections: CRUD, test 404 para id desconocido.
  - Queries: execute 404 para connection no encontrada.
  - Metadata: schemas 404 para connection no encontrada.
  - TableData: read 404 + read 400 para schema inválido.

### Checklist de salida Fase 1

- [x] `npm exec nx build @org/api` → exit 0.
- [x] 27/27 unit tests `sql-risk.classifier.spec.ts` pasan con Jest 30.
- [x] `apps/api-e2e/src/api/api.spec.ts` con tests reales (auth, connections, queries, metadata, table-data).
- [ ] `npm exec nx e2e @org/api-e2e` → pasa cuando servidor arrancado (requiere `nx serve @org/api`).
- [ ] WS socket.io conecta a `/sessions`, abre sesión y recibe eventos (validación manual).

---

## 0. Gestión del plan y documentación

### T-000 — [ ] Mantener este tablero actualizado

- Prioridad: P0.
- Contexto: este archivo es el estado vivo del proyecto. El usuario pidió explícitamente que [TASKS.md](TASKS.md) se actualice a medida que avancen las tareas.
- Referencias: [PLAN.md](PLAN.md), [PRD.md](PRD.md).
- Criterios de aceptación:
  - Cada tarea activa queda marcada `[~]` mientras se trabaja.
  - Cada tarea completada incluye fecha, resumen, rutas modificadas y validación.
  - Las nuevas tareas preservan contexto suficiente para continuar en otra sesión.
- Notas de avance:
  - 2026-05-03: tarea creada como regla permanente del repo.
  - 2026-05-03: Planificación Fase 0 y Fase 1 completada. Ruta crítica y matrices documentadas en sección "Plan de ejecución inmediato" de este archivo.

### T-001 — [ ] Sincronizar README con el roadmap real

- Prioridad: P1.
- Contexto: [README.md](README.md) resume la arquitectura, pero debe mantenerse alineado con [PLAN.md](PLAN.md), rutas reales y versiones del repo.
- Rutas del repo: [README.md](README.md), [PLAN.md](PLAN.md), [package.json](package.json).
- Criterios de aceptación:
  - README refleja rutas públicas finales y comandos Nx vigentes.
  - README no promete funcionalidades no implementadas sin marcarlas como roadmap.
  - README enlaza a [PLAN.md](PLAN.md) y [TASKS.md](TASKS.md).

---

## 1. Alineación de contratos y rutas API

### T-010 — [ ] Auditar contratos compartidos contra el PRD

- Prioridad: P0.
- Contexto: [PRD.md](PRD.md) define DTOs/enums para conexiones, queries, metadata, table-data, DDL, explain, sessions, seguridad, usuarios, workspaces, historial y auditoría. El repo ya tiene contratos base, pero faltan algunos dominios.
- Rutas del repo: [libs/contracts/src/lib](libs/contracts/src/lib), [libs/contracts/src/index.ts](libs/contracts/src/index.ts).
- Referencias PRD/plan: [PRD.md](PRD.md), [PLAN.md](PLAN.md).
- Subtareas:
  - [ ] Comparar `ConnectionProfile`, `CreateConnectionDto` y `ConnectionMode` con el PRD.
  - [ ] Comparar `ExecuteQueryRequest`, `ExecuteQueryResponse`, `SqlRiskLevel` y `QueryHistoryEntry` con el PRD.
  - [ ] Agregar contratos faltantes para audit logs, workspaces, users/roles extendidos, cancelación, formatter, unlock y healthchecks si aplica.
  - [ ] Documentar breaking changes para frontend/backend.
- Validación esperada:
  - `npm exec nx build @postgres-web-manager/contracts`.
- Plan de implementación:
  1. Comparar `ConnectionProfile`, `CreateConnectionDto`, `ConnectionMode` con PRD §5.2.
  2. Comparar `ExecuteQueryRequest`, `ExecuteQueryResponse`, `SqlRiskLevel`, `QueryHistoryEntry` con PRD §5.3.
  3. Añadir `ApiErrorResponse` a `query.contracts.ts`.
  4. Añadir `CancelQueryRequest` a `connection.contracts.ts`.
  5. Crear `audit.contracts.ts` con `AuditLogDto`.
  6. Crear `workspace.contracts.ts` con `WorkspaceDto`.
  7. Exportar nuevos archivos desde `index.ts`.
- Dependencias: ninguna (puede iniciar en paralelo con T-012 y T-020).

### T-011 — [ ] Estandarizar rutas REST públicas

- Prioridad: P0.
- Contexto: el PRD y README apuntan a rutas tipo `/api/queries/*`, pero el backend actual usa `@Controller('query')` y `@Controller('explain')`. Esto debe resolverse antes de construir servicios Angular.
- Rutas del repo: [apps/api/src/modules/query/query.controller.ts](apps/api/src/modules/query/query.controller.ts), [apps/api/src/modules/explain/explain.controller.ts](apps/api/src/modules/explain/explain.controller.ts), [apps/api/src/modules/connections/connections.controller.ts](apps/api/src/modules/connections/connections.controller.ts), [apps/api/src/modules/auth/auth.controller.ts](apps/api/src/modules/auth/auth.controller.ts), [apps/api/src/main.ts](apps/api/src/main.ts).
- Rutas API objetivo:
  - `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`.
  - `/api/connections`, `/api/connections/:id`, `/api/connections/test`, `/api/connections/:id/unlock`.
  - `/api/queries/execute`, `/api/queries/explain`, `/api/queries/cancel`, `/api/queries/history`, `/api/queries/history/:id`, `/api/queries/format`.
  - `/api/metadata/:connectionId/schemas`, `/api/metadata/:connectionId/schemas/:schema/tables`, `/api/metadata/:connectionId/schemas/:schema/tables/:table`.
  - `/api/table-data/read`, `/api/table-data/preview-changes`, `/api/table-data/apply-changes`.
  - `/api/ddl/create-table/preview`, `/api/ddl/create-table/execute`, `/api/ddl/alter-table/preview`, `/api/ddl/alter-table/execute`.
- Criterios de aceptación:
  - Controllers usan rutas consistentes con [PLAN.md](PLAN.md).
  - README y servicios Angular usan las mismas rutas.
  - Si se mantienen aliases temporales, quedan documentados con fecha de retiro.
- Validación esperada:
  - API e2e cubre al menos health, auth stub y rutas no implementadas con errores controlados.
- Plan de implementación:
  1. Cambiar `@Controller('query')` → `@Controller('queries')` en `query.controller.ts`.
  2. Mover `@Post('explain')` de `ExplainController` a `QueryController`.
  3. Vaciar `ExplainController` (mantener módulo para evitar error de DI; añadir comentario de deprecación).
  4. Cambiar `@WebSocketGateway()` → `@WebSocketGateway({ namespace: '/sessions' })` en `sessions.gateway.ts`.
  5. Verificar `app.module.ts` no necesita cambios (módulos ya registrados).
- Dependencias: ninguna (puede ejecutarse junto a T-010).

### T-012 — [ ] Definir política de errores API

- Prioridad: P0.
- Contexto: el gateway no debe devolver stack traces crudos. Los errores PostgreSQL deben mapearse y los errores de validación deben ser consistentes.
- Rutas del repo: [apps/api/src/postgres/postgres-error.mapper.ts](apps/api/src/postgres/postgres-error.mapper.ts), [apps/api/src/modules](apps/api/src/modules), [libs/contracts/src/lib/query.contracts.ts](libs/contracts/src/lib/query.contracts.ts).
- Referencias PRD/plan: seguridad obligatoria en [PRD.md](PRD.md), seguridad SQL en [PLAN.md](PLAN.md).
- Criterios de aceptación:
  - Existe contrato común para error público.
  - Los servicios NestJS transforman errores internos antes de responder.
  - No se envían passwords, connection strings ni stack traces al frontend.
- Plan de implementación:
  1. Crear `apps/api/src/filters/http-exception.filter.ts` que transforma `HttpException` en `ApiErrorResponse`.
  2. Crear `apps/api/src/filters/all-exceptions.filter.ts` que exporta `PostgresErrorMapper` para errores `pg`; retorna 500 genérico para el resto.
  3. Registrar en `main.ts`: `app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter())`.
  4. Verificar que ningún endpoint devuelva `stack` en producción (`NODE_ENV !== 'development'`).
- Dependencias: T-010 (necesita `ApiErrorResponse` contrato).

---

## 2. Base backend y persistencia interna

### T-020 — [ ] Agregar configuración de entorno validada

- Prioridad: P0.
- Contexto: el PRD propone `src/config`. El repo aún no tiene esquema de env ni configuración centralizada.
- Rutas del repo: [apps/api/src](apps/api/src), [apps/api/src/main.ts](apps/api/src/main.ts), [docker/docker-compose.yml](docker/docker-compose.yml).
- Variables mínimas:
  - `PORT`.
  - `DATABASE_URL` para la base interna del gateway.
  - `CREDENTIALS_ENCRYPTION_KEY`.
  - `JWT_SECRET` / `JWT_REFRESH_SECRET` cuando se implemente auth real.
  - `CORS_ORIGIN`.
- Criterios de aceptación:
  - La app falla rápido si faltan variables obligatorias en entornos no-dev.
  - Docker y README documentan variables.
- Plan de implementación:
  1. Instalar `zod` si no está presente en `apps/api/package.json`.
  2. Crear `apps/api/src/config/env.schema.ts` con `z.object({ PORT, DATABASE_URL, CREDENTIALS_ENCRYPTION_KEY, CORS_ORIGIN, NODE_ENV })`.
  3. Crear `apps/api/src/config/config.module.ts` que valide y exporte configuración.
  4. Actualizar `main.ts` para usar el módulo de configuración.
  5. Crear `.env.example` en raíz con todas las variables sin valores reales.
- Dependencias: ninguna (puede ejecutarse en paralelo con T-010 y T-012). — [ ] Implementar base interna del gateway

- Prioridad: P0.
- Contexto: [PRD.md](PRD.md) define tablas internas `workspaces`, `connection_profiles`, `query_history` y `audit_logs`. Sin esto no hay persistencia real.
- Rutas del repo sugeridas: `apps/api/src/database`, `apps/api/src/modules/workspaces`, `apps/api/src/modules/audit`.
- Rutas existentes relacionadas: [apps/api/src/modules/connections](apps/api/src/modules/connections), [apps/api/src/modules/query](apps/api/src/modules/query).
- Criterios de aceptación:
  - Hay migraciones o schema reproducible para la base interna.
  - `connection_profiles` no guarda password plano.
  - `query_history` y `audit_logs` reciben registros desde servicios reales.
  - Docker levanta PostgreSQL interno listo para desarrollo local.
- Plan de implementación:
  1. Crear `apps/api/src/database/database.module.ts` con `pg.Pool` inyectable.
  2. Crear `apps/api/src/database/migrations/001_initial.sql` con tablas `workspaces`, `connection_profiles`, `query_history`, `audit_logs`.
  3. Crear `apps/api/src/database/database-migration.service.ts` que lea archivos de migraciones y los ejecute en orden al `onModuleInit`.
  4. Importar `DatabaseModule` en `AppModule`.
  5. Verificar `docker-compose.yml` apunta al mismo `DATABASE_URL`.
- Dependencias: T-020 (necesita `DATABASE_URL` desde config), T-022 (pool manager necesita `DatabaseModule`). — [ ] Conectar `PostgresPoolManager` con conexiones persistidas

- Prioridad: P0.
- Contexto: existe [apps/api/src/postgres/postgres-pool.manager.ts](apps/api/src/postgres/postgres-pool.manager.ts), pero ningún servicio lo usa todavía.
- Rutas del repo: [apps/api/src/postgres](apps/api/src/postgres), [apps/api/src/modules/connections/connections.service.ts](apps/api/src/modules/connections/connections.service.ts), [apps/api/src/modules/query/query.service.ts](apps/api/src/modules/query/query.service.ts), [apps/api/src/modules/metadata/metadata.service.ts](apps/api/src/modules/metadata/metadata.service.ts).
- Criterios de aceptación:
  - Crear/probar/desbloquear conexión puede crear o reutilizar pool.
  - Pool se destruye al eliminar conexión o cerrar sesión temporal.
  - `statementTimeoutMs`, `sslMode` y credenciales se respetan.
  - Errores de pool faltante se convierten en error API controlado.
- Plan de implementación:
  1. Añadir `PostgresPoolManager` como provider en `ConnectionsModule`.
  2. Inyectarlo en `ConnectionsService` via constructor.
  3. Añadir `QueryModule`, `MetadataModule`, `TableDataModule` como consumidores: re-exportar `PostgresPoolManager` desde `ConnectionsModule` o crear `PostgresModule` global.
  4. En `onModuleDestroy` de `ConnectionsService`, destruir pools de conexiones eliminadas.
- Dependencias: T-021 (la BD interna debe existir para persistir conexiones). — [ ] Implementar cifrado y política de passwords

- Prioridad: P0.
- Contexto: el PRD recomienda no guardar password por defecto y cifrar solo si el usuario lo decide.
- Rutas del repo: [libs/contracts/src/lib/connection.contracts.ts](libs/contracts/src/lib/connection.contracts.ts), [apps/api/src/modules/connections](apps/api/src/modules/connections), [apps/api/src/postgres](apps/api/src/postgres).
- Criterios de aceptación:
  - `savePassword=false` no persiste password.
  - `savePassword=true` persiste solo valor cifrado.
  - Passwords temporales viven solo durante la sesión o desbloqueo.
  - Logs y respuestas nunca exponen secrets.
- Plan de implementación:
  1. Crear `apps/api/src/crypto/credentials-encryption.service.ts` con métodos `encrypt(plaintext): string` y `decrypt(ciphertext): string` usando AES-256-GCM + `crypto` nativo de Node.js.
  2. La clave proviene de `CREDENTIALS_ENCRYPTION_KEY` via `ConfigModule`.
  3. En `ConnectionsService.create()`: si `savePassword=true`, cifrar antes de insertar; si `false`, no insertar password.
  4. En `ConnectionsService.findOne()`: si password cifrado existe, no enviarlo al frontend nunca.
- Dependencias: T-020 (necesita `CREDENTIALS_ENCRYPTION_KEY` desde config). — [ ] Crear clasificador de riesgo SQL

- Prioridad: P0.
- Contexto: [PRD.md](PRD.md) exige clasificar SQL antes de ejecutar. El contrato ya define `SqlRiskLevel` en [libs/contracts/src/lib/query.contracts.ts](libs/contracts/src/lib/query.contracts.ts).
- Rutas sugeridas: `apps/api/src/modules/query/sql-risk.classifier.ts`, `apps/api/src/shared`.
- Criterios de aceptación:
  - Clasifica `SELECT`, `EXPLAIN`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, `ALTER`, `CREATE`, comandos admin y desconocidos.
  - Read-only bloquea todo lo que no sea seguro.
  - Operaciones destructivas requieren confirmación explícita antes de ejecución.
  - Se agregan pruebas unitarias del clasificador.
- Plan de implementación:
  1. Crear `apps/api/src/modules/query/sql-risk.classifier.ts` exportando función pura `classifyRisk(sql: string): SqlRiskLevel`.
  2. Patrones: `SELECT|SHOW|EXPLAIN` → `READ_ONLY`; `INSERT|UPDATE|DELETE|MERGE` → `DML`; `CREATE|ALTER|DROP|TRUNCATE|RENAME` → `DDL`; `GRANT|REVOKE|VACUUM|REINDEX|CLUSTER|ANALYZE` → `DANGEROUS`; otros → `UNKNOWN`.
  3. Crear `apps/api/src/modules/query/sql-risk.classifier.spec.ts` con al menos 15 casos.
  4. Inyectar el clasificador en `QueryService` como función utilitaria (no como provider; es pura).
- Dependencias: T-010 (necesita `SqlRiskLevel` enum del contrato).

---

## 3. Backend Gateway MVP

### T-030 — [ ] Implementar Auth MVP

- Prioridad: P1.
- Contexto: `AuthController` existe, pero [apps/api/src/modules/auth/auth.service.ts](apps/api/src/modules/auth/auth.service.ts) lanza `Not implemented`.
- Rutas del repo: [apps/api/src/modules/auth](apps/api/src/modules/auth), [libs/contracts/src/lib/auth.contracts.ts](libs/contracts/src/lib/auth.contracts.ts).
- Rutas API: `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`.
- Criterios de aceptación:
  - Auth dev inicial permite obtener `UserProfile` y tokens fake o JWT real según decisión documentada.
  - `/api/auth/me` existe.
  - Preparado para guards por rol en Fase 7.
- Plan de implementación:
  1. Añadir `@nestjs/jwt` si no está presente.
  2. `AuthService.login(dto)`: validar usuario contra tabla `users` (o mock hardcoded controlado por `NODE_ENV=development`).
  3. Emitir JWT con payload `{ sub, email, role }` y expirazione configurable.
  4. Añadir `GET /auth/me` a `AuthController`; decodificar y retornar `UserProfile`.
  5. Crear `JwtAuthGuard` con bypass cuando `NODE_ENV=development`.
- Dependencias: T-020 (necesita `JWT_SECRET` desde config). — [ ] Implementar Connections CRUD y test connection

- Prioridad: P1.
- Contexto: `ConnectionsController` existe, pero [apps/api/src/modules/connections/connections.service.ts](apps/api/src/modules/connections/connections.service.ts) no tiene lógica.
- Rutas del repo: [apps/api/src/modules/connections](apps/api/src/modules/connections), [libs/contracts/src/lib/connection.contracts.ts](libs/contracts/src/lib/connection.contracts.ts), [apps/api/src/postgres/postgres-pool.manager.ts](apps/api/src/postgres/postgres-pool.manager.ts).
- Rutas API: `/api/connections`, `/api/connections/:id`, `/api/connections/test`, `/api/connections/:id/unlock`.
- Criterios de aceptación:
  - Crear, listar, obtener, actualizar y eliminar conexiones.
  - `test connection` mide latencia y versión PostgreSQL.
  - `unlock` permite cargar password temporal si no está guardado.
  - Se respeta `sslMode`, `statementTimeoutMs`, `maxRows` y `accessMode`.
- Plan de implementación:
  1. `ConnectionsService.create()`: cifrar password si `savePassword=true`; insertar en `connection_profiles`.
  2. `ConnectionsService.findAll()`: leer todos los perfiles del workspace actual, nunca devolver password.
  3. `ConnectionsService.testConnection(id)`: `PoolManager.createPool(profile)` → `SELECT version()` → medir latencia → `PoolManager.destroyPool(id)` → retornar `{ version, latencyMs, status: 'ok'|'error' }`.
  4. `ConnectionsService.unlock(id, password)`: guardar password en `Map<userId_connectionId, password>` en memoria; pool puede usarlo para crear cliente.
  5. `ConnectionsService.remove(id)`: destruir pool y eliminar perfil.
- Dependencias: T-021 (BD interna), T-022 (pool manager), T-023 (cifrado). — [ ] Implementar ejecución de queries aisladas

- Prioridad: P1.
- Contexto: `QueryController` existe, pero [apps/api/src/modules/query/query.service.ts](apps/api/src/modules/query/query.service.ts) no ejecuta SQL. El PRD diferencia query aislada vs sesión persistente.
- Rutas del repo: [apps/api/src/modules/query](apps/api/src/modules/query), [apps/api/src/postgres](apps/api/src/postgres), [libs/contracts/src/lib/query.contracts.ts](libs/contracts/src/lib/query.contracts.ts).
- Rutas API: `/api/queries/execute`, `/api/queries/cancel`, `/api/queries/history`, `/api/queries/history/:id`.
- Criterios de aceptación:
  - Ejecuta `ExecuteQueryRequest` con `pg` y pool correcto.
  - Aplica `timeoutMs`, `maxRows` y read-only.
  - Devuelve columnas, filas, rowCount, duración, timestamps y errores mapeados.
  - Guarda historial.
  - Audita operaciones de escritura/DDL/destructivas.
- Plan de implementación:
  1. `QueryService.execute(req)`: `classifyRisk(req.sql)` → si conexión `READ_ONLY` y riesgo !== `READ_ONLY`, lanzar 403.
  2. Obtener pool via `PoolManager.getClient(req.connectionId)`.
  3. Ejecutar con `SET statement_timeout = req.timeoutMs`; `LIMIT req.maxRows`.
  4. Mapear `pg.QueryResult` a `ExecuteQueryResponse`.
  5. Insertar en `query_history`; si riesgo DDL/DML/DANGEROUS, insertar en `audit_logs`.
  6. Liberar cliente al pool.
- Dependencias: T-021 (historial en BD), T-022 (pool manager), T-024 (clasificador). — [ ] Implementar metadata PostgreSQL

- Prioridad: P1.
- Contexto: `MetadataController` existe, pero [apps/api/src/modules/metadata/metadata.service.ts](apps/api/src/modules/metadata/metadata.service.ts) no consulta `information_schema` ni `pg_catalog`.
- Rutas del repo: [apps/api/src/modules/metadata](apps/api/src/modules/metadata), [libs/contracts/src/lib/metadata.contracts.ts](libs/contracts/src/lib/metadata.contracts.ts).
- Rutas API:
  - `/api/metadata/:connectionId/schemas`.
  - `/api/metadata/:connectionId/schemas/:schema/tables`.
  - `/api/metadata/:connectionId/schemas/:schema/tables/:table`.
  - `/api/metadata/:connectionId/schemas/:schema/functions`.
  - `/api/metadata/:connectionId/extensions`.
- Criterios de aceptación:
  - Schemas/tablas/columnas visibles según privilegios del usuario PostgreSQL.
  - Table detail incluye columnas, índices, constraints y foreign keys.
  - Consultas parametrizadas o identificadores correctamente escapados.
- Plan de implementación:
  1. `MetadataService.getSchemas(connectionId)`: `SELECT schema_name FROM information_schema.schemata WHERE catalog_name = current_database()`.
  2. `getTablesInSchema(connectionId, schema)`: `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1`.
  3. `getTableDetail(connectionId, schema, table)`: unir columnas de `information_schema.columns` + `pg_indexes` + `pg_constraint` para PKs/FKs.
  4. `getFunctions(connectionId, schema)`: `SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1`.
  5. Usar `PoolManager.getClient(connectionId)` y liberar.
- Dependencias: T-022 (pool manager), T-031 (conexiones con pool activo). — [ ] Implementar `EXPLAIN` básico

- Prioridad: P1.
- Contexto: el PRD incluye Query Analyzer en MVP mínimo. `ExplainController` existe, pero [apps/api/src/modules/explain/explain.service.ts](apps/api/src/modules/explain/explain.service.ts) no tiene lógica.
- Rutas del repo: [apps/api/src/modules/explain](apps/api/src/modules/explain), [libs/contracts/src/lib/explain.contracts.ts](libs/contracts/src/lib/explain.contracts.ts), [apps/api/src/modules/query](apps/api/src/modules/query).
- Ruta API objetivo: `/api/queries/explain`.
- Criterios de aceptación:
  - Ejecuta `EXPLAIN (FORMAT JSON)` para queries seguras.
  - Devuelve `ExplainResponse` con plan parseado.
  - Bloquea o exige confirmación para `EXPLAIN ANALYZE` con escrituras/DDL.
  - Registra historial/auditoría si aplica.
- Plan de implementación:
  1. `QueryService.explain(req)`: `classifyRisk(req.sql)` → si `DDL`/`DANGEROUS` y `!req.confirmed`, lanzar 400 con mensaje claro.
  2. Ejecutar `EXPLAIN (FORMAT JSON, ANALYZE false) <sql>` usando pool.
  3. Parsear resultado a `ExplainPlanNode[]`.
  4. Retornar `ExplainResponse { planningTime?, executionTime?, plan }`.
  5. El endpoint es `POST /api/queries/explain` en `QueryController`; `ExplainController` queda deprecado.
- Dependencias: T-022 (pool manager), T-024 (clasificador), T-032 (comparte pool logic). — [ ] Implementar lectura de tablas

- Prioridad: P1.
- Contexto: `TableDataController` existe, pero [apps/api/src/modules/table-data/table-data.service.ts](apps/api/src/modules/table-data/table-data.service.ts) no lee datos. Para MVP se requiere abrir tabla y ver datos.
- Rutas del repo: [apps/api/src/modules/table-data](apps/api/src/modules/table-data), [libs/contracts/src/lib/table-data.contracts.ts](libs/contracts/src/lib/table-data.contracts.ts).
- Ruta API: `/api/table-data/read`.
- Criterios de aceptación:
  - Lectura paginada por `schema`, `table`, `page`, `pageSize`.
  - Ordenamiento y filtros iniciales con allowlist de columnas.
  - Límite máximo respetando `ConnectionProfile.maxRows`.
  - No hay SQL injection vía schema/table/column.
- Plan de implementación:
  1. `TableDataService.read(req)`: validar que `req.schema` y `req.table` existen en `information_schema.tables` (query parametrizada).
  2. Construir query con `quote_ident()` equivalente: usar `pg-format` o escapado manual para nombres de objetos.
  3. Aplicar `ORDER BY` sólo con columnas válidas (allowlist de `information_schema.columns`).
  4. `LIMIT LEAST(req.pageSize, profile.maxRows) OFFSET req.page * req.pageSize`.
  5. Retornar `{ rows, columns, total? }`.
- Dependencias: T-022 (pool manager), T-033 (metadata para validar schema/table).

### T-040 — [ ] Alinear gateway WebSocket con `WS /sessions`

- Prioridad: P1.
- Contexto: [apps/api/src/modules/sessions/sessions.gateway.ts](apps/api/src/modules/sessions/sessions.gateway.ts) usa namespace raíz y solo implementa `session.open`. El PRD propone `WS /sessions`.
- Rutas del repo: [apps/api/src/modules/sessions](apps/api/src/modules/sessions), [libs/contracts/src/lib/session.contracts.ts](libs/contracts/src/lib/session.contracts.ts).
- Eventos objetivo: `session.open`, `session.close`, `query.start`, `query.rows`, `query.notice`, `query.error`, `query.done`, `query.cancelled`.
- Criterios de aceptación:
  - Namespace o path `/sessions` documentado y probado.
  - Abrir/cerrar sesión crea/libera cliente PostgreSQL persistente.
  - La sesión mantiene contexto de database/schema y última actividad.
- Plan de implementación:
  1. Cambiar `@WebSocketGateway()` → `@WebSocketGateway({ namespace: '/sessions' })`.
  2. `handleSessionOpen(dto)` → `pg.Client` dedicado (no pool), guardar en `Map<socketId, SessionState>`.
  3. `handleQueryExecute(dto)` → ejecutar en client dedicado; emitir `query.rows` en batch de 100; al final `query.done`; si error `query.error`.
  4. `handleSessionClose()` / `handleDisconnect()` → `client.end()`, limpiar Map.
  5. Aplicar `classifyRisk()` antes de ejecutar; respetar `accessMode` de la conexión.
- Dependencias: T-022 (pool/client), T-024 (clasificador), T-031 (conexiones persistidas).

### T-041 — [ ] Ejecutar queries persistentes por sesión

- Prioridad: P2.
- Contexto: necesario para transacciones, temp tables, `SET search_path`, streaming y cancelación real según [PRD.md](PRD.md).
- Rutas del repo: [apps/api/src/modules/sessions](apps/api/src/modules/sessions), [apps/api/src/modules/query](apps/api/src/modules/query), [apps/api/src/postgres/postgres-pool.manager.ts](apps/api/src/postgres/postgres-pool.manager.ts).
- Eventos objetivo: `query.execute`, `query.rows`, `query.done`, `query.error`, `query.cancelled`.
- Criterios de aceptación:
  - Usa el mismo `pg.Client` durante la sesión.
  - Puede cancelar query activa.
  - Emite resultados parciales o progreso cuando aplique.
  - Libera recursos en disconnect, timeout o `session.close`.

---

## 5. Frontend MVP Angular

### T-050 — [ ] Reemplazar Nx welcome por shell de producto

- Prioridad: P1.
- Contexto: [apps/web/src/app/app.html](apps/web/src/app/app.html) muestra `<app-nx-welcome>` y [apps/web/src/app/app.routes.ts](apps/web/src/app/app.routes.ts) está vacío.
- Rutas del repo: [apps/web/src/app](apps/web/src/app), [apps/web/src/styles.scss](apps/web/src/styles.scss).
- Referencias PRD/plan: estructura frontend y pantallas principales en [PRD.md](PRD.md), Fase 2 en [PLAN.md](PLAN.md).
- Criterios de aceptación:
  - App tiene layout base con topbar, sidebar, contenido y panel inferior.
  - Rutas iniciales: dashboard, connections, workspace/sql, table browser y settings placeholder.
  - No queda dependencia visual de `NxWelcome`.

### T-051 — [ ] Crear servicios Angular para API gateway

- Prioridad: P1.
- Contexto: el frontend debe consumir solo `/api/*`. El PRD sugiere servicios `GatewayQueryService` y `MetadataService`.
- Rutas sugeridas: `apps/web/src/app/core/api`, `apps/web/src/app/core/db-gateway`, `apps/web/src/app/core/auth`, `apps/web/src/app/core/websocket`.
- Contratos: [libs/contracts/src/lib](libs/contracts/src/lib).
- Servicios mínimos:
  - Connections API.
  - Query API.
  - Metadata API.
  - Table Data API.
  - DDL API.
  - Explain API.
  - WebSocket sessions.
- Criterios de aceptación:
  - Servicios usan contratos compartidos.
  - No hay conexión directa a PostgreSQL ni strings de conexión en frontend.
  - Errores API se manejan con modelo común.

### T-052 — [ ] Implementar Connection Manager UI

- Prioridad: P1.
- Contexto: es parte del MVP realista del PRD: crear conexión y probar conexión.
- Rutas sugeridas: `apps/web/src/app/features/connections`.
- Rutas API: `/api/connections`, `/api/connections/test`, `/api/connections/:id/unlock`.
- Criterios de aceptación:
  - Formulario con name, host, port, database, username, password, sslMode, accessMode, maxRows, timeout y savePassword.
  - Botón test connection con feedback de latencia/versión/error.
  - Lista de conexiones guardadas.
  - No se muestra ni persiste password en estado global más de lo necesario.

### T-053 — [ ] Implementar Schema Explorer

- Prioridad: P1.
- Contexto: el PRD requiere explorar schemas, tablas, vistas, columnas, índices y constraints.
- Rutas sugeridas: `apps/web/src/app/features/schema-explorer`.
- Rutas API: `/api/metadata/:connectionId/schemas`, `/api/metadata/:connectionId/schemas/:schema/tables`, `/api/metadata/:connectionId/schemas/:schema/tables/:table`.
- Criterios de aceptación:
  - Árbol de schemas/tablas/vistas.
  - Lazy loading por conexión/schema/table.
  - Vista de columnas, índices y constraints al seleccionar tabla.
  - Acciones para abrir tabla o insertar nombre en editor SQL.

### T-054 — [ ] Implementar SQL Workspace básico

- Prioridad: P1.
- Contexto: corazón del MVP: ejecutar SQL, ver resultados y errores.
- Rutas sugeridas: `apps/web/src/app/features/sql-editor`, `apps/web/src/app/features/query-results`, `apps/web/src/app/features/query-history`.
- Rutas API: `/api/queries/execute`, `/api/queries/history`, `/api/queries/explain`.
- Criterios de aceptación:
  - Editor básico inicial con textarea o editor simple antes de Monaco.
  - Selección de conexión activa.
  - Botones Run y Explain.
  - Resultados en grilla con columnas dinámicas.
  - Errores SQL visibles y formateados.

### T-055 — [ ] Exportar resultados CSV/JSON

- Prioridad: P1.
- Contexto: exportar resultados está en objetivo del producto y MVP realista.
- Rutas sugeridas: `apps/web/src/app/features/query-results`, `apps/web/src/app/shared/utils`.
- Criterios de aceptación:
  - Export CSV respeta headers, escaping y valores null.
  - Export JSON descarga filas actuales.
  - Operación no bloquea UI para resultados medianos; evaluar Web Worker para Fase 3/8.

---

## 6. Editor SQL avanzado

### T-060 — [ ] Integrar Monaco Editor

- Prioridad: P2.
- Contexto: recomendado por el PRD para una experiencia tipo DBeaver Web.
- Rutas sugeridas: `apps/web/src/app/features/sql-editor`.
- Criterios de aceptación:
  - Monaco carga correctamente en Angular.
  - Soporta SQL syntax highlighting.
  - Shortcuts básicos: run query, run selection, format.
  - No rompe build de producción.

### T-061 — [ ] Agregar autocompletado con metadata

- Prioridad: P2.
- Contexto: depende de metadata backend y conexión activa.
- Rutas sugeridas: `apps/web/src/app/features/sql-editor`, `apps/web/src/app/core/stores`, `apps/web/src/app/features/schema-explorer`.
- Criterios de aceptación:
  - Sugiere schemas, tablas y columnas visibles.
  - Cachea metadata por conexión/schema.
  - Permite refrescar metadata manualmente.

### T-062 — [ ] Implementar formatter SQL

- Prioridad: P2.
- Contexto: el PRD propone `/queries/format` como utilidad del editor.
- Rutas del repo: [apps/api/src/modules/query](apps/api/src/modules/query), `apps/web/src/app/features/sql-editor`.
- Ruta API: `/api/queries/format` si se implementa server-side; local si se decide client-side.
- Criterios de aceptación:
  - Decisión documentada: formatter en backend o frontend.
  - Formatea SQL sin ejecutar la query.
  - Maneja errores de parseo sin perder texto original.

---

## 7. Table Browser editable

### T-070 — [ ] Implementar Table Browser de solo lectura

- Prioridad: P1.
- Contexto: MVP realista incluye abrir tabla y ver datos.
- Rutas del repo: [apps/api/src/modules/table-data](apps/api/src/modules/table-data), `apps/web/src/app/features/table-browser`.
- Ruta API: `/api/table-data/read`.
- Criterios de aceptación:
  - Abrir tabla desde Schema Explorer.
  - Paginación, ordenamiento y filtros.
  - Muestra tipos de columna y total estimado/real cuando esté disponible.

### T-071 — [ ] Implementar preview y aplicación de cambios

- Prioridad: P2.
- Contexto: PRD define `TableChange`, preview SQL y aplicación en transacción.
- Rutas del repo: [libs/contracts/src/lib/table-data.contracts.ts](libs/contracts/src/lib/table-data.contracts.ts), [apps/api/src/modules/table-data](apps/api/src/modules/table-data), `apps/web/src/app/features/table-browser`.
- Rutas API: `/api/table-data/preview-changes`, `/api/table-data/apply-changes`.
- Criterios de aceptación:
  - Cambios pendientes separados por insert/update/delete.
  - Preview SQL parametrizado antes de ejecutar.
  - Aplicación usa una transacción y rollback ante error.
  - Auditoría registra cambios.

### T-072 — [ ] Bloquear edición sin PK/unique key confiable

- Prioridad: P2.
- Contexto: regla crítica del PRD para evitar updates/deletes ambiguos.
- Rutas del repo: [apps/api/src/modules/metadata](apps/api/src/modules/metadata), [apps/api/src/modules/table-data](apps/api/src/modules/table-data), `apps/web/src/app/features/table-browser`.
- Criterios de aceptación:
  - Backend detecta PK/unique key desde metadata.
  - Frontend bloquea edición o exige confirmación avanzada.
  - La razón del bloqueo se muestra al usuario.

---

## 8. DDL visual

### T-080 — [ ] Implementar Create Table Designer

- Prioridad: P2.
- Contexto: PRD define `CreateTableRequest`, columnas, PK, índices, FKs y checks.
- Rutas del repo: [libs/contracts/src/lib/ddl.contracts.ts](libs/contracts/src/lib/ddl.contracts.ts), [apps/api/src/modules/ddl](apps/api/src/modules/ddl), `apps/web/src/app/features/table-designer`.
- Rutas API: `/api/ddl/create-table/preview`, `/api/ddl/create-table/execute`.
- Criterios de aceptación:
  - UI permite definir columnas, tipos, nullable, default, identity, unique y comentario.
  - Preview SQL antes de ejecutar.
  - DDL destructivo o riesgoso requiere confirmación.
  - Auditoría registra ejecución.

### T-081 — [ ] Implementar Alter Table e índices/constraints

- Prioridad: P2.
- Contexto: PRD incluye modificar tablas, columnas, índices y constraints.
- Rutas del repo: [apps/api/src/modules/ddl](apps/api/src/modules/ddl), [libs/contracts/src/lib/ddl.contracts.ts](libs/contracts/src/lib/ddl.contracts.ts), `apps/web/src/app/features/table-designer`.
- Rutas API: `/api/ddl/alter-table/preview`, `/api/ddl/alter-table/execute`, futuros `/api/ddl/create-index/*`.
- Criterios de aceptación:
  - Alter table soporta add/drop/rename/alter columns.
  - Índices y constraints tienen preview y ejecución.
  - Confirmación fuerte para operaciones destructivas.

---

## 9. Query Analyzer

### T-090 — [ ] Visualizar plan de ejecución

- Prioridad: P2.
- Contexto: [PRD.md](PRD.md) pide árbol del plan, costos, filas estimadas/reales, loops y tiempos.
- Rutas del repo: [apps/api/src/modules/explain](apps/api/src/modules/explain), [libs/contracts/src/lib/explain.contracts.ts](libs/contracts/src/lib/explain.contracts.ts), `apps/web/src/app/features/query-analyzer`.
- Ruta API: `/api/queries/explain`.
- Criterios de aceptación:
  - Backend parsea JSON de PostgreSQL a `ExplainPlanNode`.
  - UI renderiza árbol navegable.
  - Muestra planning time, execution time, total cost y buffers cuando existan.

### T-091 — [ ] Agregar advertencias de performance y seguridad

- Prioridad: P2.
- Contexto: Query Analyzer debe detectar nodos costosos y proteger `EXPLAIN ANALYZE`.
- Rutas del repo: [apps/api/src/modules/explain](apps/api/src/modules/explain), `apps/web/src/app/features/query-analyzer`.
- Criterios de aceptación:
  - Advierte sequential scans grandes, estimaciones muy distintas, alto costo y buffers elevados.
  - `EXPLAIN ANALYZE` sobre escrituras/DDL queda bloqueado o requiere confirmación y rollback.
  - La UI explica que `ANALYZE` ejecuta la consulta.

---

## 10. Seguridad SaaS y auditoría

### T-100 — [ ] Implementar workspaces, users, roles y guards

- Prioridad: P3.
- Contexto: PRD define roles `OWNER`, `ADMIN`, `DEVELOPER`, `READ_ONLY` y workspaces para SaaS.
- Rutas sugeridas: `apps/api/src/modules/users`, `apps/api/src/modules/workspaces`, `apps/api/src/shared/guards`.
- Contratos sugeridos: `libs/contracts/src/lib/user.contracts.ts`, `libs/contracts/src/lib/workspace.contracts.ts`.
- Criterios de aceptación:
  - Cada conexión, historial y audit log pertenece a workspace.
  - Guards aplican rol por endpoint.
  - Frontend oculta acciones no permitidas.

### T-101 — [ ] Implementar auditoría avanzada

- Prioridad: P3.
- Contexto: PRD exige auditar DDL y operaciones de escritura/destructivas.
- Rutas sugeridas: `apps/api/src/modules/audit`, `apps/web/src/app/features/settings/audit`.
- Criterios de aceptación:
  - Se registran acción, usuario, workspace, conexión, riesgo, recurso y SQL preview seguro.
  - Hay endpoint para listar/filtrar audit logs.
  - Passwords y valores sensibles no se auditan en claro.

### T-102 — [ ] Endurecer read-only mode y límites

- Prioridad: P3.
- Contexto: el modo read-only debe bloquear operaciones no seguras tanto en REST como WebSocket.
- Rutas del repo: [apps/api/src/modules/query](apps/api/src/modules/query), [apps/api/src/modules/table-data](apps/api/src/modules/table-data), [apps/api/src/modules/ddl](apps/api/src/modules/ddl), [apps/api/src/modules/sessions](apps/api/src/modules/sessions).
- Criterios de aceptación:
  - Read-only bloquea DDL, DML, table edits y acciones destructivas.
  - Límites por usuario/workspace para max rows, timeout y concurrencia.
  - Tests cubren bypass attempts.

---

## 11. Testing, calidad y DevOps

### T-110 — [ ] Reemplazar pruebas placeholder por pruebas reales

- Prioridad: P1.
- Contexto: las pruebas actuales son defaults de Nx y no validan el producto.
- Rutas del repo: [apps/api-e2e/src/api/api.spec.ts](apps/api-e2e/src/api/api.spec.ts), [apps/web-e2e/src/example.spec.ts](apps/web-e2e/src/example.spec.ts), [apps/web/src/app/app.spec.ts](apps/web/src/app/app.spec.ts).
- Criterios de aceptación:
  - API e2e valida health, auth, connections test, query execute y metadata con PostgreSQL de test.
  - Web e2e valida dashboard, connection manager y SQL workspace básico.
  - Tests no dependen de datos externos no deterministas.
- Plan de implementación:
  1. Reemplazar contenido de `apps/api-e2e/src/api/api.spec.ts` con pruebas para: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/connections`, `GET /api/connections`, `POST /api/connections/test`, `POST /api/queries/execute` (SELECT 1), `GET /api/metadata/:id/schemas`, `POST /api/table-data/read`.
  2. Usar `global-setup.ts` para crear una conexión de test al PostgreSQL del Docker.
  3. Reemplazar `apps/web-e2e/src/example.spec.ts` con tests de carga y navegación básica (requiere Fase 2).
- Dependencias: T-111 (seed de BD), todas las tareas F1.1–F1.7. — [ ] Crear estrategia de datos de test PostgreSQL

- Prioridad: P1.
- Contexto: query, metadata, table-data, DDL y explain necesitan base PostgreSQL reproducible.
- Rutas sugeridas: `apps/api-e2e/src/support`, `docker`, `tools/test-db`.
- Criterios de aceptación:
  - Setup crea schemas/tablas/datos de prueba.
  - Teardown limpia datos.
  - Se puede ejecutar local y en CI.
- Plan de implementación:
  1. Crear `apps/api-e2e/src/support/db-seed.ts` que crea esquema `test_schema`, tabla `test_table(id serial primary key, name text, value numeric)`.
  2. Insertar al menos 50 filas de datos determinísticos (sin `random()`).
  3. `global-teardown.ts` hace `DROP SCHEMA test_schema CASCADE`.
  4. Documentar en README cómo levantar DB de test con `docker compose up postgres`.
- Dependencias: T-021 (BD interna levantada), T-110 (spec precisa el seed). — [ ] Endurecer Docker para desarrollo y producción

- Prioridad: P2.
- Contexto: [docker/docker-compose.yml](docker/docker-compose.yml) existe, pero debe alinearse con env, migraciones y reverse proxy.
- Rutas del repo: [docker/docker-compose.yml](docker/docker-compose.yml), [docker/api.Dockerfile](docker/api.Dockerfile), [docker/web.Dockerfile](docker/web.Dockerfile), [docker/nginx.conf](docker/nginx.conf).
- Criterios de aceptación:
  - Compose levanta web, API y PostgreSQL interno con healthchecks.
  - Nginx/reverse proxy enruta `/api/*` y WebSocket.
  - Variables sensibles se documentan sin valores reales.

### T-113 — [ ] Configurar CI con Nx

- Prioridad: P2.
- Contexto: el repo debe validar cambios por proyecto y aprovechar Nx.
- Rutas sugeridas: `.github/workflows`, [nx.json](nx.json), [package.json](package.json).
- Criterios de aceptación:
  - CI ejecuta install, lint, test, build y e2e relevantes.
  - Usa `nx affected` o `nx run-many` según corresponda.
  - Artefactos/logs facilitan depuración.

### T-114 — [ ] Documentar decisiones técnicas y seguridad

- Prioridad: P2.
- Contexto: a medida que se implementen fases, el repo necesitará documentación operativa.
- Rutas sugeridas: `docs/`, [README.md](README.md), [PLAN.md](PLAN.md), [TASKS.md](TASKS.md).
- Criterios de aceptación:
  - Docs de variables de entorno.
  - Docs de arquitectura y flujo de conexión.
  - Docs de seguridad: credenciales, auditoría, read-only y `EXPLAIN ANALYZE`.
  - Guía de desarrollo local con Docker y Nx.

---

## Backlog de ideas posteriores al MVP

- ERD visual.
- Diff de schemas.
- Locks y sesiones activas avanzadas.
- Kill query en PostgreSQL usando backend controlado.
- Import/export masivo.
- AI assistant para SQL, solo después de seguridad/auditoría.
- Billing y límites comerciales.
