# ── Base commune ─────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY . .

# ── Développement ────────────────────────────────────────────
FROM base AS development
RUN npm install
CMD ["npm", "run", "dev", "--", "--host"]

# ── Production ───────────────────────────────────────────────
FROM base AS production
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm install
RUN npm run build
RUN npm install -g serve
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]