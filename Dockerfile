# syntax=docker/dockerfile:1.7

# Multi-stage build for the SvelteKit admin panel.
# Stage 1: install and build. Stage 2: minimal runtime with adapter-node output.

ARG NODE_VERSION=22.11.0

FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && \
    npm prune --production --no-audit --no-fund

FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Copy only what the SvelteKit node adapter needs at runtime.
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Drop privileges — the official node image ships a `node` user (uid 1000).
USER node

EXPOSE 3000

# Liveness probe hits the SvelteKit server root; hooks.server.ts short-circuits
# unauthenticated requests to /auth/login with a 303, which is a healthy 3xx.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --spider --quiet http://127.0.0.1:3000/ || exit 1

CMD ["node", "build"]
