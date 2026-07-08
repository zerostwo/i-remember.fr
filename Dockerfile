FROM node:22-slim AS deps
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS prod-deps
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7890
ENV I_REMEMBER_DATA_DIR=/var/opt/i-remember.fr
WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/server.mjs ./server.mjs
COPY --chown=node:node --from=build /app/src/server ./src/server
COPY --chown=node:node --from=build /app/index.html ./index.html
COPY --chown=node:node --from=build /app/fr.html ./fr.html
COPY --chown=node:node --from=build /app/legal.html ./legal.html
COPY --chown=node:node --from=build /app/public ./public
RUN mkdir -p /var/opt/i-remember.fr \
  && chown node:node /var/opt/i-remember.fr
USER node

EXPOSE 7890
CMD ["node", "server.mjs"]
