#!/usr/bin/env sh
set -eu

INSTALL_DIR="${INSTALL_DIR:-$HOME/.pgstudio}"
WEB_PORT="${PGSTUDIO_WEB_PORT:-8080}"
API_IMAGE="${PGSTUDIO_API_IMAGE:-pgstudio/api:local}"
WEB_IMAGE="${PGSTUDIO_WEB_IMAGE:-pgstudio/web:local}"
EXTERNAL_DATABASE_URL="${DATABASE_URL:-}"

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

random_hex() {
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd docker
require_cmd node

mkdir -p "$INSTALL_DIR"

if [ "${PGSTUDIO_SKIP_BUILD:-0}" != "1" ]; then
  docker build -f "$repo_root/docker/api.Dockerfile" -t "$API_IMAGE" "$repo_root"
  docker build -f "$repo_root/docker/web.Dockerfile" -t "$WEB_IMAGE" "$repo_root"
fi

jwt_secret="${JWT_SECRET:-$(random_hex)}"
jwt_refresh_secret="${JWT_REFRESH_SECRET:-$(random_hex)}"
encryption_key="${CREDENTIALS_ENCRYPTION_KEY:-$(random_hex)}"
cors_origin="${CORS_ORIGIN:-http://localhost:$WEB_PORT}"

if [ -n "$EXTERNAL_DATABASE_URL" ]; then
  cat > "$INSTALL_DIR/.env.production" <<EOF
PGSTUDIO_WEB_PORT=$WEB_PORT
DATABASE_URL=$EXTERNAL_DATABASE_URL
JWT_SECRET=$jwt_secret
JWT_REFRESH_SECRET=$jwt_refresh_secret
CREDENTIALS_ENCRYPTION_KEY=$encryption_key
CORS_ORIGIN=$cors_origin
EOF

  cat > "$INSTALL_DIR/docker-compose.yml" <<EOF
services:
  api:
    image: $API_IMAGE
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: \${DATABASE_URL:?DATABASE_URL is required}
      JWT_SECRET: \${JWT_SECRET:?JWT_SECRET is required}
      JWT_REFRESH_SECRET: \${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET is required}
      CREDENTIALS_ENCRYPTION_KEY: \${CREDENTIALS_ENCRYPTION_KEY:?CREDENTIALS_ENCRYPTION_KEY is required}
      CORS_ORIGIN: \${CORS_ORIGIN:?CORS_ORIGIN is required}
    expose:
      - "3000"
    restart: unless-stopped

  web:
    image: $WEB_IMAGE
    environment:
      API_PROXY_URL: http://api:3000
    ports:
      - "\${PGSTUDIO_WEB_PORT:-8080}:80"
    depends_on:
      - api
    restart: unless-stopped
EOF
else
  db_password="${PGSTUDIO_DB_PASSWORD:-$(random_hex)}"
  cat > "$INSTALL_DIR/.env.production" <<EOF
PGSTUDIO_WEB_PORT=$WEB_PORT
PGSTUDIO_DB_USER=pgstudio
PGSTUDIO_DB_PASSWORD=$db_password
PGSTUDIO_DB_NAME=pgstudio
DATABASE_URL=postgresql://pgstudio:$db_password@postgres:5432/pgstudio
JWT_SECRET=$jwt_secret
JWT_REFRESH_SECRET=$jwt_refresh_secret
CREDENTIALS_ENCRYPTION_KEY=$encryption_key
CORS_ORIGIN=$cors_origin
EOF

  cat > "$INSTALL_DIR/docker-compose.yml" <<EOF
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: \${PGSTUDIO_DB_USER:?PGSTUDIO_DB_USER is required}
      POSTGRES_PASSWORD: \${PGSTUDIO_DB_PASSWORD:?PGSTUDIO_DB_PASSWORD is required}
      POSTGRES_DB: \${PGSTUDIO_DB_NAME:?PGSTUDIO_DB_NAME is required}
    volumes:
      - pgstudio-data:/var/lib/postgresql/data
    restart: unless-stopped

  api:
    image: $API_IMAGE
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: \${DATABASE_URL:?DATABASE_URL is required}
      JWT_SECRET: \${JWT_SECRET:?JWT_SECRET is required}
      JWT_REFRESH_SECRET: \${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET is required}
      CREDENTIALS_ENCRYPTION_KEY: \${CREDENTIALS_ENCRYPTION_KEY:?CREDENTIALS_ENCRYPTION_KEY is required}
      CORS_ORIGIN: \${CORS_ORIGIN:?CORS_ORIGIN is required}
    expose:
      - "3000"
    depends_on:
      - postgres
    restart: unless-stopped

  web:
    image: $WEB_IMAGE
    environment:
      API_PROXY_URL: http://api:3000
    ports:
      - "\${PGSTUDIO_WEB_PORT:-8080}:80"
    depends_on:
      - api
    restart: unless-stopped

volumes:
  pgstudio-data:
EOF
fi

docker compose --env-file "$INSTALL_DIR/.env.production" -f "$INSTALL_DIR/docker-compose.yml" up -d

echo "PgStudio is running at http://localhost:$WEB_PORT"
echo "Install directory: $INSTALL_DIR"
