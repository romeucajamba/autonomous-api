# ==========================================
# STAGE 1: Base image with pnpm and system tools
# ==========================================
FROM node:22-alpine AS base

# Install required system libraries (OpenSSL for Prisma engine, libc6-compat, tini for signals)
RUN apk add --no-cache libc6-compat openssl tini

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Enable and activate pnpm via Corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# ==========================================
# STAGE 2: Install all dependencies (caching)
# ==========================================
FROM base AS deps

# Copy package definitions and workspace configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/
COPY prisma7.config.ts prisma.config.ts* ./

# Install all dependencies (including devDependencies for build and prisma generation)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ==========================================
# STAGE 3: Build the application
# ==========================================
FROM base AS builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy application source code and configurations
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma/
COPY prisma7.config.ts prisma.config.ts* ./
COPY src ./src/

# Generate Prisma Client (outputs to src/generated/prisma)
RUN pnpm exec prisma generate

# Build NestJS application (outputs to dist/)
RUN pnpm run build

# Install production dependencies only for lean runtime footprint
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# ==========================================
# STAGE 4: Production runner image
# ==========================================
FROM node:22-alpine AS runner

# Install OpenSSL for Prisma and curl for healthchecks
RUN apk add --no-cache libc6-compat openssl tini curl

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Enable pnpm in runner stage for prisma migration deploy
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create app directory with proper permissions for non-root node user
RUN chown -R node:node /app

# Copy built artifacts and production dependencies
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/src/generated ./src/generated
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/prisma7.config.ts ./prisma7.config.ts
COPY --chown=node:node --from=builder /app/prisma.config.ts* ./prisma.config.ts
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

# Run as non-root user for security
USER node

EXPOSE 3000

# Health check using native Node 22 fetch
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
