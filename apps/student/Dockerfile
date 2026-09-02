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
RUN pnpm --filter @showcase/student build

FROM node:22.18.0-alpine3.22 AS runner
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3002
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /repo/apps/student/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/student/.next/static ./apps/student/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/student/public ./apps/student/public
USER nextjs
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3002/health >/dev/null || exit 1
WORKDIR /app/apps/student
CMD ["node", "server.js"]
