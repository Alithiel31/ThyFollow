# ── Build ────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/

RUN npm install
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache dumb-init openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --omit=dev
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

COPY --from=builder /app/dist ./dist/

RUN chown -R node:node /app

USER node

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
