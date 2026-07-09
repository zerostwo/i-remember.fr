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
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @i-remember/database generate && pnpm --filter @i-remember/database build && pnpm --filter @i-remember/api build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=7892
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/packages/database/package.json ./packages/database/package.json
COPY --from=build --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=build --chown=node:node /app/packages/database/prisma ./packages/database/prisma
COPY --from=build --chown=node:node /app/packages/database/prisma.config.ts ./packages/database/prisma.config.ts
COPY --from=build --chown=node:node /app/packages/storage/package.json ./packages/storage/package.json
COPY --from=build --chown=node:node /app/packages/storage/src ./packages/storage/src
RUN mkdir -p /var/opt/i-remember-assets && chown node:node /var/opt/i-remember-assets
USER node
EXPOSE 7892
CMD ["sh", "-c", "cd packages/database && ../../node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma && cd /app && node apps/api/dist/server.js"]
