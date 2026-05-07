FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/api-e2e/package*.json ./apps/api-e2e/
COPY libs/contracts/package*.json ./libs/contracts/
RUN npm install --no-audit --no-fund

COPY tsconfig.base.json ./
COPY tsconfig.json ./
COPY nx.json ./
COPY apps/api ./apps/api
COPY libs/contracts ./libs/contracts

RUN npx nx sync
RUN npx nx build @postgres-web-manager/contracts
RUN npx nx build @org/api

FROM node:20-alpine AS production

WORKDIR /app

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package*.json ./

RUN npm install --omit=dev --no-audit --no-fund

ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/api/health" >/dev/null || exit 1

CMD ["node", "dist/main.js"]
