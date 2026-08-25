# Architecture

## System boundary

```mermaid
flowchart LR
  Visitor[Visitor Next.js] --> Core[NestJS Core]
  Admin[Admin Next.js BFF] --> Core
  Student[Student Next.js BFF] --> Core
  Core --> Auth[Supabase Auth]
  Core --> DB[Supabase Postgres]
  Core --> R2[Cloudflare R2]
  Student -. authorized presigned PUT .-> R2
  Visitor -. cacheable media GET .-> R2
```

Core is the authoritative domain API and authentication service. Authenticated Next.js frontends are browser-facing BFFs: Server Components perform reads, Server Actions perform mutations, and host-only cookies never leave their frontend hostname. Frontends do not own domain authorization or query Supabase tables. The only direct browser-to-provider traffic is an R2 operation authorized by a short-lived, operation-specific presigned URL from Core.

## Deployable surfaces

Each `apps/*` workspace is independently deployable, health-checked, and horizontally scalable. Services do not rely on local disk or in-memory session affinity. Coolify routes four subdomains to four containers.

| Surface | Public exposure                                 | Stateful dependency | Health                                |
| ------- | ----------------------------------------------- | ------------------- | ------------------------------------- |
| Visitor | internet                                        | Core                | `/health`                             |
| Admin   | internet, authentication required               | Core                | `/health`                             |
| Student | internet, authentication required               | Core                | `/health`                             |
| Core    | internal endpoints plus controlled public reads | Supabase, R2        | `/v1/health/live`, `/v1/health/ready` |

## Authentication flow

1. Student submits Student ID and password to a Student Server Action over TLS.
2. The Student BFF validates input and calls a BFF-authenticated internal Core endpoint.
3. Core maps Student ID to a private synthetic Supabase Auth identity and creates the authoritative session.
4. The Student BFF stores only the opaque session token in a Secure, HttpOnly, host-only cookie on the Student hostname.
5. Subsequent Server Components and Server Actions forward that token to Core; Core guards resolve Account and role from current server-owned state. Request bodies never choose actor identity.
6. A newly provisioned Account remains restricted to password change until the forced-change requirement is cleared.

Admin uses the same Core/Supabase boundary. Public profile identifiers are random and unrelated to Student ID or Supabase identity IDs.

## Work publication model

A Work is the stable aggregate. Revisions are immutable review candidates. Approval advances the Published Revision pointer atomically; it does not overwrite history. If an approved Work is edited, the old Published Revision remains visible while the new Revision is reviewed.

Contributor attribution is invitation-based. The Submitter alone edits and submits. Study Year is recorded on each Work attribution because it describes historical contribution, not current Student state.

## Scale assumptions

- Cursor pagination for unbounded public and admin collections.
- Database indexes follow real filter and ordering paths; migrations include query-plan evidence for high-volume paths.
- Public catalog responses and media are cacheable only after publication and consent filters.
- Search starts with indexed Postgres capabilities; introduce a separate search system only after measured need.
- Services remain stateless so Coolify can add replicas behind the same route.
- Background work must be idempotent and observable before it is moved out of request handling. Core records cache invalidation and Notification delivery intent in a durable outbox with the authoritative domain transition, then dispatches retry-safe derived effects asynchronously.

## Architecture changes

Cross-boundary decisions require an ADR. Domain vocabulary changes update `CONTEXT.md` in the same pull request.
