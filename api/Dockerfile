# api/Dockerfile

FROM node:20-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci

FROM base AS dev
WORKDIR /usr/src/app
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:20-alpine AS prod
WORKDIR /usr/src/app
ENV NODE_ENV=production

ARG BUILD_VERSION=0.0.0
ARG BUILD_SHA=dev
ARG BUILD_SHORT_SHA=dev
ARG BUILD_TIME=unknown
ENV BUILD_VERSION=$BUILD_VERSION \
    BUILD_SHA=$BUILD_SHA \
    BUILD_SHORT_SHA=$BUILD_SHORT_SHA \
    BUILD_TIME=$BUILD_TIME

COPY --from=base /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm prune --omit=dev
EXPOSE 3000
CMD ["node", "index.js"]
