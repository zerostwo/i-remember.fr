FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS prod-deps
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
ENV PORT=8080
ENV I_REMEMBER_DATA_DIR=/var/opt/i-remember
WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/src ./src
COPY --from=build /app/db ./db
COPY --from=build /app/index.html ./index.html
COPY --from=build /app/fr.html ./fr.html
COPY --from=build /app/legal.html ./legal.html
COPY --from=build /app/data ./data
COPY --from=build /app/public ./public
RUN mkdir -p /var/opt/i-remember \
  && chown -R node:node /var/opt/i-remember /app
USER node

EXPOSE 8080
CMD ["node", "server.mjs"]
