# Production Dockerfile optimized for mbnd.ir behind Cloudflare
# Works on Cloudflare Containers, Cloudflare Tunnel (VPS/Home Server), Koyeb, Render, Railway, or Fly.io
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Native build tools for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* bun.lock* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

# ffmpeg for WebP image & vCard avatar optimization + curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV APP_PORT=3000
ENV DB_PATH=/app/data/site.db
ENV UPLOAD_DIR=/app/public/uploads

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/server.ts ./server.ts

RUN mkdir -p /app/data /app/public/uploads

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["npx", "tsx", "server.ts"]
