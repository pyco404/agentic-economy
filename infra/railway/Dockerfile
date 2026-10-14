# Agentic Economy backend image — one image for every process role (ROLE=all|api|sim|indexer).
# Build context: repository root. Only backend paths are copied; apps/web (Codex) is never part of this image.
#
#   docker build -f infra/railway/Dockerfile -t agentic-economy-server .
#   docker run -e ROLE=all -e MODE=demo -p 8787:8787 agentic-economy-server

# ---------- build ----------
FROM node:24.13.0-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate
WORKDIR /repo

# Manifests first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/world-spec/package.json packages/world-spec/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter "./packages/*" --filter ./apps/server

COPY packages ./packages
COPY apps/server ./apps/server
RUN pnpm --filter @agentic-economy/server run bundle

# ---------- runtime ----------
FROM node:24.13.0-slim AS runtime
ENV NODE_ENV=production \
    HOST=:: \
    PORT=8787 \
    NODE_OPTIONS="--enable-source-maps"
WORKDIR /app
# Self-contained bundle: no node_modules, no package manager, no build tools in the runtime image.
COPY --from=build --chown=node:node /repo/apps/server/dist-bundle/ ./
USER node
EXPOSE 8787
# Liveness for plain Docker; Railway uses its own deploy-time healthcheck on /readyz.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Exec form so SIGTERM reaches node directly (graceful: final snapshot + leadership release).
CMD ["node", "main.mjs"]
