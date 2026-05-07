FROM node:20-alpine AS dev

WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY libs/contracts/package*.json ./libs/contracts/
RUN npm install

COPY tsconfig.base.json ./
COPY tsconfig.json ./
COPY nx.json ./
COPY apps/api ./apps/api
COPY libs/contracts ./libs/contracts

ENV PORT=46000
EXPOSE 46000

CMD ["npx", "nx", "serve", "@org/api", "--configuration=development"]
