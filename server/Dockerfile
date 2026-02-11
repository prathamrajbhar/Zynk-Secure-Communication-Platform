# ============================================================================
# Zynk Server — Production Multi-Stage Docker Build
#
# Stages:
#   1. deps      — Install production dependencies
#   2. builder   — Compile TypeScript
#   3. runner    — Minimal production image
#
# Features:
#   - Multi-stage build (final image ~150MB vs ~1GB)
#   - Non-root user for security
#   - Health check built-in
#   - Prisma client generation
#   - Node.js production optimizations
# ============================================================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev && \
    npx prisma generate

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all dependencies (including dev for TypeScript compilation)
RUN npm ci && npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
COPY prisma.config.ts ./

# Build TypeScript
RUN npm run build

# Stage 3: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 zynk && \
    adduser --system --uid 1001 zynk

# Install runtime dependencies
RUN apk add --no-cache openssl dumb-init curl

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Create upload directories
RUN mkdir -p uploads/thumbnails && chown -R zynk:zynk uploads

# Set production environment
ENV NODE_ENV=production
ENV PORT=8000

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Switch to non-root user
USER zynk

# Use dumb-init for proper signal handling (PID 1 problem)
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "dist/index.js"]
