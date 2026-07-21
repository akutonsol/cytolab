# Osieri API (NestJS) — production image.
# Build context = REPO ROOT:  docker build -f apps/api/Dockerfile -t osieri-api .
# The API listens on $PORT (Cloud Run sets it) and binds all interfaces.

# ---- build: full workspace (dev deps needed), prisma generate, nest build ----
FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci
RUN cd apps/api && npx prisma generate && NODE_OPTIONS=--max-old-space-size=4096 npm run build

# ---- prod-deps: production-only node_modules (drops devDeps: tsc/jest/eslint/…) ----
# Slims the runtime image substantially. Prisma's client is regenerated here so the
# generated engine lands in the PRODUCTION node_modules tree.
FROM node:20-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci --omit=dev
RUN cd apps/api && npx prisma generate

# ---- runner: slim, non-root runtime ----
FROM node:20-slim AS runner
WORKDIR /app/apps/api
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Production deps only (includes the generated Prisma client), + built output.
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/packages /app/packages
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/package.json ./package.json
# Drop root: the `node` base image ships an unprivileged `node` user (uid 1000).
USER node
EXPOSE 8080
# Cloud Run injects PORT; the app reads process.env.PORT (defaults 4000 locally).
CMD ["node", "dist/main.js"]
