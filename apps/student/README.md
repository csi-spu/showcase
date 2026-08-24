# Student

Thai Student surface for Account activation, forced initial password change, Public Profile consent, Work drafting, attribution, submission, and feedback.

## Boundary

- Calls Core for every domain and authentication operation.
- Never reads Supabase or R2 directly.
- Keeps Student ID private even when a Public Profile is enabled.
- Shows the Published Revision separately from any Revision still under Review.

## Commands

```sh
pnpm --filter @showcase/student dev
pnpm --filter @showcase/student lint
pnpm --filter @showcase/student typecheck
pnpm --filter @showcase/student test:ci
pnpm --filter @showcase/student build
```

The development server listens on `http://localhost:3002`; health is `GET /health`.
