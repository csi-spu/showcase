# Agent skill catalog

Repository-local skills encode the Student Showcase workflow and override generic workflow assumptions when they are more specific. Their source lives under `.agents/skills/<name>/SKILL.md`.

Run `pnpm skills:check` after editing a skill and `pnpm skills:test` after changing the validator. CI runs both.

## Choose one entry point

| Need                                                        | Skill                            | Durable result                                   |
| ----------------------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| Challenge an unsettled plan one decision at a time          | `$grill-with-docs`               | Updated domain, product, rule, or ADR docs       |
| Resolve terminology, relationships, or invariants           | `$domain-modeling`               | Updated `CONTEXT.md` or ADR                      |
| Verify version-specific external facts                      | `$research`                      | Cited `docs/research/` note when requested       |
| Decide logic or UI through a disposable artifact            | `$prototype`                     | Prototype branch plus recorded decision          |
| Turn settled context into implementation-ready requirements | `$to-spec`                       | Draft or authorized GitHub spec issue            |
| Split an approved spec into vertical slices                 | `$to-tickets`                    | Draft or authorized GitHub implementation issues |
| Deliver an approved spec or ticket                          | `$implement`                     | Production code, migrations, tests, and docs     |
| Build one behavior test-first                               | `$tdd`                           | Focused red-green-refactor slices                |
| Diagnose a failure or regression                            | `$diagnosing-bugs`               | Reproduction, root cause, and authorized fix     |
| Review changes against standards and requirements           | `$code-review`                   | Severity-ranked Standards and Spec findings      |
| Design a module interface or seam                           | `$codebase-design`               | Compared alternatives and recommended interface  |
| Find high-leverage architecture improvements                | `$improve-codebase-architecture` | Evidence-backed audit and selected design path   |
| Map uncertain work spanning multiple sessions               | `$wayfinder`                     | GitHub decision map leading to a spec            |
| Transfer unfinished work to a fresh session                 | `$handoff`                       | Redacted temporary continuation brief            |

## Technology guardrails

| Need                                                              | Skill                               |
| ----------------------------------------------------------------- | ----------------------------------- |
| Implement or diagnose Supabase provider integration/configuration | `$supabase`                         |
| Change or review Postgres schema, SQL, or tuning                  | `$supabase-postgres-best-practices` |

## Normal paths

Feature with settled behavior:

```text
to-spec -> to-tickets (when needed) -> implement + tdd -> code-review
```

Feature with unsettled behavior:

```text
grill-with-docs/domain-modeling -> research or prototype (when needed) -> to-spec
```

Bug:

```text
diagnosing-bugs -> regression test -> authorized fix -> code-review
```

Architecture change:

```text
improve-codebase-architecture -> codebase-design -> domain-modeling/ADR -> to-spec
```

## Authority and tracker

Invoking a skill does not authorize external mutation. Follow `docs/agents/issue-tracker.md` for GitHub operations and use `rtk gh` only. Draft before publishing unless the user explicitly requested publication. Commit, push, pull request, deployment, and provider changes require matching user authority.

The one-time repository setup skill from the Baan reference is intentionally not copied: Showcase already has the resulting `AGENTS.md` block and `docs/agents/` configuration. Keeping a setup skill after setup would create a second path capable of overwriting repository-specific rules.

## Context and discovery budget

Reuse instructions and source sections already loaded unless they changed. Read domain definitions for domain decisions, ADRs for affected architectural boundaries, and tracker instructions for tracker work. A short, defined change does not require a new spec or ticket chain.

Keep descriptions focused on capability and invocation conditions. `skills:check` warns above 200 characters as a repository review heuristic, not an OpenAI limit; warnings do not fail validation. Move workflow detail into the body, and split substantial conditional workflows into references. Preserve privacy, authorization, migrations, and affected verification requirements for every supported model.

Use [routing scenarios](skill-routing-scenarios.md) to evaluate overlapping triggers and stopping behavior. Structural validation cannot prove routing quality or faster execution. Compare the same tasks and model configuration before and after changes, recording loaded skills/docs, task completion, quality, latency, and token usage where available.
