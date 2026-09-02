# AGENTS.md

Agent instructions for the Student Showcase Turborepo. These rules apply everywhere; app-specific rules live in each app's `AGENTS.md`.

## Product boundaries

The repository has four deployable surfaces:

- `apps/admin`: staff administration and Review workflow.
- `apps/student`: Student profile, Work, Revision, and roster-activated Account flows.
- `apps/visitor`: the unauthenticated Public Catalog.
- `apps/core`: the NestJS API and authentication BFF.

All surfaces belong to one domain. Read `CONTEXT.md` before naming domain concepts and relevant files in `docs/adr/` before changing architecture.

Core owns application data and authentication boundaries. Browser applications must not query Supabase tables directly. Supabase Auth remains the identity provider behind Core. R2 uploads use Core-issued presigned URLs.

## Engineering principles

- Maintainability, correctness, security, and operability come first.
- Choose the smallest correct solution. Do not add speculative abstractions or unused schema.
- Build normal request paths for 500k+ users: pagination, bounded queries, indexes, cacheable public reads, and horizontally scalable services.
- Make surgical changes. Preserve existing conventions and do not fix unrelated issues.
- Validate at trust boundaries. Do not add branches for states made impossible by the domain model or type system.
- Behavior changes require tests. Report exactly which checks ran and which did not.

## Canonical domain rules

- `Visitor` is an unauthenticated access state, not a role.
- Phase 1 roles are `Student` and `Admin`. `External Member`, `Star`, and `Comment` are follow-ups only.
- A `Work` has one `Submitter`, optional accepted `Contributors`, and immutable reviewed `Revisions`.
- The current `Published Revision` remains public while a newer Revision is reviewed.
- A `Change Request` requires a reason and actionable feedback.
- Admin edits are audited and still require an explicit approve-and-publish action; the same Admin may perform both.
- `Student ID` is private authentication data. Never expose it in public responses, logs, URLs, analytics, or client bundles.
- `Public Profile` visibility is governed by `Profile Consent`, which defaults to granted when a roster-activated `Account` is created; a `Student` may withdraw consent at any time, and a withdrawal is never silently re-granted.
- Archive and unpublish are recoverable. No hard delete through normal UI flows.

## Code conventions

- TypeScript strict mode. No `any`; use `unknown` and narrow it.
- Files: `kebab-case.ts` / `kebab-case.tsx`.
- Classes and React components: `PascalCase`.
- Variables and functions: `camelCase`.
- Constants and environment variables: `SCREAMING_SNAKE_CASE`.
- Boolean names start with `is`, `has`, `can`, or `should`. Multi-state concepts use an enum/status, not multiple booleans.
- Store timestamps in UTC. Render dates in `Asia/Bangkok` unless a future user preference explicitly overrides it.
- Phase 1 UI is Thai. User-generated Work content is one free-language value, not per-locale translations. UI strings still use translation keys so English UI can be added later.
- Never use barrel exports for server feature modules when they obscure dependencies or create cycles.
- Shared packages may depend on other packages, never on apps. Keep the workspace dependency graph acyclic.

## Frontend rules

- Use Next.js App Router and React Server Components by default.
- Add `'use client'` only at the smallest interactive boundary.
- Frontends call Core; they do not contain domain authorization or direct database access.
- Validate forms at the client boundary for UX and again in Core for trust.
- Use `next/image` for application images and explicit responsive `sizes`.
- Preserve accessible keyboard interaction, focus state, labels, reduced motion, and semantic HTML.
- shadcn components are source code, not an external design system. Shared primitives belong in `packages/ui` only after real reuse exists.

## Core rules

- Organize NestJS by feature module, not technical layer.
- Controllers translate transport concerns; application services enforce use cases; repositories isolate persistence.
- Constructor injection only. Use explicit tokens for interfaces at infrastructure seams.
- Validate every request with DTO/schema validation and reject unknown fields.
- Authentication and authorization use guards/policies. Never trust actor IDs supplied in request bodies.
- Use structured logs with `operation`, actor-safe identifiers, and stable `errorCode`; never log credentials, tokens, Student IDs, or sensitive roster rows.
- Database changes require versioned migrations. Never rely on runtime schema synchronization.
- External side effects require timeouts, bounded retries where safe, idempotency where requests can repeat, and observable failures.
- Provide liveness and readiness endpoints and graceful shutdown for deployments.

## Media rules

- Poster is required, portrait, JPEG/PNG/WebP, and at most 5 MB.
- Gallery has at most three JPEG/PNG/WebP images, each at most 5 MB.
- Videos remain on YouTube or TikTok; store provider URLs/IDs only. Never accept arbitrary embed HTML.
- File authorization happens before issuing an R2 presigned URL and again when finalizing metadata.
- Treat media replacement as a Revision requiring Review.

## Test execution

- Run only checks affected by files changed in the current task.
- Expand one package or suite at a time when broader validation is justified.
- Never run the full monorepo test suite or multiple resource-heavy suites in parallel without explicit user confirmation for that run.
- Prefer unit tests for domain behavior, integration tests at persistence/provider boundaries, and focused E2E tests for critical cross-app paths.
- Use Playwright for browser end-to-end tests.
- Run focused Playwright tests by passing affected test files or a `--grep` filter to `pnpm exec playwright test`.
- Do not run the full Playwright suite without explicit user confirmation.
- CI commands must be non-mutating. Formatting checks must fail instead of rewriting files.

## CLI tooling

- Prefix every shell command with `rtk` as documented in `/Users/crybabys/.codex/RTK.md`.
- Never invoke `gh` directly. Use `rtk gh ...` for every GitHub operation.
- Use `rg` / `rg --files` for search.
- Do not print credentials, authorization headers, cookies, or secret environment values.
- Read files before editing. Do not open files over 100 KB wholesale; inspect targeted sections.

## Git and delivery

- Branch from `main`; merge through a reviewed pull request.
- Keep commits scoped and independently understandable.
- `main` is protected and deployable. After CI succeeds, a merge builds and deploys only affected immutable application images to production through the protected `production` Environment. `production.yml` also accepts a manual `workflow_dispatch` with an explicit `source_sha` and application list for redeploying existing images.
- CI builds immutable SHA-tagged images. Coolify pulls those exact tags; CI does not SSH to hosts and Coolify does not build from git.
- Primary rollback is a git revert and normal redeploy. Emergency image rollback must be followed by a repository revert.

Full rules and runbooks live under `docs/rules/`, `docs/infrastructure/`, and `docs/runbooks/`.

## Agent skills

Repository-local skills live under `.agents/skills/`. Read [the skill catalog](docs/agents/skills.md) and invoke the narrowest matching skill instead of improvising a parallel workflow.

### Delivery workflow

- Use `$grill-with-docs`, `$domain-modeling`, `$research`, or `$prototype` to resolve uncertainty before production implementation.
- Use `$to-spec` and `$to-tickets` to create durable, vertically sliced work.
- Use `$implement` with `$tdd`, then `$code-review`, for behavior changes.
- Use `$diagnosing-bugs` for evidence-first debugging and `$handoff` before changing sessions.
- Use `$codebase-design` and `$improve-codebase-architecture` for explicit architecture work. Use `$wayfinder` only when the route to an implementation-ready spec exceeds one session.

Skills do not expand authorization. Creating issues, committing, pushing, opening pull requests, deploying, or changing external services still requires the authority defined by the user request and these rules.

### Issue tracker

Issues and PRDs live in GitHub Issues for `csi-spu/showcase`; use `rtk gh ...` only. See `docs/agents/issue-tracker.md`.

### Triage labels

Use `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with `CONTEXT.md` and root `docs/adr/`. See `docs/agents/domain.md`.
