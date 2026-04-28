# syntax=docker/dockerfile:1

# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first (for layer caching)
# client/package.json stub is needed so npm can resolve the workspace list
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install server workspace deps only (skips client's vite/react/etc.)
RUN npm ci --workspace=server --include-workspace-root

# Copy server source
COPY server/ ./server/

# Generate Prisma Client (writes into node_modules/@prisma/client)
RUN cd server && npx prisma generate

# Compile TypeScript → server/dist/
RUN npm run build --workspace=server


# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Runtime: hoisted node_modules (includes @prisma/client, prisma CLI, ts-node for seed)
COPY --from=builder /app/node_modules ./node_modules

# Compiled server
COPY --from=builder /app/server/dist ./server/dist

# Prisma schema + seed (migrate deploy / db push reads schema; seed needs seed.ts)
COPY --from=builder /app/server/prisma ./server/prisma

# package.json files (prisma seed command is defined in server/package.json)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server/package.json ./server/package.json

# Startup script
COPY server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["/entrypoint.sh"]
