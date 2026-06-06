FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci --omit=dev && cd client && npm ci --omit=dev

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci && cd client && npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PSYQA_SERVE_CLIENT=1
ENV PORT=3001

RUN apk add --no-cache wget

COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/build ./client/build
COPY --from=build /app/server/data ./server/data
COPY --from=build /app/vector_db ./vector_db

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/server.js"]
