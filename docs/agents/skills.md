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
