<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Visitor-specific rules

- Read root `AGENTS.md`, `CONTEXT.md`, and relevant ADRs first.
- Only approved Published Revisions and consented Public Profiles may enter a response or cache.
- Design public reads for cacheability, pagination, bounded filtering, and stable canonical URLs.
- Never add Phase 2 authentication, Star, or Comment UI as a non-functional placeholder.
- Prefer Server Components; isolate filter controls and other interactions into small client components.
