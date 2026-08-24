<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Student-specific rules

- Read root `AGENTS.md`, `CONTEXT.md`, and relevant ADRs first.
- The first authenticated session may only complete the required password change until that requirement is satisfied.
- Profile Consent must be explicit; roster import and Account activation never imply public visibility.
- One Submitter can edit a Work. Contributors only accept attribution and never gain edit rights.
- Distinguish Published Revision, current draft, pending Review, and Change Request in state and copy.
- Place upload controls, forms, and notifications behind the smallest possible client boundary.
