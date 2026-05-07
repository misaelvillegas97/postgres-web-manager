FROM node:20-alpine AS dev

WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY libs/contracts/package*.json ./libs/contracts/
RUN npm install

COPY tsconfig.base.json ./
COPY tsconfig.json ./
COPY nx.json ./
COPY apps/web ./apps/web
COPY libs/contracts ./libs/contracts

RUN npx nx sync
RUN npx nx build @postgres-web-manager/contracts

EXPOSE 46002

CMD ["npx", "nx", "serve", "web", "--port=46002", "--host=0.0.0.0", "--configuration=development"]
