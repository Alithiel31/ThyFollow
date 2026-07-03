# ── Base commune ─────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY . .

# ── Développement ────────────────────────────────────────────
FROM base AS development
WORKDIR /app/backend
RUN npm install
CMD ["npm", "run", "dev"]

# ── Production ───────────────────────────────────────────────
FROM base AS production

# Build du frontend
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Build du backend
WORKDIR /app/backend
RUN npm install
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
RUN npm run build

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]