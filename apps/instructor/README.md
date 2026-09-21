# Instructor

Thai Instructor surface for private document-collection management (issue #112). This initial slice only wires authentication against Core; forms, groups, submissions, checking, and exports are out of scope until later milestones.

## Boundary

- Calls Core for every domain and authentication operation; never queries the database directly.
- Uses its own audience-bound session cookie, separate from Admin and the Showcase Student app.
- Instructor accounts and role grants are provisioned from the existing Admin surface, not self-service.

## Commands

```sh
pnpm --filter @showcase/instructor dev
pnpm --filter @showcase/instructor lint
pnpm --filter @showcase/instructor typecheck
pnpm --filter @showcase/instructor test:ci
pnpm --filter @showcase/instructor build
```
