# Single-image Postgres runtime for one-command self-hosted deployments. The
# compose file still provides the split web/admin/api/postgres deployment.
FROM node:22-slim AS deps
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

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter @i-remember/database generate \
  && pnpm --filter @i-remember/database build \
  && pnpm --filter @i-remember/api build \
  && pnpm web:build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7890
ENV I_REMEMBER_DATA_DIR=/var/opt/i-remember.fr
ENV API_BASE_URL=http://127.0.0.1:7892
ENV API_HOST=127.0.0.1
ENV API_PORT=7892
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl postgresql postgresql-client \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server.mjs ./server.mjs
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/src/server ./src/server
COPY --from=build --chown=node:node /app/index.html ./index.html
COPY --from=build --chown=node:node /app/fr.html ./fr.html
COPY --from=build --chown=node:node /app/legal.html ./legal.html
COPY --from=build --chown=node:node /app/public ./public
COPY docker/single-entrypoint.sh /usr/local/bin/i-remember-single
RUN mkdir -p /var/opt/i-remember.fr
VOLUME ["/var/opt/i-remember.fr"]
EXPOSE 7890
CMD ["sh", "/usr/local/bin/i-remember-single"]
