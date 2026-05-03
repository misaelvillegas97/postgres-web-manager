FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json ./apps/web/ 2>/dev/null || true
COPY libs/contracts/package*.json ./libs/contracts/
RUN npm ci

COPY tsconfig.base.json ./
COPY tsconfig.json ./
COPY nx.json ./
COPY apps/web ./apps/web
COPY libs/contracts ./libs/contracts

RUN npx nx build @postgres-web-manager/contracts
RUN npx nx build web --configuration=production

FROM nginx:alpine AS production

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
