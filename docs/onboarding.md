# Onboarding

## Prerequisites

- Git
- Node.js `22.18.0` through nvm, fnm, mise, or equivalent
- Corepack enabled
- Docker Engine or Docker Desktop with Compose

Verify exact versions from `.nvmrc`, `package.json`, and the `packageManager` field. Do not substitute another package manager.

## First setup

```sh
pnpm bootstrap
pnpm db:start
pnpm dev
```

Bootstrap is idempotent: dependency install uses the frozen lockfile and existing local environment files are preserved.

## Local URLs

| Service           | URL                                                       |
| ----------------- | --------------------------------------------------------- |
| Visitor           | `http://localhost:3000`                                   |
| Admin             | `http://localhost:3001`                                   |
| Student           | `http://localhost:3002`                                   |
| Core              | `http://localhost:4100/v1`                                |
| Supabase API      | `http://127.0.0.1:54321`                                  |
| Supabase Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Supabase Studio   | `http://127.0.0.1:54323`                                  |

## Normal workflow

1. Read `CONTEXT.md`, relevant ADRs, root rules, and the nearest app `AGENTS.md`.
2. Branch from current `main` and keep the change scoped.
3. Add migration before persistence code when schema changes.
4. Add or update behavior tests with the implementation.
5. Run package-level lint, typecheck, test, and build as affected.
6. Open a reviewed pull request; do not deploy from a developer machine.

## Database workflow

- `pnpm db:start`: start local Supabase.
- `pnpm db:status`: show local endpoints and status.
- `pnpm exec supabase migration new <name>`: create a versioned migration.
- `pnpm db:reset`: destroy and recreate only the local database from migrations and seed.
- `pnpm db:lint`: lint the local schema.
- `pnpm db:stop`: stop local Supabase containers.

Never edit a migration already applied to a shared environment. Add a forward migration. Seed data must be deterministic, non-sensitive, and safe to rebuild.

## Troubleshooting

- Version mismatch: activate `.nvmrc`, enable Corepack, rerun `pnpm bootstrap`.
- Port conflict: stop the existing process or local Supabase stack; do not silently change committed ports.
- Stale generated output: run the affected package build again. Do not delete unrelated caches or user files.
- Supabase will not start: confirm Docker is running, then inspect `pnpm db:status` and Supabase container logs.
- Missing environment key: compare the affected app's local env file with `.env.example`; never paste secrets into issues or chat logs.
