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

# Force NODE_ENV=development during install to include devDependencies
# (Coolify injects ARG NODE_ENV=production which would skip them)
ENV NODE_ENV=development
# Use npm install (not npm ci) since package-lock.json is at monorepo root
RUN npm install --legacy-peer-deps
ENV NODE_ENV=production

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript — increase heap for large project
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build 2>&1 || { echo "=== TSC BUILD FAILED — full output above ==="; exit 1; }

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
COPY --from=builder --chown=propmetrik:nodejs /app/database/migrations ./database/migrations

# Copy report templates (JSON loaded via fs.readFileSync, not compiled by tsc)
COPY --from=builder --chown=propmetrik:nodejs /app/src/services/valuation-engine/report-templates ./dist/src/services/valuation-engine/report-templates

# Copy DOCX templates (used by docGenerationService — __dirname/../../../templates)
COPY --from=builder --chown=propmetrik:nodejs /app/templates ./dist/templates

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Switch to non-root user
USER propmetrik

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Use dumb-init as entrypoint
ENTRYPOINT ["dumb-init", "--"]

# Start the application (rootDir is "." so tsc outputs to dist/src/)
CMD ["node", "dist/src/index.js"]

# ============================================
# Stage: Development
# ============================================
FROM node:20-alpine AS development

WORKDIR /app

# Install development dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Force NODE_ENV=development during install to include devDependencies
ENV NODE_ENV=development
# Use npm install (not npm ci) since package-lock.json is at monorepo root
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Set environment
ENV NODE_ENV=development
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start with hot reload
CMD ["npm", "run", "dev"]
