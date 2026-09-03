ARG GIT_SHA=development
FROM node:22.18.0-alpine3.22 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
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
COPY packages/observability/package.json packages/observability/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ARG GIT_SHA
ARG SENTRY_ORG
ARG SENTRY_UPLOAD_SOURCE_MAPS=false
ENV GIT_SHA=$GIT_SHA
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=showcase-core
ENV SENTRY_RELEASE=showcase-core@$GIT_SHA
RUN pnpm --filter @showcase/observability build
RUN pnpm --filter @showcase/core db:generate
RUN pnpm --filter @showcase/core build
RUN --mount=type=secret,id=sentry-auth-token \
    if [ "$SENTRY_UPLOAD_SOURCE_MAPS" = "true" ]; then \
      export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry-auth-token)" && \
      test -n "$SENTRY_AUTH_TOKEN" && test -n "$SENTRY_ORG" && \
      pnpm --filter @showcase/core exec sentry-cli sourcemaps inject dist && \
      pnpm --filter @showcase/core exec sentry-cli sourcemaps upload --release="$SENTRY_RELEASE" dist; \
    fi
RUN pnpm deploy --filter @showcase/core --prod /prod/core
RUN cd /prod/core && node -e "require('./generated/prisma-client')"

FROM node:22.18.0-alpine3.22 AS runner
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
ENV APP_ENV=production
ENV NODE_ENV=production
ENV PORT=4100
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY --from=builder --chown=nestjs:nodejs /prod/core ./
USER nestjs
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:4100/v1/health/ready >/dev/null || exit 1
CMD ["node", "dist/main.js"]
