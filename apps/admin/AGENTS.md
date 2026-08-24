<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Admin-specific rules

- Read root `AGENTS.md`, `CONTEXT.md`, and relevant ADRs first.
- Admin is an audited operational surface, not a privileged shortcut around Core.
- Keep roster errors row-specific and downloadable; do not fail valid rows because other rows are invalid.
- A Change Request requires both a reason and actionable feedback.
- Admin content edits and approve-and-publish are explicit separate actions in UI and API calls.
- Place interactive tables, dialogs, and forms behind the smallest possible client boundary.
