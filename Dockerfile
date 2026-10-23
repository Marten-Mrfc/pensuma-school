# syntax=docker/dockerfile:1.7
# Production image for Pensuma (Dokploy "Dockerfile" or "Docker Compose" builds).
#   docker build -t pensuma .
#   docker run -p 127.0.0.1:3000:3000 -e DATABASE_URL=... -e BETTER_AUTH_SECRET=... \
#     -e BETTER_AUTH_URL=https://... pensuma
#
# The runtime files are owned by root and only readable for the app user
# (nextjs): a compromised process or a Python sandbox escape cannot rewrite
# server.js or .next. Writable: /app/.next/cache and /tmp (tmpfs in
# docker-compose.yml, which also makes the root filesystem read-only).

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g bun@1.4.2 && npm cache clean --force
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
# Env is validated at runtime, not at build time (builder stage only).
ENV SKIP_ENV_VALIDATION=1
RUN bun run build

# ---- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    # Password hashing (scrypt) runs on the libuv pool: a class signing in
    # at once should not queue behind 4 threads.
    UV_THREADPOOL_SIZE=8

# tini as PID 1: forwards SIGTERM and reaps the grader's sandbox processes.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --no-create-home nextjs

# Next.js standalone server + static assets (public includes the self-hosted
# Pyodide files). Root-owned and world-readable on purpose (no --chown).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# SQL migrations, applied automatically on startup (src/instrumentation.ts)
COPY --from=builder /app/drizzle ./drizzle
# Server-side Python grader: sandbox entry script + the Pyodide runtime it loads
COPY --from=builder /app/grader ./grader
COPY --from=builder /app/node_modules/pyodide ./node_modules/pyodide

# The only app directory the server may write to.
RUN mkdir -p /app/.next/cache && chown nextjs:nodejs /app/.next/cache

USER nextjs
EXPOSE 3000
# Every 10 s: a server that stops answering is reported unhealthy within
# ~30 s (and replaced by Swarm), and a new one counts as healthy sooner
# during a rolling deploy. start-period covers migrations and warm-up.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/auth/ok').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
