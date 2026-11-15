# ── Build ────────────────────────────────────────────────────
# Vite/React produit un site statique (pas de runtime Node en prod,
# contrairement à un adapter-node type SvelteKit) : on le sert donc
# directement avec un nginx léger, propre à ce conteneur.
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────
# Version épinglée (mineure) : un `nginx:alpine` flottant changeait de version
# à chaque build sans trace dans Git. Dependabot (écosystème docker) propose
# les montées de version.
FROM nginx:1.31-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
