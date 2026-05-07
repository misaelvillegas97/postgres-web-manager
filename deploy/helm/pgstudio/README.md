# PgStudio Helm chart

This chart runs PgStudio as separate API and web deployments. It can either create
an internal PostgreSQL metadata database or connect to an externally managed one.

## Render locally

```bash
helm template pgstudio deploy/helm/pgstudio \
  --set secrets.jwtSecret="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  --set secrets.jwtRefreshSecret="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  --set secrets.credentialsEncryptionKey="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  --set postgres.auth.password="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
```

## Install with an external metadata database

```bash
helm upgrade --install pgstudio deploy/helm/pgstudio \
  --set postgres.enabled=false \
  --set secrets.databaseUrl="postgresql://user:password@host:5432/pgstudio" \
  --set secrets.jwtSecret="replace-with-32-plus-random-chars" \
  --set secrets.jwtRefreshSecret="replace-with-other-32-plus-random-chars" \
  --set secrets.credentialsEncryptionKey="replace-with-32-plus-random-chars" \
  --set config.corsOrigin="https://pgstudio.example.com" \
  --set ingress.enabled=true \
  --set ingress.host="pgstudio.example.com"
```

Build and push `pgstudio/api` and `pgstudio/web` images before installing in a
cluster that cannot access local Docker images.
