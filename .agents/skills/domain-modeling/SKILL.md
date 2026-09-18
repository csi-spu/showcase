---
name: domain-modeling
description: Resolve ambiguous Showcase domain terms, invariants, or conflicting domain decisions in authoritative docs.
---

# Domain Modeling

Maintain one precise language for product discussion, code, tests, issues, and operations.

## Load authority

Use existing context; consult only sources relevant to the domain question:

1. Root `AGENTS.md` and the nearest app `AGENTS.md` in scope.
2. `CONTEXT.md`.
3. `docs/adr/README.md` and relevant ADRs.
4. The relevant product document or implementation being discussed.

Use `CONTEXT.md` capitalization and avoid-list terms. Do not introduce a synonym when a canonical term already exists.

## Resolve the model

1. Identify the unclear concept, overloaded term, lifecycle, actor, ownership rule, or invariant.
2. State the existing definition and the conflict or missing edge.
3. Test it with concrete scenarios, including authorization, visibility, revision history, archival, expired Student access, and concurrent changes when relevant.
4. Check current code and docs. Surface disagreement instead of choosing silently.
5. Ask one consequential question when user intent is required. Recommend the smallest model consistent with existing invariants.
6. Record the settled result immediately in the narrowest authoritative file.

Protect these established separations unless the user explicitly reopens them:

- `Person`, `Account`, `Public Profile`, and `Student ID` are different concepts.
- `Visitor` is an unauthenticated access state, not a role.
- `Work` persists across immutable reviewed `Revisions`.
- `Submitter` controls revision submission; Submitter-assigned `Contributors` receive attribution without acceptance, not edit rights.
- `Entry Year`, `Study Year`, and `Academic Period` answer different questions.
- Publication, profile consent, account eligibility, archival, and removal are separate state changes.

## Choose the artifact

- Update `CONTEXT.md` for canonical terms, relationships, lifecycle meaning, and invariants. Keep transport, schema, framework, and file-path details out.
- Update `docs/product/` for phase scope, user-visible behavior, acceptance rules, and follow-ups.
- Add an ADR only when a decision is hard to reverse, surprising without context, and based on a real tradeoff.
- Update `docs/rules/` or `docs/infrastructure/` for engineering or operational policy.

Use the compact ADR style indexed by `docs/adr/README.md`. Preserve superseded decisions as history; add a superseding ADR rather than rewriting the old decision.

## Verify and report

- Search changed terminology across docs and code for stale conflicting usage.
- Run formatting only for documentation changed by this skill.
- Report resolved terms, scenarios tested, files changed, and remaining contradictions.
- Do not implement application behavior unless the user separately authorized implementation.
