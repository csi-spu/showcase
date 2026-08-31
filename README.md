# Student Showcase

Monorepo for preserving and publishing work from สาขาวิทยาการคอมพิวเตอร์และนวัตกรรมการพัฒนาซอฟต์แวร์.

## Surfaces

| Workspace           | Purpose                           | Local port | Production boundary |
| ------------------- | --------------------------------- | ---------: | ------------------- |
| `@showcase/visitor` | Public Catalog                    |       3000 | public subdomain    |
| `@showcase/admin`   | roster and Review operations      |       3001 | admin subdomain     |
| `@showcase/student` | Student profile and Work workflow |       3002 | student subdomain   |
| `@showcase/core`    | Domain API and authentication     |       4100 | core service        |

Browser applications use their Next.js surface as a BFF and call Core server-to-server. Supabase Auth and Postgres remain behind Core; R2 access uses Core-issued presigned URLs.

## Start

Prerequisites: Node `22.18.0`, Corepack, Docker with Compose, and Git.

```sh
pnpm bootstrap
pnpm db:start
pnpm dev
```

`pnpm bootstrap` installs the frozen lockfile and creates missing local env files without overwriting existing values. Supabase Studio is available at `http://127.0.0.1:54323` after local services start.

## Focused commands

```sh
pnpm --filter @showcase/visitor dev
pnpm --filter @showcase/admin test:ci
pnpm --filter @showcase/student typecheck
pnpm --filter @showcase/core test:e2e
pnpm e2e
pnpm turbo run lint typecheck test:ci build --affected
```

The deterministic Chromium Profile Consent journey and local-only data lifecycle are documented in [Browser E2E harness](docs/testing/browser-e2e.md).

Do not run the full monorepo validation locally without checking resource impact. CI uses affected gates; release builds all four deployment artifacts.

## Read first

- [Domain language](CONTEXT.md)
- [Architecture](docs/architecture.md)
- [Onboarding](docs/onboarding.md)
- [Monorepo guide](docs/monorepo.md)
- [Phase 1 scope](docs/product/phase-1.md)
- [Agent rules](AGENTS.md)
- [Agent skill catalog](docs/agents/skills.md)
- [ADRs](docs/adr/README.md)

Infrastructure and incident procedures live under `docs/infrastructure/` and `docs/runbooks/`.
