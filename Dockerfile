# syntax=docker/dockerfile:1.7
# Production image for Pensuma (works with Dokploy "Dockerfile" builds).
#   docker build -t pensuma .
#   docker run -p 3000:3000 -e DATABASE_URL=... -e BETTER_AUTH_SECRET=... -e BETTER_AUTH_URL=https://... pensuma

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g bun@1 && npm cache clean --force
WORKDIR /app

# ---- dependencies -----------------------------------------------------------
FROM base AS deps
COPY package.json bun.lock ./
COPY scripts ./scripts
RUN bun install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Env is validated at runtime, not at build time.
ENV SKIP_ENV_VALIDATION=1
RUN bun run build

# ---- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone server + static assets (public includes the self-hosted Pyodide files)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# SQL migrations, applied automatically on startup (src/instrumentation.ts)
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
# Server-side Python grader: sandbox entry script + the Pyodide runtime it loads
COPY --from=builder --chown=nextjs:nodejs /app/grader ./grader
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pyodide ./node_modules/pyodide

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/auth/ok').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
