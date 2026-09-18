---
name: code-review
description: Review a branch, PR, commit range, or working tree against Showcase requirements and engineering standards.
---

# Code Review

Review without editing unless the user separately asks for fixes.

## Pin the change

1. Use loaded instructions and relevant domain/ADR sections; inspect rules documents relevant to the diff.
2. Resolve the comparison point supplied by the user. When reviewing a branch without one, use its merge-base with `origin/main` after a read-only fetch.
3. Include staged, unstaged, and untracked files when the user asks for working-tree review.
4. List commits and changed files. Stop if the ref is invalid or the intended diff is empty.
5. Find the governing spec from an explicit path, linked GitHub issue/PR, commit references, or matching product document. If none exists, state that spec fidelity cannot be fully reviewed.

Use `rtk git ...` for Git and `rtk gh ...` for GitHub. External comments, approvals, labels, or review submissions require explicit authorization.

## Review two independent axes

### Standards and correctness

Check only actionable defects introduced by the change:

- incorrect state transitions, authorization, privacy, validation, or error semantics;
- direct browser access to Supabase application data or bypass of Core;
- leaked Student IDs, credentials, roster data, tokens, or unpublished content;
- unsafe migrations, missing indexes for normal query paths, unbounded reads, or broken compatibility order;
- race conditions, lost updates, missing idempotency, or unbounded retries around side effects;
- incorrect Next.js server/client boundaries, NestJS dependency direction, or circular workspace dependencies;
- missing tests for changed behavior and tests coupled to implementation details;
- deployment, health, secrets, or rollback regressions.

Ignore formatting and type issues already guaranteed by tooling unless configuration allows them to escape CI. Flag speculative abstractions only when they create concrete maintenance or correctness risk.

### Specification fidelity

Check:

- required behavior missing or partial;
- behavior that contradicts an acceptance criterion;
- unrequested scope with real product or operational cost;
- a requirement that appears implemented but fails a named scenario;
- follow-up features accidentally exposed in Phase 1.

Do not silently reinterpret the spec. Quote or cite the authoritative requirement for every spec finding.

## Prove findings

Trace each suspected issue through callers, guards, data flow, and tests. Run the smallest read-only or focused check needed to confirm it. Do not report a hypothetical state that types or domain invariants make impossible.

Assign severity:

- `P0`: immediate security, privacy, or data-loss emergency.
- `P1`: blocks release or breaks a critical path.
- `P2`: real defect with bounded impact or credible scale/operations failure.
- `P3`: worthwhile correctness or maintainability issue that can follow.

Each finding must include exact file and line, triggering scenario, impact, evidence, and smallest correct direction. Keep a finding scoped to one fix.

## Report

Lead with findings ordered by severity. Keep Standards and Spec sections separate so one cannot hide the other. Then list assumptions, verification performed, and remaining gaps. If there are no findings, say so explicitly and identify any unverified external behavior.
