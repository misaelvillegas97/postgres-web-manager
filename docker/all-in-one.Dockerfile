FROM node:20-alpine AS build

WORKDIR /workspace

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/api-e2e/package*.json ./apps/api-e2e/
COPY libs/contracts/package*.json ./libs/contracts/
RUN npm install --no-audit --no-fund

COPY tsconfig.base.json ./
COPY tsconfig.json ./
COPY nx.json ./
COPY apps/api ./apps/api
COPY apps/web ./apps/web
COPY libs/contracts ./libs/contracts

RUN npx nx sync
RUN npx nx build @postgres-web-manager/contracts
RUN npx nx build @org/api
RUN npx nx build web --configuration=production

FROM node:20-alpine AS production

RUN apk add --no-cache nginx gettext

WORKDIR /app

COPY --from=build /workspace/apps/api/dist ./api/dist
COPY --from=build /workspace/apps/api/package*.json ./api/
COPY --from=build /workspace/dist/apps/web/browser /usr/share/nginx/html
COPY docker/nginx.all-in-one.conf.template /etc/nginx/templates/default.conf.template
COPY docker/all-in-one-entrypoint.sh /usr/local/bin/pgstudio-entrypoint

RUN chmod +x /usr/local/bin/pgstudio-entrypoint \
  && mkdir -p /run/nginx \
  && cd /app/api \
  && npm install --omit=dev --no-audit --no-fund

ENV NODE_ENV=production
ENV API_PORT=3000
ENV PORT=8080
ENV API_PROXY_URL=http://127.0.0.1:3000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/api/health" >/dev/null || exit 1

CMD ["pgstudio-entrypoint"]
