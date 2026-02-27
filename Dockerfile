# Multi-stage build for optimized production image
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Accept build argument for database URL (not actually used during generate, but required by config)
ARG DIRECT_DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
ENV DIRECT_DATABASE_URL=$DIRECT_DATABASE_URL

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript (backend)
RUN npm run build

# Keep only .prisma for production copy; remove rest of node_modules to free space before frontend install
RUN (cd node_modules && find . -mindepth 1 -maxdepth 1 ! -name '.prisma' -exec rm -rf {} +)

# Build frontend (for production serving from API)
# No VITE_API_URL: production build uses same-origin (relative) URLs so this image works on any domain
RUN cd frontend && npm ci && npm run build

# Production stage
FROM node:22-alpine AS production

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/frontend/dist ./frontend-dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/server.js"]

