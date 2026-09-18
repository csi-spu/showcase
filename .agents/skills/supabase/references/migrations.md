## Making and Committing Schema Changes

First decide which schema workflow the project uses.

### Option A: Declarative schemas

Use this when `supabase/schemas/` exists or `config.toml` sets `schema_paths`. Edit the desired schema state in those files, then generate and review the migration. Do not start by hand-writing a migration. See the [Declarative database schemas guide](https://supabase.com/docs/guides/local-development/declarative-database-schemas).

### Option B: Imperative migrations

Use this when the project does not use declarative schemas.

**To make schema changes, use `execute_sql` (MCP) or `supabase db query` (CLI).** These run SQL directly on the database without creating migration history entries, so you can iterate freely and generate a clean migration when ready.

Do NOT use `apply_migration` to change a local database schema — it writes a migration history entry on every call, which means you can't iterate, and `supabase db diff` / `supabase db pull` will produce empty or conflicting diffs. If you use it, you'll be stuck with whatever SQL you passed on the first try.

**When ready to commit** your changes to a migration file:

1. **Run advisors** → `supabase db advisors` (CLI v2.81.3+) or MCP `get_advisors`. Fix any issues.
2. **Review [security guidance](security.md)** if your changes involve views, functions, triggers, or storage.
3. **Generate the migration** → `supabase db pull <descriptive-name> --local --yes`
4. **Verify** → `supabase migration list --local`
