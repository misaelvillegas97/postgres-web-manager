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

The browser never connects directly to PostgreSQL. All communication passes through the NestJS gateway, which handles authentication, authorization, auditing, and PostgreSQL connections.

## Monorepo Structure

```
pgstudio
├── apps
│   ├── web          # Angular 21 frontend (standalone components, signals, SCSS)
│   ├── web-e2e      # Playwright e2e tests for the web app
│   ├── api          # NestJS 11 gateway backend
│   └── api-e2e      # e2e tests for the API
├── libs
│   └── contracts    # Shared TypeScript DTOs, enums, and interfaces
└── docker
    ├── docker-compose.yml          # Production stack
    ├── docker-compose.external-db.yml # Production stack with managed metadata DB
    ├── docker-compose.dev.yml      # Development stack (hot-reload)
    ├── api.Dockerfile              # Multi-stage production image
    ├── all-in-one.Dockerfile       # Single-container PaaS image
    ├── api.dev.Dockerfile          # Development image with live reload
    ├── web.Dockerfile              # Nginx + Angular production build
    └── nginx.conf                  # Nginx configuration (API proxy + SPA routing)
deploy
├── railway                         # Railway all-in-one template
├── fly                             # Fly.io all-in-one template
├── vercel                          # Frontend-only Vercel template
└── helm/pgstudio                   # Kubernetes Helm chart
docs
└── DEPLOYMENT.md                   # Production deployment guide
```

## Tech Stack

### Frontend (`apps/web`)
- **Angular 21** with standalone components and signals
- **Monaco Editor** for SQL editing
- **TailwindCSS** for styling
- TypeScript strict mode

### Backend (`apps/api`)
- **NestJS 11** gateway
- **TypeORM** for the internal PgStudio metadata database
- **node-postgres (`pg`)** for user-managed external PostgreSQL connections
- **WebSocket** via `@nestjs/websockets` + Socket.IO
- **JWT authentication** (access 1h + refresh 7d)
- **Role-based access control** (OWNER > ADMIN > DEVELOPER > READ_ONLY)
- **Rate limiting** via `@nestjs/throttler` (300 req/min per IP)
- **Audit logging** for all write/DDL operations
- Modular architecture: auth, connections, query, metadata, table-data, ddl, explain, sessions, audit

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
- Docker & Docker Compose

### Install Dependencies

```bash
npm install
```

### Development

#### Option A — Local Node (no Docker)

Copy and configure environment variables:
```bash
cp .env.example apps/api/.env
# Edit DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, CREDENTIALS_ENCRYPTION_KEY
```

Start PostgreSQL (Docker):
```bash
docker run -d --name pgstudio-db \
  -e POSTGRES_USER=pgstudio \
  -e POSTGRES_PASSWORD=pgstudio \
  -e POSTGRES_DB=pgstudio \
  -p 5432:5432 \
  postgres:16-alpine
```

Start the API (hot-reload):
```bash
npm exec nx serve @org/api
```

Start the Angular dev server:
```bash
npm exec nx serve web
```

Open: http://localhost:4200

#### Option B — Full Docker dev stack

```bash
docker-compose -f docker/docker-compose.dev.yml up
```

### Build

```bash
# Validate contracts
npm exec nx build @postgres-web-manager/contracts

# Build API
npm exec nx build @org/api

# Build web
npm exec nx build web

# Build all
npm exec nx run-many -t build
```

### Docker (production)

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker/docker-compose.yml up -d --build
```

Serves:
| Service | URL |
|---------|-----|
| Web app | http://localhost:8080 |
| API | Internal Docker network (`http://api:3000/api`) |
| PostgreSQL metadata DB | Internal Docker network (`postgres:5432`) |

More production options are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), including Docker Compose with an
external metadata DB, Railway, Fly.io, Vercel frontend-only, Kubernetes/Helm and local production installers.

---

## Environment Variables

### Backend (`apps/api/.env`)

| Variable                     | Required   | Default                                     | Description                                                                                                                                                              |
|------------------------------|------------|---------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `DATABASE_URL`               | Production | —                                           | PostgreSQL connection string for the internal PgStudio metadata DB                                                                                                       |
| `JWT_SECRET`                 | Production | `dev-jwt-secret-not-for-production`         | Secret used to sign access tokens. **Must be changed in production.**                                                                                                    |
| `JWT_REFRESH_SECRET`         | Production | `dev-jwt-refresh-secret-not-for-production` | Secret used to sign refresh tokens. **Must be changed in production.**                                                                                                   |
| `CREDENTIALS_ENCRYPTION_KEY` | Production | —                                           | 32+ character key used to encrypt saved PostgreSQL passwords with AES-256-GCM. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `MAIL_FROM`                  | Production | —                                           | Sender email used by Resend for email confirmation and password reset OTP messages.                                                                                      |
| `RESEND_API_KEY`             | Production | —                                           | Resend API key used to deliver OTP emails.                                                                                                                               |
| `PORT`                       | No         | `3000`                                      | HTTP port the API listens on                                                                                                                                             |
| `NODE_ENV`                   | No         | `development`                               | `development` or `production`                                                                                                                                            |

> **Security note**: `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `CREDENTIALS_ENCRYPTION_KEY` should be unique, randomly
> generated secrets. Never use the development defaults in production.

---

## Security Model

### Authentication
- JWT-based: access tokens (1 hour) + refresh tokens (7 days)
- All endpoints require a valid JWT by default
- Routes marked `@Public()` are exempt (login, refresh, health)

### Authorization (Roles)
| Role | Capabilities |
|------|-------------|
| `OWNER` | Full access, can delete connections |
| `ADMIN` | Full access, audit logs, can delete connections |
| `DEVELOPER` | Execute queries (including DDL), browse tables, explain |
| `READ_ONLY` | SELECT queries only; DDL, DML and destructive operations are blocked |

### Connection Access Modes
Each connection profile has an `access_mode` field:
- `read-write` — all SQL allowed (subject to role check above)
- `read-only` — only SAFE queries (SELECT, EXPLAIN without ANALYZE, SHOW) allowed

### Rate Limiting
- 300 requests per minute per IP (global throttle)

### Audit Logging
Write, DDL, Destructive and Admin SQL operations are logged to `audit_logs` with:
- Workspace + user + connection context
- Action + risk level + SQL preview (truncated at 500 chars)
- Accessible via `GET /api/audit` (ADMIN/OWNER only)

---

## API Endpoints

### System
- `GET /api/health` — Health check (public)

### Auth
- `POST /api/auth/login` — Login with email/password
- `POST /api/auth/refresh` — Refresh access token
- `POST /api/auth/logout` — Invalidate refresh token
- `GET  /api/auth/me` — Current user profile

### Connections
- `GET    /api/connections` — List workspace connections
- `POST   /api/connections` — Create connection
- `GET    /api/connections/:id` — Get connection
- `PATCH  /api/connections/:id` — Update connection
- `DELETE /api/connections/:id` — Delete connection _(ADMIN/OWNER only)_
- `POST   /api/connections/test` — Test connection credentials
- `POST   /api/connections/:id/unlock` — Unlock connection pool
- `DELETE /api/connections/:id/unlock` — Lock (close) connection pool

### Queries
- `POST /api/queries/execute` — Execute SQL
- `POST /api/queries/explain` — EXPLAIN / EXPLAIN ANALYZE
- `POST /api/queries/cancel` — Cancel running query
- `GET  /api/queries/history` — Query history

### Metadata
- `GET /api/metadata/:connectionId/schemas`
- `GET /api/metadata/:connectionId/schemas/:schema/tables`
- `GET /api/metadata/:connectionId/schemas/:schema/tables/:table`
- `GET /api/metadata/:connectionId/schemas/:schema/functions`
- `GET /api/metadata/:connectionId/extensions`

### Table Data
- `POST /api/table-data/read`
- `POST /api/table-data/preview-changes`
- `POST /api/table-data/apply-changes` _(blocked in read-only mode)_

### DDL
- `POST /api/ddl/create-table/preview`
- `POST /api/ddl/create-table/execute` _(blocked in read-only mode)_
- `POST /api/ddl/alter-table/preview`
- `POST /api/ddl/alter-table/execute` _(blocked in read-only mode)_

### Audit
- `GET /api/audit` — Paginated audit log _(ADMIN/OWNER only)_

## WebSocket

Endpoint: `WS /` (Socket.IO)

Authentication: pass JWT in `auth.token` during handshake:
```js
const socket = io('http://localhost:3000', { auth: { token: '<access_token>' } });
```

Events:
- `session.open` — Open a new database session
- `session.close` — Close session
- `query.start` — Query started
- `query.rows` — Partial row results
- `query.done` — Query completed
- `query.error` — Query error
- `query.cancelled` — Query cancelled

## Validation Commands

```bash
# Build everything
npm exec nx run-many -t build

# Lint all
npm exec nx run-many -t lint

# Unit tests
npm exec nx run-many -t test

# API e2e
npm exec nx e2e @org/api-e2e

# Web e2e
npm exec nx e2e web-e2e
```

## Deployment

For the complete deployment matrix, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Prerequisites
- Domain with HTTPS (TLS termination via reverse proxy or load balancer)
- PostgreSQL 14+ instance for PgStudio metadata storage
- 32+ character `CREDENTIALS_ENCRYPTION_KEY` (generate once, store securely)
- Strong random `JWT_SECRET` and `JWT_REFRESH_SECRET`

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Replace default `JWT_SECRET` with a random 64+ char value
- [ ] Replace default `JWT_REFRESH_SECRET` with a different random 64+ char value
- [ ] Generate `CREDENTIALS_ENCRYPTION_KEY` with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Set `DATABASE_URL` to a dedicated PostgreSQL database
- [ ] Configure TLS on the reverse proxy (SSL termination)
- [ ] Set `CORS_ORIGIN` to the allowed frontend origin(s)
- [ ] Review rate-limit settings (`ThrottlerModule`)
- [ ] Rotate secrets periodically



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
- **TypeORM** for the internal PgStudio metadata database
- **node-postgres (`pg`)** for user-managed external PostgreSQL connections
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
npm exec nx serve @org/api
```

Start the Angular app:
```bash
npm exec nx serve web
```

### Build

```bash
# Build everything
npm exec nx run-many -t build

# Build individual projects
npm exec nx build @postgres-web-manager/contracts
npm exec nx build @org/api
npm exec nx build web
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
