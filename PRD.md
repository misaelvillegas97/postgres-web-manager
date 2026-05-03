Crea un monorepo con Nx usando apps/web para Angular y apps/api para NestJS.
Agrega una librería compartida libs/contracts para DTOs, enums e interfaces comunes entre frontend y backend.
El frontend consume solo /api/* vía proxy o reverse proxy, nunca conecta directo a PostgreSQL.
El backend NestJS actúa como gateway: valida permisos, ejecuta queries con pg, obtiene metadata y audita operaciones.

Perfecto. Con **Gateway Backend**, el producto deja de ser “Angular hablando directo con PostgreSQL” y pasa a ser:

```txt
Angular App
   ↓ HTTPS / WebSocket
PgStudio Gateway Backend
   ↓ TCP PostgreSQL protocol
PostgreSQL Server
```

Esta es la opción correcta para construir algo tipo DBeaver Web, porque el navegador trabaja por HTTP/WebSocket, mientras que PostgreSQL usa su propio protocolo cliente/servidor sobre TCP. El gateway se encarga de traducir la experiencia web a conexiones reales contra PostgreSQL. PostgreSQL expone metadata vía `information_schema`, útil para construir el explorador de schemas, tablas y columnas; para detalles más específicos también se puede complementar con `pg_catalog`. ([PostgreSQL][1])

# PRD técnico — PostgreSQL Web Manager con Angular + Gateway Backend

## 1. Objetivo del producto

Crear una aplicación web para administrar bases de datos PostgreSQL desde el navegador, con una experiencia similar a DBeaver, permitiendo:

* crear y guardar conexiones;
* explorar bases, schemas, tablas, vistas, columnas, índices y constraints;
* ejecutar queries SQL;
* editar datos en tablas;
* crear tablas visualmente;
* modificar estructura de tablas;
* analizar queries con `EXPLAIN` y `EXPLAIN ANALYZE`;
* ver tiempos de ejecución, planning time, execution time y plan de ejecución;
* exportar resultados;
* guardar historial de queries;
* manejar permisos y auditoría.

PostgreSQL permite analizar consultas con `EXPLAIN`; cuando se usa `ANALYZE`, la sentencia realmente se ejecuta y se agregan estadísticas reales de tiempo y filas retornadas. Esto es clave para tu módulo de análisis de performance. ([PostgreSQL][2])

---

# 2. Arquitectura general

## 2.1 Componentes principales

```txt
┌─────────────────────────────────────────────────────────────┐
│                         Angular App                         │
│                                                             │
│  SQL Editor | Schema Explorer | Table Editor | Query Analyze │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ HTTPS / WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    PgStudio Gateway Backend                  │
│                                                             │
│ Auth | Connection Manager | Query Runner | Metadata Reader   │
│ DDL Generator | Audit Logs | Result Streaming | Query Cancel  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ TCP PostgreSQL protocol
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       PostgreSQL Server                      │
└─────────────────────────────────────────────────────────────┘
```

## 2.2 Stack recomendado

### Frontend

* Angular.
* Standalone Components.
* Angular Signals.
* Tailwind CSS.
* Angular Material.
* Monaco Editor.
* TanStack Table o AG Grid.
* IndexedDB para cache local.
* Web Workers para operaciones pesadas de parseo/exportación.

Angular mantiene componentes standalone como modelo moderno de desarrollo, y las señales son parte de su sistema reactivo actual. ([Angular][3])

### Backend Gateway

* NestJS.
* Node.js.
* `pg` / node-postgres.
* WebSocket con `@nestjs/websockets`.
* Redis opcional para sesiones activas, locks y pub/sub.
* PostgreSQL propio para guardar usuarios, conexiones, auditoría e historial.
* Docker para despliegue.

NestJS permite organizar endpoints REST mediante controllers y lógica de negocio mediante providers; para WebSocket usa gateways con `@WebSocketGateway()`. ([NestJS Docs][4])

---

# 3. Modelo de conexión

## 3.1 Tipos de conexión soportadas

```ts
export enum ConnectionMode {
  DIRECT_GATEWAY = 'DIRECT_GATEWAY',
  READ_ONLY = 'READ_ONLY',
  TEMPORARY = 'TEMPORARY',
}
```

### `DIRECT_GATEWAY`

El usuario guarda una conexión PostgreSQL en la plataforma.

### `READ_ONLY`

El gateway fuerza validaciones para permitir solo `SELECT`, `EXPLAIN` y consultas no destructivas.

### `TEMPORARY`

La conexión vive solo en memoria durante la sesión. No se guarda contraseña.

---

# 4. Decisión importante: conexiones persistentes vs queries aisladas

Para una herramienta tipo DBeaver necesitas ambos modos.

## 4.1 Query aislada

Sirve para:

* metadata;
* queries simples;
* `SELECT`;
* `EXPLAIN`;
* operaciones sin estado.

```txt
Angular → POST /query/execute → Gateway usa pool → PostgreSQL
```

Para este caso puedes usar `pool.query()`.

## 4.2 Sesión persistente

Sirve para:

* transacciones;
* temp tables;
* `SET search_path`;
* cancelación de queries;
* streaming;
* mantener contexto;
* múltiples statements relacionados.

```txt
Angular → WebSocket Session → Gateway mantiene pg.Client → PostgreSQL
```

Esto es importante porque en node-postgres las transacciones deben ejecutarse usando la misma instancia de cliente; no se deben hacer transacciones con `pool.query()` repartido entre conexiones distintas. ([Node Postgres][5])

---

# 5. Módulos del backend gateway

## 5.1 AuthModule

Responsable de:

* login;
* refresh token;
* usuarios;
* roles;
* permisos;
* organización/tenant si será SaaS;
* API keys para integraciones futuras.

Roles mínimos:

```ts
export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
  READ_ONLY = 'READ_ONLY',
}
```

---

## 5.2 ConnectionModule

Responsable de administrar conexiones PostgreSQL.

Funciones:

* crear conexión;
* editar conexión;
* probar conexión;
* eliminar conexión;
* encriptar credenciales;
* definir modo read-only;
* definir `statement_timeout`;
* definir `max_rows`;
* definir `sslMode`;
* definir color/nombre de conexión.

Modelo:

```ts
export interface ConnectionProfile {
  id: string;
  workspaceId: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  encryptedPassword?: string;
  sslMode: 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  defaultSchema?: string;
  accessMode: 'read-only' | 'read-write' | 'admin';
  statementTimeoutMs: number;
  maxRows: number;
  createdAt: string;
  updatedAt: string;
}
```

Regla recomendada: por defecto, **no guardar password**. Permitir estas opciones:

```txt
[ ] Guardar contraseña cifrada
[x] Pedir contraseña en cada sesión
[x] Mantener contraseña solo mientras la pestaña esté abierta
```

---

## 5.3 QueryModule

Responsable de ejecutar SQL.

Funciones:

* ejecutar query;
* ejecutar selección;
* ejecutar múltiples statements;
* validar modo read-only;
* aplicar timeout;
* limitar resultados;
* medir duración;
* devolver columnas tipadas;
* capturar errores;
* registrar historial;
* permitir cancelación.

Request:

```ts
export interface ExecuteQueryRequest {
  connectionId: string;
  sessionId?: string;
  sql: string;
  params?: unknown[];
  maxRows?: number;
  timeoutMs?: number;
  mode: 'single' | 'script' | 'selection';
}
```

Response:

```ts
export interface ExecuteQueryResponse {
  queryId: string;
  status: 'success' | 'error' | 'cancelled';
  statement: string;
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  startedAt: string;
  endedAt: string;
  notices?: string[];
  error?: QueryError;
}
```

---

## 5.4 MetadataModule

Responsable del explorador de base de datos.

Endpoints:

```txt
GET /metadata/schemas
GET /metadata/tables
GET /metadata/views
GET /metadata/materialized-views
GET /metadata/sequences
GET /metadata/functions
GET /metadata/enums
GET /metadata/extensions
GET /metadata/table/:schema/:table
GET /metadata/table/:schema/:table/columns
GET /metadata/table/:schema/:table/indexes
GET /metadata/table/:schema/:table/constraints
GET /metadata/table/:schema/:table/foreign-keys
```

Para metadata portable usar `information_schema`; para detalles avanzados de PostgreSQL usar `pg_catalog`. El `information_schema.tables` muestra tablas y vistas visibles para el usuario actual, y `information_schema.columns` muestra columnas accesibles según privilegios. ([PostgreSQL][6])

---

## 5.5 TableDataModule

Responsable de ver y editar datos de tablas.

Funciones:

* listar datos de una tabla;
* paginar;
* ordenar;
* filtrar;
* editar celda;
* insertar fila;
* eliminar fila;
* aplicar cambios;
* previsualizar SQL generado.

Flujo:

```txt
Usuario abre tabla
→ Gateway obtiene columnas + PK
→ Frontend muestra grilla editable
→ Usuario modifica datos
→ Frontend arma cambios pendientes
→ Gateway genera SQL parametrizado
→ Usuario revisa preview
→ Gateway ejecuta en transacción
```

Modelo de cambio:

```ts
export interface TableChange {
  type: 'insert' | 'update' | 'delete';
  schema: string;
  table: string;
  primaryKey?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}
```

Regla crítica: si la tabla no tiene primary key ni unique key confiable, la edición debería quedar bloqueada o pedir confirmación avanzada.

---

## 5.6 DDLModule

Responsable de crear y modificar estructura.

Funciones:

* crear tabla;
* modificar tabla;
* agregar columna;
* eliminar columna;
* renombrar columna;
* cambiar tipo;
* crear índice;
* eliminar índice;
* crear constraint;
* eliminar constraint;
* generar preview SQL;
* ejecutar DDL.

Modelo para crear tabla:

```ts
export interface CreateTableRequest {
  connectionId: string;
  schema: string;
  tableName: string;
  comment?: string;
  columns: CreateTableColumn[];
  primaryKey?: string[];
  indexes?: CreateIndexRequest[];
  foreignKeys?: CreateForeignKeyRequest[];
  checks?: CreateCheckConstraintRequest[];
}
```

```ts
export interface CreateTableColumn {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  defaultValue?: string;
  identity?: boolean;
  unique?: boolean;
  comment?: string;
}
```

DDL preview:

```sql
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 5.7 ExplainModule

Responsable de análisis de rendimiento.

Funciones:

* ejecutar `EXPLAIN`;
* ejecutar `EXPLAIN ANALYZE`;
* ejecutar `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`;
* parsear plan JSON;
* mostrar árbol;
* detectar nodos costosos;
* comparar estimado vs real;
* mostrar planning time;
* mostrar execution time.

Request:

```ts
export interface ExplainRequest {
  connectionId: string;
  sql: string;
  analyze: boolean;
  buffers: boolean;
  format: 'json' | 'text';
}
```

Response:

```ts
export interface ExplainResponse {
  queryId: string;
  format: 'json' | 'text';
  planningTimeMs?: number;
  executionTimeMs?: number;
  totalCost?: number;
  plan: ExplainPlanNode;
  raw: unknown;
}
```

Advertencia importante: `EXPLAIN ANALYZE` ejecuta realmente la consulta. Por eso, si el statement es `INSERT`, `UPDATE`, `DELETE` o DDL, debe ejecutarse dentro de transacción con rollback o directamente bloquearse salvo confirmación explícita. PostgreSQL documenta que `ANALYZE` ejecuta la sentencia para obtener estadísticas reales. ([PostgreSQL][2])

---

## 5.8 SessionModule

Responsable de sesiones interactivas.

Funciones:

* abrir sesión;
* mantener conexión PostgreSQL viva;
* cerrar sesión;
* renovar sesión;
* cancelar query activa;
* manejar transacciones;
* emitir eventos por WebSocket.

Flujo:

```txt
Angular abre WebSocket
→ Gateway crea sesión
→ Gateway abre pg.Client
→ Usuario ejecuta queries
→ Misma conexión se reutiliza
→ Usuario cierra pestaña
→ Gateway libera conexión
```

Eventos WebSocket:

```ts
export type GatewayEvent =
  | 'session.open'
  | 'session.close'
  | 'query.start'
  | 'query.rows'
  | 'query.notice'
  | 'query.error'
  | 'query.done'
  | 'query.cancelled';
```

---

# 6. API REST propuesta

## Auth

```txt
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

## Connections

```txt
GET    /connections
POST   /connections
GET    /connections/:id
PATCH  /connections/:id
DELETE /connections/:id
POST   /connections/test
POST   /connections/:id/unlock
```

## Queries

```txt
POST /queries/execute
POST /queries/explain
POST /queries/cancel
GET  /queries/history
GET  /queries/history/:id
POST /queries/format
```

## Metadata

```txt
GET /metadata/:connectionId/schemas
GET /metadata/:connectionId/tables?schema=public
GET /metadata/:connectionId/table-detail?schema=public&table=users
GET /metadata/:connectionId/functions
GET /metadata/:connectionId/extensions
```

## Table Data

```txt
POST /table-data/read
POST /table-data/preview-changes
POST /table-data/apply-changes
```

## DDL

```txt
POST /ddl/create-table/preview
POST /ddl/create-table/execute
POST /ddl/alter-table/preview
POST /ddl/alter-table/execute
POST /ddl/create-index/preview
POST /ddl/create-index/execute
```

---

# 7. WebSocket propuesto

Endpoint:

```txt
WS /sessions
```

Abrir sesión:

```json
{
  "type": "session.open",
  "payload": {
    "connectionId": "conn_123",
    "database": "app",
    "schema": "public"
  }
}
```

Ejecutar query:

```json
{
  "type": "query.execute",
  "payload": {
    "queryId": "query_123",
    "sql": "SELECT * FROM users LIMIT 100",
    "maxRows": 1000
  }
}
```

Respuesta parcial:

```json
{
  "type": "query.rows",
  "payload": {
    "queryId": "query_123",
    "rows": [
      {
        "id": 1,
        "email": "test@test.cl"
      }
    ]
  }
}
```

Finalización:

```json
{
  "type": "query.done",
  "payload": {
    "queryId": "query_123",
    "rowCount": 100,
    "durationMs": 42.6
  }
}
```

---

# 8. Esquema de base de datos interna del gateway

Esta es la base de datos de tu plataforma, no la base que el usuario administra.

```sql
CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE connection_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  host text NOT NULL,
  port integer NOT NULL DEFAULT 5432,
  database_name text NOT NULL,
  username text NOT NULL,
  encrypted_password text,
  ssl_mode text NOT NULL DEFAULT 'prefer',
  access_mode text NOT NULL DEFAULT 'read-write',
  statement_timeout_ms integer NOT NULL DEFAULT 30000,
  max_rows integer NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE query_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  connection_id uuid REFERENCES connection_profiles(id),
  user_id uuid NOT NULL,
  sql text NOT NULL,
  status text NOT NULL,
  duration_ms numeric,
  row_count integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  connection_id uuid REFERENCES connection_profiles(id),
  user_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text,
  resource_name text,
  sql_preview text,
  risk_level text NOT NULL DEFAULT 'low',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

# 9. Estructura backend NestJS

```txt
src
├── app.module.ts
├── config
│   ├── env.schema.ts
│   └── configuration.ts
├── modules
│   ├── auth
│   ├── users
│   ├── workspaces
│   ├── connections
│   ├── query
│   ├── metadata
│   ├── table-data
│   ├── ddl
│   ├── explain
│   ├── sessions
│   └── audit
├── database
│   ├── platform-data-source.ts
│   └── migrations
├── postgres
│   ├── postgres-client.factory.ts
│   ├── postgres-pool.manager.ts
│   ├── postgres-error.mapper.ts
│   └── identifier-quote.util.ts
└── shared
    ├── guards
    ├── decorators
    ├── interceptors
    └── exceptions
```

---

# 10. Estructura frontend Angular

```txt
src/app
├── core
│   ├── api
│   ├── auth
│   ├── db-gateway
│   ├── stores
│   └── websocket
├── shell
│   ├── app-layout
│   ├── topbar
│   ├── sidebar
│   └── bottom-panel
├── features
│   ├── connections
│   ├── workspace
│   ├── schema-explorer
│   ├── sql-editor
│   ├── query-results
│   ├── table-browser
│   ├── table-designer
│   ├── query-analyzer
│   ├── query-history
│   └── settings
└── shared
    ├── ui
    ├── pipes
    ├── directives
    └── utils
```

---

# 11. Servicios Angular principales

## GatewayQueryService

```ts
@Injectable({ providedIn: 'root' })
export class GatewayQueryService {
  private readonly http = inject(HttpClient);

  execute(request: ExecuteQueryRequest) {
    return this.http.post<ExecuteQueryResponse>(
      '/api/queries/execute',
      request,
    );
  }

  explain(request: ExplainRequest) {
    return this.http.post<ExplainResponse>(
      '/api/queries/explain',
      request,
    );
  }

  cancel(queryId: string) {
    return this.http.post('/api/queries/cancel', { queryId });
  }
}
```

## MetadataService

```ts
@Injectable({ providedIn: 'root' })
export class MetadataService {
  private readonly http = inject(HttpClient);

  getSchemas(connectionId: string) {
    return this.http.get<DbSchema[]>(
      `/api/metadata/${connectionId}/schemas`,
    );
  }

  getTables(connectionId: string, schema: string) {
    return this.http.get<DbTable[]>(
      `/api/metadata/${connectionId}/tables`,
      { params: { schema } },
    );
  }

  getTableDetail(connectionId: string, schema: string, table: string) {
    return this.http.get<TableDetail>(
      `/api/metadata/${connectionId}/table-detail`,
      { params: { schema, table } },
    );
  }
}
```

---

# 12. Seguridad obligatoria

## 12.1 Validaciones antes de ejecutar SQL

El gateway debe clasificar cada query:

```ts
export enum SqlRiskLevel {
  SAFE = 'SAFE',
  WRITE = 'WRITE',
  DDL = 'DDL',
  DESTRUCTIVE = 'DESTRUCTIVE',
  ADMIN = 'ADMIN',
  UNKNOWN = 'UNKNOWN',
}
```

Ejemplos:

| SQL                               | Riesgo      |
| --------------------------------- | ----------- |
| `SELECT * FROM users`             | SAFE        |
| `UPDATE users SET active = false` | WRITE       |
| `CREATE TABLE users (...)`        | DDL         |
| `DROP TABLE users`                | DESTRUCTIVE |
| `ALTER USER postgres`             | ADMIN       |

## 12.2 Reglas mínimas

* Si la conexión es read-only, bloquear todo lo que no sea `SELECT` o `EXPLAIN`.
* Si es DDL, pedir confirmación.
* Si es destructivo, pedir confirmación fuerte.
* Si no se puede clasificar, pedir confirmación.
* Aplicar `statement_timeout`.
* Aplicar límite de filas.
* Auditar todo DDL, DELETE, UPDATE, INSERT, TRUNCATE, DROP y ALTER.
* No loguear passwords.
* No devolver stack traces crudos al frontend.
* Cifrar credenciales con una key fuera de la base de datos.

---

# 13. Ejecución segura de queries

## 13.1 Query simple

```ts
@Injectable()
export class QueryRunnerService {
  constructor(
    private readonly poolManager: PostgresPoolManager,
    private readonly auditService: AuditService,
  ) {}

  async execute(request: ExecuteQueryRequest): Promise<ExecuteQueryResponse> {
    const pool = await this.poolManager.getPool(request.connectionId);

    const startedAt = performance.now();

    try {
      const result = await pool.query({
        text: request.sql,
        values: request.params ?? [],
      });

      const endedAt = performance.now();

      return {
        queryId: crypto.randomUUID(),
        status: 'success',
        statement: request.sql,
        columns: result.fields.map(field => ({
          name: field.name,
          dataTypeId: field.dataTypeID,
        })),
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
        durationMs: endedAt - startedAt,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw this.mapPostgresError(error);
    }
  }
}
```

## 13.2 Transacción para aplicar cambios de tabla

```ts
async applyChanges(request: ApplyTableChangesRequest) {
  const client = await this.poolManager.getClient(request.connectionId);

  try {
    await client.query('BEGIN');

    for (const change of request.changes) {
      const statement = this.tableChangeSqlBuilder.build(change);

      await client.query({
        text: statement.sql,
        values: statement.params,
      });
    }

    await client.query('COMMIT');

    return { status: 'success' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

Esto debe hacerse con el mismo cliente durante toda la transacción, coherente con la regla de node-postgres para transacciones. ([Node Postgres][5])

---

# 14. Pantallas principales

## 14.1 Dashboard

Debe mostrar:

* conexiones recientes;
* historial reciente;
* workspaces;
* botón “nueva conexión”;
* botón “abrir SQL editor”;
* métricas rápidas.

## 14.2 Connection Manager

Campos:

* nombre;
* host;
* port;
* database;
* username;
* password;
* SSL mode;
* access mode;
* max rows;
* timeout;
* color;
* test connection.

## 14.3 SQL Workspace

Debe incluir:

* árbol de schemas a la izquierda;
* editor Monaco al centro;
* tabs de queries;
* botón Run;
* botón Explain;
* botón Explain Analyze;
* panel inferior de resultados;
* panel de errores;
* panel de mensajes;
* panel de historial.

## 14.4 Table Browser

Debe permitir:

* ver datos;
* ordenar;
* filtrar;
* paginar;
* editar inline;
* insertar fila;
* eliminar fila;
* ver cambios pendientes;
* preview SQL;
* aplicar cambios en transacción.

## 14.5 Table Designer

Debe permitir:

* crear tabla visualmente;
* agregar columnas;
* definir tipos;
* marcar nullable;
* agregar default;
* agregar primary key;
* agregar unique;
* agregar foreign keys;
* agregar índices;
* generar SQL preview;
* ejecutar DDL.

## 14.6 Query Analyzer

Debe mostrar:

* árbol del plan;
* costo;
* filas estimadas;
* filas reales;
* loops;
* planning time;
* execution time;
* buffers si se solicita;
* advertencias de performance.

---

# 15. Roadmap recomendado

## Fase 1 — Gateway mínimo funcional

Objetivo: conectar Angular a PostgreSQL real.

Incluye:

* login básico;
* crear conexión;
* test connection;
* ejecutar query;
* ver resultados;
* historial;
* metadata de schemas/tablas/columnas.

## Fase 2 — Editor avanzado

Incluye:

* Monaco Editor;
* tabs múltiples;
* autocompletado básico;
* query formatter;
* shortcuts;
* export CSV/JSON;
* errores SQL formateados.

## Fase 3 — Table Browser editable

Incluye:

* abrir tabla;
* editar datos;
* detectar PK;
* aplicar cambios en transacción;
* preview SQL;
* bloquear tablas sin PK.

## Fase 4 — DDL visual

Incluye:

* crear tabla;
* modificar tabla;
* crear índices;
* crear constraints;
* generar SQL preview;
* auditoría.

## Fase 5 — Query Analyzer

Incluye:

* `EXPLAIN`;
* `EXPLAIN ANALYZE`;
* plan JSON;
* visualización tipo árbol;
* recomendaciones básicas.

## Fase 6 — Seguridad SaaS

Incluye:

* workspaces;
* roles;
* permisos;
* cifrado de secretos;
* auditoría avanzada;
* read-only mode;
* límites por usuario;
* billing futuro.

---

# 16. Definición del MVP realista

El MVP debería ser:

```txt
Angular + NestJS Gateway + PostgreSQL target
```

Con estas funcionalidades:

1. Crear conexión PostgreSQL.
2. Probar conexión.
3. Explorar schemas, tablas y columnas.
4. Ejecutar SQL.
5. Ver resultados en grilla.
6. Ver errores SQL.
7. Ejecutar `EXPLAIN`.
8. Guardar historial.
9. Abrir tabla y ver datos.
10. Exportar resultados a CSV.

No metería en el MVP inicial:

* edición visual de tablas;
* ERD;
* roles PostgreSQL;
* locks;
* sesiones activas;
* kill query;
* diff de schemas;
* AI assistant.

Eso lo dejaría para fases posteriores.

---

# 17. Nombre técnico del sistema

Yo lo definiría así:

> **PgStudio Gateway**: una plataforma web de administración PostgreSQL que usa Angular como interfaz principal y un gateway NestJS seguro para ejecutar operaciones contra bases de datos remotas.

La promesa comercial podría ser:

> Administra tus bases PostgreSQL desde el navegador, sin instalar clientes pesados de escritorio, con editor SQL, explorador de schemas, edición de datos y análisis de rendimiento.

La promesa técnica interna sería:

> El navegador nunca se conecta directo a PostgreSQL. Toda comunicación pasa por un gateway controlado, auditable y seguro.

---

# 18. Próximo paso recomendado

Definiría el proyecto en 2 repositorios o en un monorepo Nx:

```txt
pgstudio
├── apps
│   ├── web-angular
│   └── gateway-api
├── libs
│   ├── contracts
│   ├── sql-core
│   ├── ui
│   └── shared-types
└── docker
    ├── docker-compose.yml
    └── gateway.Dockerfile
```

Mi recomendación: **monorepo Nx**, porque vas a compartir contratos TypeScript entre Angular y NestJS:

```txt
libs/contracts
├── query.contracts.ts
├── metadata.contracts.ts
├── connection.contracts.ts
├── ddl.contracts.ts
└── explain.contracts.ts
```

Así reduces errores entre frontend y backend, y te queda una base mucho más profesional para escalar el producto.

[1]: https://www.postgresql.org/docs/current/information-schema.html?utm_source=chatgpt.com "Documentation: 18: Chapter 35. The Information Schema"
[2]: https://www.postgresql.org/docs/current/sql-explain.html?utm_source=chatgpt.com "PostgreSQL: Documentation: 18: EXPLAIN"
[3]: https://angular.dev/guide/components?utm_source=chatgpt.com "Anatomy of components"
[4]: https://docs.nestjs.com/controllers?utm_source=chatgpt.com "Controllers | NestJS - A progressive Node.js framework"
[5]: https://node-postgres.com/features/transactions?utm_source=chatgpt.com "Transactions"
[6]: https://www.postgresql.org/docs/current/infoschema-tables.html?utm_source=chatgpt.com "18: 35.54. tables - PostgreSQL: Documentation"