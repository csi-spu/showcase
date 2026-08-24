# Security

## Trust boundaries

- Browser input, CSV rows, URLs, file metadata, cookies, and provider responses are untrusted.
- Core authenticates the actor and derives actor identity server-side.
- Authorization runs before reads, writes, presign, finalize, archive, review, and publication.
- Public repositories/queries enforce Published Revision and Profile Consent constraints before data leaves persistence.

## Authentication

Student ID is a private login identifier. Core maps it to a private synthetic Supabase Auth identity. Never put Student ID into a public ID, email visible to a user, log, analytics event, client bundle, or object key.

The accepted Phase 1 initial password equals Student ID. This creates first-login takeover risk. Mitigations are mandatory: roster-only provisioning, rate limiting, forced password change as the only first-session capability, generic login errors, audit events, Admin random temporary resets, and session revocation after reset. Do not weaken or remove these mitigations without explicit product confirmation and a security ADR.

Session cookies are Secure and HttpOnly in shared environments. Define SameSite and Domain deliberately for the chosen cross-subdomain flow; do not default to a parent-domain cookie broader than required. Protect state-changing cookie-authenticated requests against CSRF and validate exact Origin.

## Authorization

- Phase 1 roles: Student and Admin. Visitor is unauthenticated state.
- Submitter controls Work editing. Contributor attribution grants no edit capability.
- Admin actions are permission-checked and audited; Admin role does not bypass workflow invariants.
- Account expiry removes Student capabilities but never deletes public attribution.

## Media

Authorize before issuing a presigned URL and again before accepting finalized metadata. Presigns are short-lived, restricted to one object key and operation, and never logged. Object keys use random identifiers and no Student ID. Validate MIME type, extension, byte size, dimensions, and portrait ratio from trusted server-side inspection before publication.

Serve active media through a controlled public origin. Uploaded objects remain private/quarantined until finalize and Review rules permit exposure. Do not accept SVG, HTML, arbitrary embeds, GIF, PDF, or video uploads in Phase 1.

## Data and logs

Collect only required roster fields. Encrypt transport everywhere and use provider encryption at rest. Structured logs contain stable operation/error codes and non-sensitive internal correlation IDs. Redact credentials, cookies, tokens, Student IDs, roster rows, review-private notes, and presigned URLs.

Audit records are append-only through application flows and capture actor, action, target, timestamp, reason where required, and meaningful diff metadata. Audit is not a substitute for authorization.

## Dependencies and delivery

CI uses the frozen lockfile, non-root containers, SBOM, provenance, protected Environments, and immutable tags. Dependabot proposes updates. Review lockfile and action changes as executable supply-chain changes.
