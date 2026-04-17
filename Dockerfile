# ============================================================
# Ghana SHS Backend — Dockerfile for Render
# Multi-stage: builder → production image
# ============================================================

# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install system dependencies required by Prisma
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install all dependencies
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/

# Generate Prisma client and compile TypeScript
RUN npx prisma generate
RUN npm run build

# ── Stage 2: Production ─────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install system dependencies required by Prisma at runtime
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy compiled output and Prisma runtime files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/

# Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs backend && chown -R backend:nodejs /app

USER backend

EXPOSE 4000

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]