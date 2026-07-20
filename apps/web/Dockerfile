# Osieri web (Next.js 14, standalone) — production image.
# Build context = REPO ROOT:  docker build -f apps/web/Dockerfile -t osieri-web .
# Next standalone output (custom distDir `.next-prod`, monorepo-traced).
# Serves on $PORT (Cloud Run sets it; Next standalone honors PORT, default 3000).

# ---- build: install full workspace (dev deps needed), next build ----
FROM node:20-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
# NODE_ENV=production so next.config selects the `.next-prod` distDir + standalone.
RUN cd apps/web && NODE_ENV=production NODE_OPTIONS=--max-old-space-size=4096 npm run build

# ---- runner: standalone server only ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Standalone bundle (traced node_modules + apps/web/server.js).
COPY --from=build /app/apps/web/.next-prod/standalone ./
# Static + public (served by the standalone server from <distDir>/static).
COPY --from=build /app/apps/web/.next-prod/static ./apps/web/.next-prod/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
