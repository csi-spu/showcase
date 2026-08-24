# Admin

Thai administration surface for roster import, Review, publication, content recovery, and audit-aware moderation.

## Boundary

- Calls Core for every domain and authentication operation.
- Never reads Supabase or R2 directly.
- Never exposes Student ID in URLs, logs, exports unrelated to roster administration, or client analytics.
- Admin edits and publication approval remain separate audited actions.

## Commands

```sh
pnpm --filter @showcase/admin dev
pnpm --filter @showcase/admin lint
pnpm --filter @showcase/admin typecheck
pnpm --filter @showcase/admin test:ci
pnpm --filter @showcase/admin build
```

The development server listens on `http://localhost:3001`; health is `GET /health`.
