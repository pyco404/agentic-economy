# Build context: repository root. This image contains only the frontend runtime.
FROM node:24.13.0-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @agentic-economy/shared --filter @agentic-economy/web
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Public browser configuration is compiled by Vite, never supplied as secrets.
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_DATA_MODE=api \
    VITE_API_URL=${VITE_API_URL} \
    VITE_WS_URL=${VITE_WS_URL}
RUN node apps/web/scripts/validate-hosting-env.mjs && pnpm --filter @agentic-economy/web build

FROM caddy:2.11.7-alpine AS runtime
ENV PORT=8080 \
    WEB_ROOT=/srv \
    XDG_CONFIG_HOME=/tmp/caddy/config \
    XDG_DATA_HOME=/tmp/caddy/data
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
