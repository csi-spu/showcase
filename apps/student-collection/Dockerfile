ARG GIT_SHA=development
FROM node:22.18.0-alpine3.22 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS dependencies
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/student-collection/package.json apps/student-collection/package.json
COPY apps/core/package.json apps/core/package.json
COPY packages/core-client/package.json packages/core-client/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ARG GIT_SHA
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_UPLOAD_SOURCE_MAPS=false
ENV GIT_SHA=$GIT_SHA
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV SENTRY_ORG=$SENTRY_ORG
ENV NODE_ENV=production
RUN pnpm --filter @showcase/observability build
RUN --mount=type=secret,id=sentry-auth-token \
    if [ "$SENTRY_UPLOAD_SOURCE_MAPS" = "true" ]; then \
      export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry-auth-token)" && \
      test -n "$SENTRY_AUTH_TOKEN" && test -n "$SENTRY_ORG" && \
      test -n "$NEXT_PUBLIC_SENTRY_DSN"; \
    fi && \
    pnpm --filter @showcase/student-collection build

FROM node:22.18.0-alpine3.22 AS runner
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3004
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /repo/apps/student-collection/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/student-collection/.next/static ./apps/student-collection/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/student-collection/public ./apps/student-collection/public
USER nextjs
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3004/health >/dev/null || exit 1
WORKDIR /app/apps/student-collection
CMD ["node", "server.js"]
