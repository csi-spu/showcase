# Domain docs

This repository has one Student Showcase context shared by Admin, Student, Visitor, and Core surfaces.

## Before exploring

1. Read root `CONTEXT.md` for canonical domain language.
2. Read ADRs in `docs/adr/` that touch the area being changed.
3. Read the nearest app/package `AGENTS.md` for local implementation rules.

Do not create `CONTEXT-MAP.md` or per-app contexts unless the system later develops genuinely independent bounded contexts.

## Use canonical language

Use terms from `CONTEXT.md` in code, tests, issues, documentation, and UI copy. Avoid synonyms explicitly listed under `_Avoid_`.

If a required concept is missing, reconsider whether it is implementation language. If it is a real domain concept, resolve it through `grill-with-docs` and update the glossary before spreading a new term.

## Architectural decisions

ADRs live in root `docs/adr/` and apply repository-wide. Surface conflicts explicitly instead of silently overriding them:

> Contradicts ADR-0001 (route data and authentication through Core); reopen the decision before implementing direct browser database access.

Create an ADR only when the decision is expensive to reverse, surprising without context, and the result of a genuine trade-off.
