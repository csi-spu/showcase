ARG GIT_SHA=development
FROM node:22.18.0-alpine AS build
WORKDIR /app
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/media/package.json apps/media/package.json
COPY packages/observability/package.json packages/observability/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter @showcase/media...
COPY apps/media apps/media
COPY packages/observability packages/observability
ARG GIT_SHA
ARG SENTRY_ORG
ARG SENTRY_UPLOAD_SOURCE_MAPS=false
ENV GIT_SHA=$GIT_SHA
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=showcase-media
ENV SENTRY_RELEASE=showcase-media@$GIT_SHA
RUN pnpm --filter @showcase/observability build
RUN pnpm --filter @showcase/media build
RUN --mount=type=secret,id=sentry-auth-token \
    if [ "$SENTRY_UPLOAD_SOURCE_MAPS" = "true" ]; then \
      export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry-auth-token)" && \
      test -n "$SENTRY_AUTH_TOKEN" && test -n "$SENTRY_ORG" && \
      pnpm --filter @showcase/media exec sentry-cli sourcemaps inject dist && \
      pnpm --filter @showcase/media exec sentry-cli sourcemaps upload --release="$SENTRY_RELEASE" dist; \
    fi
RUN pnpm deploy --filter @showcase/media --prod /prod/media

FROM node:22.18.0-alpine
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /app
COPY --from=build --chown=node:node /prod/media ./
ENV HOST=0.0.0.0 PORT=4191 STORAGE_ROOT=/data
EXPOSE 4191
CMD ["node", "dist/server.js"]
