---
name: implement
description: Implement an approved Student Showcase specification or ticket end to end. Use when the user asks to build, implement, complete, or deliver defined behavior across the monorepo with migrations, validation, authorization, tests, documentation, and focused verification.
---

# Implement

Deliver the smallest complete vertical slice that satisfies the approved source of truth.

## Establish scope

1. Read root and nearest `AGENTS.md`, `CONTEXT.md`, relevant ADRs, product docs, and the full issue or spec including comments.
2. Inspect the existing implementation before editing. Preserve user changes and established patterns.
3. State success criteria: behavior that changes, behavior that remains unchanged, affected trust boundaries, and focused verification.
4. Resolve only meaningful ambiguity. If a low-risk implementation detail is governed by repo rules, state the assumption and proceed.
5. Confirm the work is on a short-lived branch from current `main`. Do not switch away from a dirty user branch or overwrite unrelated changes.

## Plan vertical slices

Split work into narrow, independently verifiable paths through the required layers. A slice may include migration, Core use case, HTTP contract, frontend state, and tests when all are needed for one behavior. Do not build every schema or endpoint before any user-visible path works.

Respect fixed boundaries:

- All browser data and authentication flows pass through Core.
- Actor identity comes from verified authentication context, never request bodies.
- Publication and media changes create reviewed `Revisions`.
- Public reads expose only consented profiles and published data.
- Student IDs, credentials, roster rows, and tokens never enter public responses or logs.

## Build

For each slice:

1. Use `$tdd` when behavior can be expressed through a stable seam.
2. Add versioned migrations before code that depends on them. Use expand-migrate-contract when a live compatibility window is required.
3. Implement domain behavior inside the Core feature module. Keep controllers transport-focused and persistence behind an explicit repository seam.
4. Validate untrusted input at Core. Frontend validation exists for user feedback, not authorization.
5. Implement the smallest Next.js surface with Server Components by default and a minimal Client Component boundary.
6. Add structured, privacy-safe observability at real external side effects and operational failure points.
7. Update authoritative docs when behavior, deployment, configuration, or operator steps change.

Do not add follow-up scope, generic frameworks, unused package extraction, or compatibility paths the supported contract does not need.

## Verify incrementally

Run affected commands one package or suite at a time:

- the focused test during each slice;
- package lint and typecheck;
- package build when bundling, runtime configuration, or deployment output changed;
- migration lint/integration checks when database behavior changed;
- Docker build and health checks when container behavior changed.

Never run the full monorepo suite or multiple resource-heavy suites in parallel without explicit confirmation for that run.

## Review and hand off

Run `$code-review` against the governing spec and repository standards. Fix verified in-scope findings, rerun affected checks, and report:

- behavior delivered and intentionally unchanged;
- migrations and compatibility order;
- exact checks passed, failed, and not run;
- rollout, observability, rollback, and external verification gaps;
- files or follow-ups outside scope.

Do not commit, push, open a pull request, deploy, or mutate GitHub Issues unless the user explicitly requested that action.
