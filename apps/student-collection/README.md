# Student Collection

Thai Student surface for private document-collection (issue #112). This initial slice only wires authentication against Core, reusing the same Student Account and Student ID as the Showcase Student app; forms, drafts, uploads, and submissions are out of scope until later milestones.

## Boundary

- Calls Core for every domain and authentication operation; never queries the database directly.
- Uses its own audience-bound session cookie, separate from the Showcase Student app, even for the same Student Account.
- A document submission here never becomes a Work, Revision, Review, or Public Catalog content.

## Commands

```sh
pnpm --filter @showcase/student-collection dev
pnpm --filter @showcase/student-collection lint
pnpm --filter @showcase/student-collection typecheck
pnpm --filter @showcase/student-collection test:ci
pnpm --filter @showcase/student-collection build
```
