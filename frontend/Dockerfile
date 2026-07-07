# ── Build ────────────────────────────────────────────────────
# Vite/React produit un site statique (pas de runtime Node en prod,
# contrairement à un adapter-node type SvelteKit) : on le sert donc
# directement avec un nginx léger, propre à ce conteneur.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
