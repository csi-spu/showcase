---
name: supabase
description: Implement or diagnose Supabase provider integrations, configuration, or CLI workflows. Use the Postgres skill for SQL and schema rules.
---

# Supabase

Core owns Showcase data and authentication; browser apps never query Supabase tables directly. Follow repository authorization and migration rules. This skill grants no permission to modify a remote database or provider configuration.

Verify provider behavior against current official docs matching the installed version. Use MCP `search_docs` when available, otherwise fetch the relevant official page as Markdown or search official docs. Consult the [changelog](https://supabase.com/changelog.md) when version changes or compatibility are relevant.

## Read only the relevant reference

- Auth, RLS, views, storage, data exposure, or SDK dependency changes: [security.md](references/security.md).
- Supabase CLI operations: [cli.md](references/cli.md).
- MCP setup or connection failures: [mcp.md](references/mcp.md).
- Schema changes: [migrations.md](references/migrations.md) and applicable rules from `$supabase-postgres-best-practices`.
- Provider failures or unexpected behavior: [debugging.md](references/debugging.md).
- Reported incorrect skill guidance: [skill-feedback.md](references/skill-feedback.md).

Verify changed behavior with the affected local test or query. Never substitute a live provider mutation for a local check without authorization. If repeated attempts produce no new evidence, reconsider the hypothesis using relevant errors, docs, and sanitized logs.
