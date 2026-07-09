FROM node:22-slim AS deps
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm web:build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7890
ENV I_REMEMBER_ADMIN_ONLY=true
ENV I_REMEMBER_DATA_DIR=/var/opt/i-remember.fr
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server.mjs ./server.mjs
COPY --from=build --chown=node:node /app/src/server ./src/server
COPY --from=build --chown=node:node /app/index.html ./index.html
COPY --from=build --chown=node:node /app/fr.html ./fr.html
COPY --from=build --chown=node:node /app/legal.html ./legal.html
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /var/opt/i-remember.fr && chown node:node /var/opt/i-remember.fr
USER node
EXPOSE 7890
CMD ["node", "server.mjs"]
