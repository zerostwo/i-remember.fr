# Single-image PostgreSQL runtime for self-hosted deployments.
#
# Keep the Node/Debian base and PostgreSQL major explicit. Updating this digest
# is an intentional release operation because the persisted PGDATA is tied to
# PostgreSQL 15.
ARG NODE_IMAGE=node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3
FROM ${NODE_IMAGE} AS deps
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/database ./packages/database
COPY packages/storage ./packages/storage
COPY packages/types ./packages/types
COPY packages/memory-engine ./packages/memory-engine
COPY packages/ui ./packages/ui
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @i-remember/database generate \
  && pnpm --filter @i-remember/database build \
  && pnpm --filter @i-remember/api build \
  && pnpm web:build

FROM deps AS prod-deps
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && CI=true pnpm install --prod --offline --frozen-lockfile \
  --filter i-remember-fr \
  --filter @i-remember/api... \
  && pnpm --filter @i-remember/database generate \
  && rm -rf node_modules/.pnpm/@img+sharp-*linuxmusl-*

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7890
ENV I_REMEMBER_DATA_DIR=/var/opt/i-remember.fr
ENV API_BASE_URL=http://127.0.0.1:7892
ENV API_HOST=127.0.0.1
ENV API_PORT=7892
ENV POSTGRES_MAJOR=15
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    postgresql-15 \
    postgresql-client-15 \
  && rm -rf /var/lib/apt/lists/* \
    /usr/lib/x86_64-linux-gnu/libLLVM-14.so* \
    /usr/lib/postgresql/15/lib/bitcode \
    /usr/lib/postgresql/15/lib/llvmjit*.so
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server.mjs ./server.mjs
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=prod-deps --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=build --chown=node:node /app/src/server ./src/server
COPY --from=build --chown=node:node /app/index.html ./index.html
COPY --from=build --chown=node:node /app/fr.html ./fr.html
COPY --from=build --chown=node:node /app/legal.html ./legal.html
COPY --from=build --chown=node:node /app/public ./public
COPY docker/single-entrypoint.sh /usr/local/bin/i-remember-single
COPY docker/healthcheck.sh /usr/local/bin/i-remember-healthcheck
COPY docker/backup.sh /usr/local/bin/i-remember-backup
COPY docker/restore.sh /usr/local/bin/i-remember-restore
RUN chmod 0755 \
    /usr/local/bin/i-remember-single \
    /usr/local/bin/i-remember-healthcheck \
    /usr/local/bin/i-remember-backup \
    /usr/local/bin/i-remember-restore
RUN mkdir -p /var/opt/i-remember.fr
VOLUME ["/var/opt/i-remember.fr"]
EXPOSE 7890
HEALTHCHECK --interval=30s --timeout=8s --start-period=45s --retries=3 \
  CMD ["/usr/local/bin/i-remember-healthcheck"]
CMD ["sh", "/usr/local/bin/i-remember-single"]
