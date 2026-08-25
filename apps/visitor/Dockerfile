ARG GIT_SHA=development
FROM node:22.18.0-alpine3.22 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS dependencies
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/student/package.json apps/student/package.json
COPY apps/visitor/package.json apps/visitor/package.json
COPY apps/core/package.json apps/core/package.json
COPY packages/core-client/package.json packages/core-client/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production
RUN pnpm --filter @showcase/visitor build

FROM node:22.18.0-alpine3.22 AS runner
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /repo/apps/visitor/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/visitor/.next/static ./apps/visitor/.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1
WORKDIR /app/apps/visitor
CMD ["node", "server.js"]
