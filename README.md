# PgStudio — PostgreSQL Web Manager

A web-based PostgreSQL administration tool similar to DBeaver, built with Angular and a NestJS gateway backend.

## Architecture

```
Angular App (apps/web)
   ↓ HTTPS / WebSocket
PgStudio Gateway Backend (apps/api)
   ↓ TCP PostgreSQL protocol
PostgreSQL Server
```

The browser never connects directly to PostgreSQL. All communication passes through the NestJS gateway, which handles authentication, authorization, auditing, and actual PostgreSQL connections.

## Monorepo Structure

```
pgstudio
├── apps
│   ├── web          # Angular 19 frontend (standalone components, signals, SCSS)
│   ├── web-e2e      # Playwright e2e tests for the web app
│   ├── api          # NestJS 11 gateway backend
│   └── api-e2e      # e2e tests for the API
├── libs
│   └── contracts    # Shared TypeScript DTOs, enums, and interfaces
└── docker
    ├── docker-compose.yml
    ├── api.Dockerfile
    ├── web.Dockerfile
    └── nginx.conf
```

## Tech Stack

### Frontend (`apps/web`)
- **Angular 19** with standalone components and signals
- **Tailwind CSS** + **Angular Material** (planned)
- **Monaco Editor** for SQL editing (planned)
- **TanStack Table** for data grids (planned)
- TypeScript strict mode

### Backend (`apps/api`)
- **NestJS 11** gateway
- **node-postgres (`pg`)** for PostgreSQL connections
- **WebSocket** via `@nestjs/websockets` + Socket.IO
- Modular architecture: auth, connections, query, metadata, table-data, ddl, explain, sessions

### Shared (`libs/contracts`)
- TypeScript contracts shared between frontend and backend:
  - `auth.contracts.ts` — Login, tokens, user roles
  - `connection.contracts.ts` — Connection profiles, DTOs
  - `query.contracts.ts` — SQL execution, risk levels
  - `metadata.contracts.ts` — Schemas, tables, columns, indexes
  - `ddl.contracts.ts` — Table creation/alteration
  - `explain.contracts.ts` — Query analysis plans
  - `session.contracts.ts` — WebSocket session types
  - `table-data.contracts.ts` — Table CRUD operations

## Getting Started

### Prerequisites
- Node.js 20+
- npm 10+
- Docker & Docker Compose (for local PostgreSQL)

### Install Dependencies

```bash
npm install
```

### Development

Start the API:
```bash
npx nx serve api
```

Start the Angular app:
```bash
npx nx serve web
```

### Build

```bash
# Build everything
npx nx run-many -t build

# Build individual projects
npx nx build contracts
npx nx build @org/api
npx nx build web
```

### Docker

```bash
# Start local development stack (API + Web + PostgreSQL)
cd docker
docker-compose up
```

## API Endpoints

### Auth
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET  /api/auth/me`

### Connections
- `GET    /api/connections`
- `POST   /api/connections`
- `GET    /api/connections/:id`
- `PATCH  /api/connections/:id`
- `DELETE /api/connections/:id`
- `POST   /api/connections/test`

### Queries
- `POST /api/queries/execute`
- `POST /api/queries/explain`
- `POST /api/queries/cancel`
- `GET  /api/queries/history`

### Metadata
- `GET /api/metadata/:connectionId/schemas`
- `GET /api/metadata/:connectionId/schemas/:schema/tables`
- `GET /api/metadata/:connectionId/schemas/:schema/tables/:table`
- `GET /api/metadata/:connectionId/schemas/:schema/functions`
- `GET /api/metadata/:connectionId/extensions`

### Table Data
- `POST /api/table-data/read`
- `POST /api/table-data/preview-changes`
- `POST /api/table-data/apply-changes`

### DDL
- `POST /api/ddl/create-table/preview`
- `POST /api/ddl/create-table/execute`
- `POST /api/ddl/alter-table/preview`
- `POST /api/ddl/alter-table/execute`

## WebSocket

Endpoint: `WS /` (Socket.IO)

Events:
- `session.open` — Open a new database session
- `session.close` — Close session
- `query.start` — Query started
- `query.rows` — Partial row results
- `query.done` — Query completed
- `query.error` — Query error
- `query.cancelled` — Query cancelled

## Roadmap

- **Phase 1**: Gateway MVP (login, connections, execute queries, metadata)
- **Phase 2**: Monaco Editor, tabs, autocompletion, CSV export
- **Phase 3**: Editable table browser
- **Phase 4**: Visual DDL designer
- **Phase 5**: Query Analyzer (EXPLAIN / EXPLAIN ANALYZE)
- **Phase 6**: SaaS security (workspaces, roles, audit)
