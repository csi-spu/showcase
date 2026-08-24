# Core

NestJS API and authentication BFF for every Showcase surface.

## Boundary

- Owns authentication sessions, authorization, workflow, validation, audit events, and persistence adapters.
- Uses Supabase Auth as identity provider and Supabase Postgres for metadata.
- Issues narrowly scoped R2 presigned URLs after authorization; clients never receive R2 API credentials.
- Keeps controllers transport-focused and organizes business behavior by feature module.

## Commands

```sh
pnpm --filter @showcase/core dev
pnpm --filter @showcase/core lint
pnpm --filter @showcase/core typecheck
pnpm --filter @showcase/core test:ci
pnpm --filter @showcase/core test:e2e
pnpm --filter @showcase/core build
```

The API listens on `http://localhost:4100`; liveness is `GET /v1/health/live` and readiness is `GET /v1/health/ready`.
