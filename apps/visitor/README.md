# Visitor

Thai public catalog for consented Public Profiles and Published Revisions.

## Boundary

- Reads public data through Core only.
- Never renders drafts, pending Revisions, private profiles, Student IDs, or Account state.
- Public pages use immutable random public IDs plus optional human-readable slugs.
- Phase 1 contains no login, Star, or Comment placeholder flows.

## Commands

```sh
pnpm --filter @showcase/visitor dev
pnpm --filter @showcase/visitor lint
pnpm --filter @showcase/visitor typecheck
pnpm --filter @showcase/visitor test:ci
pnpm --filter @showcase/visitor build
```

The development server listens on `http://localhost:3000`; health is `GET /health`.
