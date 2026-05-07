# Fly.io deployment

Fly works well for PgStudio because the API needs a persistent Node process,
Socket.IO, and outbound TCP connections to PostgreSQL targets.

## Basic flow

```bash
cp deploy/fly/fly.toml.example fly.toml
fly launch --no-deploy
fly postgres create
fly postgres attach <postgres-app-name>
fly secrets set JWT_SECRET=<64+ random chars>
fly secrets set JWT_REFRESH_SECRET=<different 64+ random chars>
fly secrets set CREDENTIALS_ENCRYPTION_KEY=<64+ random chars>
fly deploy
```

If you do not use `fly postgres attach`, set `DATABASE_URL` manually:

```bash
fly secrets set DATABASE_URL=postgresql://...
```

Update `CORS_ORIGIN` in `fly.toml` to your actual Fly hostname or custom domain.

## Private databases

For customer databases that are not public, place PgStudio in a network that can
reach them. On Fly this normally means a VPN/tunnel or another private networking
setup outside this app.
