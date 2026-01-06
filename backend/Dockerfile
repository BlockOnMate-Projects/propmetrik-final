# Propmetrik Backend Dockerfile
# Multi-stage build for production optimization

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN npm run build

# Prune devDependencies
RUN npm prune --production

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S propmetrik -u 1001 -G nodejs

WORKDIR /app

# Copy built assets and production dependencies
COPY --from=builder --chown=propmetrik:nodejs /app/dist ./dist
COPY --from=builder --chown=propmetrik:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=propmetrik:nodejs /app/package.json ./

# Copy migration files (needed at runtime)
COPY --from=builder --chown=propmetrik:nodejs /app/src/database/migrations ./dist/database/migrations
COPY --from=builder --chown=propmetrik:nodejs /app/src/database/seeds ./dist/database/seeds

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Switch to non-root user
USER propmetrik

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Use dumb-init as entrypoint
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# ============================================
# Stage: Development
# ============================================
FROM node:20-alpine AS development

WORKDIR /app

# Install development dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Set environment
ENV NODE_ENV=development
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start with hot reload
CMD ["npm", "run", "dev"]
