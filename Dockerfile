# Single-image Postgres runtime for self-hosted deployments.
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
  && rm -rf /var/lib/apt/lists/* \
    /usr/lib/x86_64-linux-gnu/libLLVM-14.so* \
    /usr/lib/postgresql/*/lib/bitcode \
    /usr/lib/postgresql/*/lib/llvmjit*.so
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
RUN mkdir -p /var/opt/i-remember.fr
VOLUME ["/var/opt/i-remember.fr"]
EXPOSE 7890
CMD ["sh", "/usr/local/bin/i-remember-single"]
