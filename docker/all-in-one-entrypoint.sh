#!/bin/sh
set -eu

API_PORT="${API_PORT:-3000}"
PUBLIC_PORT="${PORT:-8080}"
API_PROXY_URL="${API_PROXY_URL:-http://127.0.0.1:${API_PORT}}"

export API_PROXY_URL
export PUBLIC_PORT

cleanup() {
  if [ -n "${API_PID:-}" ]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM

mkdir -p /etc/nginx/http.d /run/nginx

PORT="$API_PORT" node /app/api/dist/main.js &
API_PID="$!"

envsubst '$API_PROXY_URL $PUBLIC_PORT' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/http.d/default.conf

nginx -g 'daemon off;' &
NGINX_PID="$!"

wait "$NGINX_PID"
