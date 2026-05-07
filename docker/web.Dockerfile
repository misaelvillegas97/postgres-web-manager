FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY libs/contracts/package*.json ./libs/contracts/
RUN npm install --no-audit --no-fund

COPY tsconfig.base.json ./
COPY tsconfig.json ./
COPY nx.json ./
COPY apps/web ./apps/web
COPY libs/contracts ./libs/contracts

RUN npx nx sync
RUN npx nx build web --configuration=production

FROM nginx:1.27-alpine AS production

COPY --from=build /app/dist/apps/web/browser /usr/share/nginx/html
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

ENV API_PROXY_URL=http://api:3000

EXPOSE 80

CMD ["sh", "-c", "envsubst '$API_PROXY_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
