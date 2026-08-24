# Monorepo

## Layout

```text
apps/                 deployable applications
  admin/              Next.js administration surface
  student/            Next.js Student surface
  visitor/            Next.js public catalog
  core/               NestJS API and authentication BFF
docs/                 product, architecture, rules, infrastructure, runbooks
supabase/             local config, migrations, and deterministic seed
tools/                repository automation
.github/              CI, image build, and deployment workflows
```

Create `packages/*` only after code has two real consumers and one stable responsibility. A shared package may depend on another package but never on an app. Avoid a generic `common` package.

## Task graph

Turborepo defines `build`, `lint`, `typecheck`, `test`, and `test:ci`. Workspace scripts must use those exact task names so CI can select affected packages. Builds depend on dependency builds; tests and type checks receive built internal dependencies.

Root configuration and lockfile changes are global dependencies and may invalidate every package. Documentation-only changes should not require application builds unless they alter agent or delivery contracts.

## Dependency policy

- pnpm version is pinned in `packageManager`; Node and pnpm engines are exact.
- Commit `pnpm-lock.yaml`; CI uses `--frozen-lockfile`.
- Install dependencies in the narrowest workspace that imports them.
- Keep production and development dependencies correctly separated.
- Dependabot opens grouped weekly updates; framework major upgrades remain deliberate reviewed changes.

## Adding a package

1. Define one responsibility and at least two current consumers.
2. Use the `@showcase/*` namespace and strict TypeScript base configuration.
3. Add non-mutating `lint`, `typecheck`, `test:ci`, and `build` scripts as applicable.
4. Confirm dependency direction remains acyclic with `pnpm turbo ls`.
5. Update this layout and relevant app rules.

## Focused validation

Use `pnpm --filter <workspace> <task>` while developing. Use `pnpm turbo run lint typecheck test:ci build --affected` when the branch is ready. Full release validation belongs in CI and is expanded one package or image at a time when debugging locally.
