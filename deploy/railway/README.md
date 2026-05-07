# Railway deployment

Recommended shape: one PgStudio web/API service built from `docker/all-in-one.Dockerfile`
plus one Railway PostgreSQL service for PgStudio's internal metadata database.

## Services

1. Create a Railway PostgreSQL database.
2. Create a service from this repository.
3. In the service settings, use `deploy/railway/railway.json` as Config as Code.
4. Set these variables on the PgStudio service:

```bash
NODE_ENV=production
API_PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<64+ random chars>
JWT_REFRESH_SECRET=<different 64+ random chars>
CREDENTIALS_ENCRYPTION_KEY=<64+ random chars>
CORS_ORIGIN=https://<your railway domain>
```

Railway supplies `PORT`; the all-in-one image binds nginx to that port and runs the
Nest API privately inside the same container.

## Database reachability

PostgreSQL targets managed through PgStudio must be reachable from the Railway
container. For private databases, use private networking, VPN, tunnel, or run
PgStudio in the same private network as the database.
