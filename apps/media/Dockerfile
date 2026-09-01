FROM node:22.18.0-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/media/package.json apps/media/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter @showcase/media...
COPY apps/media apps/media
RUN pnpm --filter @showcase/media build

FROM node:22.18.0-alpine
USER node
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/media/dist ./dist
ENV HOST=0.0.0.0 PORT=4191 STORAGE_ROOT=/data
EXPOSE 4191
CMD ["node", "dist/server.js"]
