# Multi-stage build: separate backend and frontend builders to reduce peak disk on the runner.
# The runner runs out of space when one stage had both backend + frontend node_modules.

# ---- Backend: build API and Prisma ----
FROM node:22-alpine AS backend-builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .
ARG DIRECT_DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
ENV DIRECT_DATABASE_URL=$DIRECT_DATABASE_URL

RUN npx prisma generate
RUN npm run build

# ---- Frontend: build React app (no backend node_modules in this stage) ----
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY frontend/package*.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---- Production image ----
FROM node:22-alpine AS production
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

COPY --from=backend-builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=backend-builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend-builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=backend-builder --chown=nodejs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=frontend-builder --chown=nodejs:nodejs /app/dist ./frontend-dist

USER nodejs
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/server.js"]
