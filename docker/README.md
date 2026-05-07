# Docker production

## Self-contained stack

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker/docker-compose.yml up -d --build
```

This starts:

- `postgres`: PgStudio metadata database, not exposed to the host.
- `api`: NestJS API, only exposed to the internal Docker network.
- `web`: nginx frontend exposed on `PGSTUDIO_WEB_PORT` or `8080`.

## External metadata database

```bash
cp .env.production.example .env.production
# Set DATABASE_URL to your managed PostgreSQL URL.
docker compose --env-file .env.production -f docker/docker-compose.external-db.yml up -d --build
```

## Images

Standalone images:

```bash
docker build -f docker/api.Dockerfile -t pgstudio/api:local .
docker build -f docker/web.Dockerfile -t pgstudio/web:local .
```

Single-container PaaS image:

```bash
docker build -f docker/all-in-one.Dockerfile -t pgstudio/all-in-one:local .
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:password@host:5432/pgstudio" \
  -e JWT_SECRET="replace-with-32-plus-random-chars" \
  -e JWT_REFRESH_SECRET="replace-with-other-32-plus-random-chars" \
  -e CREDENTIALS_ENCRYPTION_KEY="replace-with-32-plus-random-chars" \
  -e CORS_ORIGIN="http://localhost:8080" \
  pgstudio/all-in-one:local
```
