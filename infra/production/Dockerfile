# syntax=docker/dockerfile:1
# Production images for the VPS (D-037, Phase 18), built from the repository root:
#   docker build -f infra/production/Dockerfile --target <api|migrate|web|proxy> .
# The compose file builds all of them (infra/production/docker-compose.prod.yml). No secret is baked into an image:
# the API, worker and website read theirs from the server environment at run time. The CMS's VITE_* values are public
# by design (see apps/admin/.env.example) and are passed as build arguments.

ARG NODE_IMAGE=node:24.21.0-bookworm-slim

# ── Build everything the server needs (not the student app) ─────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
ENV CI=true NEXT_TELEMETRY_DISABLED=1
# pnpm (the version in package.json's packageManager) is installed once here and cached. npm, not corepack: corepack's
# download fails now and then inside the container.
RUN npm install -g pnpm@12.8.1 && pnpm --version
# Prisma's tools look for OpenSSL (the slim image has none).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@tk/api..." --filter "@tk/web..." --filter "@tk/admin..."
ARG VITE_SENTRY_DSN=""
ARG VITE_APP_ENV=production
ARG VITE_APP_RELEASE=""
# Prisma reads a database address while generating its client; none is contacted during the build (the real one
# comes from the server environment at run time).
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm --filter "@tk/api..." --filter "@tk/web..." --filter "@tk/admin..." run build && \
    mkdir -p apps/web/public
# The API with production dependencies only (workspace packages copied in with their built files); the sources,
# tests and tool configs are not needed at run time.
RUN pnpm --filter @tk/api deploy --legacy --prod /out/api && \
    cd /out/api && rm -rf src test scripts eslint.config.js vitest.config.ts tsconfig.json tsconfig.build.json

# ── API and worker: same image, different command ───────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ── Database migrations (`prisma migrate deploy`), run by the deploy script after a backup ─────────────────────
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── Website (Next.js standalone server) ─────────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# ── Reverse proxy: HTTPS (Caddy), the CMS's static files, and routing to the API and website ───────────────────
FROM caddy:2.11.7-alpine AS proxy
COPY --from=build /repo/apps/admin/dist /srv/admin
COPY infra/production/Caddyfile /etc/caddy/Caddyfile
