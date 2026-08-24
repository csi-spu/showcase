# Security

## Trust boundaries

- Browser input, CSV rows, URLs, file metadata, cookies, and provider responses are untrusted.
- Core authenticates the actor and derives actor identity server-side.
- Authorization runs before reads, writes, presign, finalize, archive, review, and publication.
- Public repositories/queries enforce Published Revision and Profile Consent constraints before data leaves persistence.

## Authentication

Student ID is a private login identifier. Core maps it to a private synthetic Supabase Auth identity. Never put Student ID into a public ID, email visible to a user, log, analytics event, client bundle, or object key.

The accepted Phase 1 initial password equals Student ID. This creates first-login takeover risk. Mitigations are mandatory: roster-only provisioning, rate limiting, forced password change as the only first-session capability, generic login errors, audit events, Admin random temporary resets, and session revocation after reset. A chosen password is 12 to 128 characters, differs from Student ID and the current or temporary password, and has no composition rule that rejects passphrases. Do not weaken or remove these mitigations without explicit product confirmation and a security ADR.

Core owns authoritative opaque sessions and keeps provider credentials out of browser-readable storage. Admin and Student use separate audience-bound, host-only cookies on their matching frontend hostname with `Secure`, `HttpOnly`, and `SameSite=Lax` in shared environments; never put an authentication cookie on Core or a parent domain. Each frontend BFF forwards the opaque session token to Core over a server-only channel authenticated by an environment-specific BFF secret. Student sessions have a 24-hour inactivity and 7-day absolute limit. Admin sessions have a 30-minute inactivity and 8-hour absolute limit.

Authenticated reads use React Server Components and mutations use Server Actions. Treat every Server Action as a public endpoint: validate untrusted input, rely on Next.js Origin-to-Host validation, and authorize again in Core. Browsers never call internal Core authentication endpoints directly. BFF secrets, session tokens, provider credentials, and cookies must not enter client bundles, action return values, logs, or `NEXT_PUBLIC_` variables.

Password change and Admin password reset revoke all older sessions for the Account. A reset secret is random, displayed to the authorized Admin once, never logged, and restricts the next session to password change. Admin Accounts are created only through an audited operational flow; public signup, self-service recovery, and Admin MFA are outside Phase 1.

## Authorization

- Phase 1 roles: Student and Admin. Visitor is unauthenticated state.
- Submitter controls Work editing. Contributor attribution grants no edit capability.
- Admin actions are permission-checked and audited; Admin role does not bypass workflow invariants.
- Account expiry removes Student capabilities but never deletes public attribution.

## Media

Authorize before issuing a presigned URL and again before accepting finalized metadata. Presigns are short-lived, restricted to one object key and operation, and never logged. Object keys use random identifiers and no Student ID. Validate MIME type, extension, byte size, dimensions, and portrait ratio from trusted server-side inspection before publication.

Serve active media through a controlled public origin. Uploaded objects remain private/quarantined until an isolated, resource-bounded processor decodes, auto-orients, validates, strips metadata, converts to sRGB, and rewrites them. Store only the sanitized master and generated variants permanently; delete raw quarantine objects after success. Do not accept SVG, HTML, arbitrary embeds, GIF, animated WebP/APNG, PDF, or video uploads in Phase 1.

Use application cleanup plus prefix-scoped R2 lifecycle rules for quarantine and unattached objects. Lifecycle deletion is a backstop, not the authorization boundary. Media attached to retained Revisions remains stored, but only media referenced by the current Published Revision of an active, published Work is publicly eligible.

## External Contributor invitations

External Contributor links and recovery codes are bearer secrets, not Accounts. Generate high-entropy values, persist only their hashes, expire invitations after 14 days, exchange them only for short-lived HttpOnly invitation sessions, suppress referrers, and never log them or place them in analytics. Display a recovery code once after acceptance so the External Contributor can later request attribution removal; lost-code recovery requires an Admin. Acceptance grants only the recorded public attribution and no authenticated application capability.

## Public cache and Notifications

Apply publication and Profile Consent filters before a response reaches a shared cache. Public cache keys never vary on an Authentication Session or reuse a private endpoint namespace. Free-text search, high-cardinality cursor/filter combinations, Notifications, and unread counts use `no-store`. Visibility removal changes the authoritative Core projection in the domain transaction and dispatches durable, retryable cache-purge intent; monitor bounded propagation because CDN invalidation is not atomic with the database.

Notifications are private, audience-authorized records. Store structured types and safe parameters rather than credentials, bearer secrets, Student IDs, sensitive Roster data, full Review feedback, or arbitrary target URLs. Re-authorize the target when opened; possession of a Notification never grants access.

## Data and logs

Collect only required roster fields. Encrypt transport everywhere and use provider encryption at rest. Structured logs contain stable operation/error codes and non-sensitive internal correlation IDs. Redact credentials, cookies, tokens, Student IDs, roster rows, review-private notes, and presigned URLs.

Audit records are append-only through application flows and capture actor, action, target, timestamp, reason where required, and meaningful diff metadata. Audit is not a substitute for authorization.

## Dependencies and delivery

CI uses the frozen lockfile, non-root containers, SBOM, provenance, protected Environments, and immutable tags. Dependabot proposes updates. Review lockfile and action changes as executable supply-chain changes.
