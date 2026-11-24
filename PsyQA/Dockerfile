FROM node:20-alpine AS deps
WORKDIR /app
# better-sqlite3 无 musl 预编译包，alpine 下必须源码构建
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY client/package*.json ./client/
# client/.npmrc 含 legacy-peer-deps（react-scripts@5 对 typescript@5 的 peer 冲突），必须随 COPY 进镜像
COPY client/.npmrc ./client/
RUN npm ci --omit=dev && cd client && npm ci --omit=dev

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY client/package*.json ./client/
COPY client/.npmrc ./client/
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
# 运行时数据（SQLite/账号/向量库）不进镜像，由卷或环境注入
RUN mkdir -p /app/server/data /app/vector_db

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/server.js"]
