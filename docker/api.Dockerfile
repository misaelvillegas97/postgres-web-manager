FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY libs/contracts/package*.json ./libs/contracts/
RUN npm ci --workspace=apps/api --workspace=libs/contracts

COPY tsconfig.base.json ./
COPY tsconfig.json ./
COPY nx.json ./
COPY apps/api ./apps/api
COPY libs/contracts ./libs/contracts

RUN npx nx build @postgres-web-manager/contracts
RUN npx nx build @org/api

FROM node:20-alpine AS production

WORKDIR /app

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package*.json ./

RUN npm ci --omit=dev

EXPOSE 3000

CMD ["node", "dist/main.js"]
