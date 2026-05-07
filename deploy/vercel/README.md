# Vercel deployment

Use Vercel only for the Angular frontend. Do not deploy the Nest API to Vercel:
PgStudio needs a persistent backend process, Socket.IO support, and outbound TCP
connections to PostgreSQL targets.

## Setup

1. Deploy the API elsewhere first, for example Railway, Fly.io, or Docker Compose.
2. Copy `deploy/vercel/vercel.json.example` to `vercel.json`.
3. Replace `https://YOUR_API_HOST.example.com` with the real API origin.
4. Import the repository in Vercel.

The frontend calls same-origin `/api/*` and `/socket.io/*`; Vercel rewrites those
paths to the external API host.
