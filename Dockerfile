FROM node:20.12.2-alpine AS base

WORKDIR /app

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    libc-dev \
    linux-headers

# Стадия для разработки
FROM base AS dev
ENV NODE_ENV=development
COPY . .
RUN npm install --package-lock-only
CMD ["npm", "run", "dev"]

# Стадия для production
FROM base AS production
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --package-lock-only
COPY . .
RUN npm run build

# Финальный образ
FROM node:20.12.2-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production /app/node_modules ./node_modules
COPY --from=production /app/dist ./dist
COPY --from=production /app/package.json ./

RUN chown -R node:node /app
USER node

CMD ["node", "dist/main.js"]