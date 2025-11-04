FROM node:22 AS base
WORKDIR /usr/src/app

# Only package files to leverage Docker layer caching
COPY package*.json ./

FROM base AS dev
RUN npm ci && npm i -D nodemon
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS prod
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
