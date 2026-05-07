# PgStudio deployment guide

PgStudio has two runtime pieces:

- `web`: the Angular application served by nginx.
- `api`: the NestJS gateway that owns authentication, metadata storage and TCP PostgreSQL connections.

The browser never connects directly to PostgreSQL. Any target database must be reachable from the machine or platform
running the API.

## Required production configuration

Copy `.env.production.example` and replace every secret:

```bash
cp .env.production.example .env.production
```

Required variables:

| Variable                     | Purpose                                                                                                              |
|------------------------------|----------------------------------------------------------------------------------------------------------------------|
| `DATABASE_URL`               | PostgreSQL URL for PgStudio's own metadata database. This is not necessarily the database you manage through the UI. |
| `JWT_SECRET`                 | Secret for access tokens. Use a random 32+ byte value.                                                               |
| `JWT_REFRESH_SECRET`         | Different random secret for refresh tokens.                                                                          |
| `CREDENTIALS_ENCRYPTION_KEY` | Random 32+ character key used to encrypt saved target DB passwords.                                                  |
| `CORS_ORIGIN`                | Public origin of the web app, for example `https://pgstudio.example.com`.                                            |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Docker Compose, self-contained

This is the recommended self-hosted production default. It runs nginx, API and an internal PostgreSQL metadata database.

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker/docker-compose.yml up -d --build
```

Open `http://localhost:8080` unless `PGSTUDIO_WEB_PORT` was changed.

## Docker Compose, external metadata DB

Use this when PgStudio metadata should live in a managed PostgreSQL database.

```bash
cp .env.production.example .env.production
# Set DATABASE_URL to the managed PostgreSQL URL.
docker compose --env-file .env.production -f docker/docker-compose.external-db.yml up -d --build
```

## Local production installer

The installer builds local production images, creates an installation directory with generated secrets, and starts
Docker Compose.

Linux/macOS/WSL:

```bash
sh scripts/install-local.sh
```

Windows PowerShell:

```powershell
.\scripts\install-local.ps1
```

Useful overrides:

```bash
PGSTUDIO_WEB_PORT=9090 sh scripts/install-local.sh
DATABASE_URL="postgresql://user:pass@host:5432/pgstudio" sh scripts/install-local.sh
```

PowerShell equivalents:

```powershell
.\scripts\install-local.ps1 -WebPort 9090
.\scripts\install-local.ps1 -ExternalDatabaseUrl "postgresql://user:pass@host:5432/pgstudio"
```

The default install directory is `~/.pgstudio`.

## Railway

Use `deploy/railway/railway.json` with the all-in-one image. Add a Railway PostgreSQL service and set:

```text
NODE_ENV=production
API_PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<random>
JWT_REFRESH_SECRET=<random>
CREDENTIALS_ENCRYPTION_KEY=<random>
CORS_ORIGIN=https://<your-railway-domain>
```

The service exposes a single public HTTP port and proxies `/api` and `/socket.io` internally to the API process.

## Fly.io

Copy `deploy/fly/fly.toml.example` to `fly.toml`, set the app name and secrets, then deploy:

```bash
fly postgres create
fly postgres attach <postgres-app-name>
fly secrets set JWT_SECRET=<random> JWT_REFRESH_SECRET=<random> CREDENTIALS_ENCRYPTION_KEY=<random>
fly deploy -c deploy/fly/fly.toml
```

## Vercel

Vercel should only host the frontend. The API must run on a persistent backend such as Fly.io, Railway, Render, a VPS,
Kubernetes or Docker Compose.

Copy `deploy/vercel/vercel.json.example` to `vercel.json` and replace `YOUR_API_HOST.example.com` with the API host.

## Kubernetes / Helm

The chart in `deploy/helm/pgstudio` deploys API, web and optionally PostgreSQL.

Render with an internal metadata DB:

```bash
helm template pgstudio deploy/helm/pgstudio \
  --set secrets.jwtSecret="<random>" \
  --set secrets.jwtRefreshSecret="<random>" \
  --set secrets.credentialsEncryptionKey="<random>" \
  --set postgres.auth.password="<random>"
```

Install with an external metadata DB:

```bash
helm upgrade --install pgstudio deploy/helm/pgstudio \
  --set postgres.enabled=false \
  --set secrets.databaseUrl="postgresql://user:password@host:5432/pgstudio" \
  --set secrets.jwtSecret="<random>" \
  --set secrets.jwtRefreshSecret="<random>" \
  --set secrets.credentialsEncryptionKey="<random>" \
  --set config.corsOrigin="https://pgstudio.example.com" \
  --set ingress.enabled=true \
  --set ingress.host="pgstudio.example.com"
```

## Connecting to local/private target databases

PgStudio can connect only to databases reachable from the API runtime:

| API location             | Can connect to a DB on your laptop?                                                                                                                                         |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Same laptop / same LAN   | Yes, if host, port and firewall allow it.                                                                                                                                   |
| Docker on same host      | Yes, through host networking, Docker network DNS, or host gateway configuration.                                                                                            |
| Railway/Vercel/Fly/cloud | Not directly to `localhost` on your laptop. Use a public DB endpoint, VPN, WireGuard/Tailscale, SSH tunnel, bastion, private networking, or run PgStudio near the database. |
| Kubernetes               | Yes for cluster/internal services and networks reachable from the API pod.                                                                                                  |

For production use, avoid exposing PostgreSQL publicly unless TLS, strong credentials, firewall allowlists and
least-privilege roles are configured.
