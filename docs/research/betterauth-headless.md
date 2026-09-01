# Question

Can the current Better Auth release provide the credential and provisioning operations needed by Core while remaining an internal, headless engine, preserving Core's opaque-token response contract and preventing Better Auth cookies from reaching a frontend BFF?

Scope: Better Auth 1.7.2 and its Prisma adapter, PostgreSQL-backed deployment, provision-only account creation, password verification/change, UUID identity compatibility, and server-side API response handling. Evidence is required before production adapter work; a result that requires browser-facing Better Auth routes or provider-owned cookies would invalidate the design.

## Conclusion

Yes, with an explicit internal boundary. Better Auth 1.7.2 can persist credential accounts through its Prisma adapter, can disable email/password sign-up, and can be called through `auth.api` server methods. Core must call those methods without forwarding returned headers or `Response` objects. For roster/admin provisioning, the prototype demonstrates the supported engine's internal adapter can create a verified user and credential account without invoking public sign-up. Better Auth's UUID ID strategy matches the existing `provider_user_id` type.

The production adapter should treat Better Auth's session token as an internal provider artifact only if the existing `AuthProvider` port requires it; Core's `AuthenticationSessionRecord` remains authoritative. Better Auth's `signInEmail` creates a Better Auth session and prepares a cookie header, so the adapter must either isolate and revoke that provider session or use the internal password verifier plus Core-generated provider-token placeholders. This choice requires a persistence integration test and must never forward `Set-Cookie`.

## Findings

- Fact: The current Better Auth docs list 1.7.2 as the latest version and expose server-side `auth.api` methods. A direct call returns a JavaScript value; callers can opt into `{ returnHeaders: true }` or `{ asResponse: true }` when they explicitly need response headers or a `Response`. [Better Auth API](https://better-auth.com/docs/concepts/api) (accessed 2026-09-01).
- Fact: `signInEmail` verifies the credential account, creates a session, calls the session-cookie writer, and returns a token/user payload. Thus an internal call has provider session and cookie side effects even when Core discards the returned headers. [Better Auth email/password](https://better-auth.com/docs/authentication/email-password) (accessed 2026-09-01); verified against the 1.7.2 package implementation in the prototype.
- Fact: Better Auth exposes server-only `verifyPassword`; its admin plugin exposes `setUserPassword`, and the internal adapter exposes server-side user/account creation. [Better Auth user and accounts](https://better-auth.com/docs/concepts/users-accounts) (accessed 2026-09-01); [Better Auth Admin](https://better-auth.com/docs/plugins/admin) (accessed 2026-09-01).
- Fact: `emailAndPassword.disableSignUp` disables email/password sign-up. [Better Auth options](https://better-auth.com/docs/reference/options) (accessed 2026-09-01).
- Fact: Better Auth supports a Prisma adapter and its CLI can generate the Better Auth Prisma schema, but the CLI does not perform Prisma migrations; the generated schema must be merged with the domain schema and migrated through Prisma. [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma) (accessed 2026-09-01); [Better Auth CLI](https://better-auth.com/docs/concepts/cli) (accessed 2026-09-01).
- Fact: Better Auth supports UUID IDs with `advanced.database.generateId: "uuid"`; PostgreSQL is explicitly covered. [Better Auth database](https://better-auth.com/docs/concepts/database) (accessed 2026-09-01).
- Fact: Better Auth's Prisma documentation currently recommends `@better-auth/prisma-adapter`, while importing `prismaAdapter` from `better-auth/adapters/prisma`; package/version compatibility must be pinned and checked during installation. [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma) (accessed 2026-09-01).

## Showcase implications

- Keep `AuthProvider`, `AdminProvisioningProvider`, and `StudentIdentityProvider` unchanged. Instantiate one Better Auth server object inside Core with an explicit base URL, secret, Prisma adapter, UUID IDs, `emailAndPassword.enabled: true`, and `emailAndPassword.disableSignUp: true`.
- Do not mount Better Auth's browser routes or use its framework cookie integration. Core controllers continue to return the existing opaque session token JSON and frontend BFFs continue to own host-only cookies.
- Do not use Better Auth user metadata or role fields for Showcase authorization. Core's account, role, audience, consent, forced-change, and access checks remain authoritative in the existing repositories and guards.
- Add adapter tests that assert both valid/invalid credentials and that any `Set-Cookie` in Better Auth's internal response headers is not copied to the Nest response. Add tests for idempotent roster/admin provisioning and provider identity mismatch.
- Use a Prisma migration for Better Auth's `user`, `session`, `account`, and `verification` tables in the same PostgreSQL database. Preserve private schemas and avoid Prisma query logging of parameter values in production.

## Unknowns and verification plan

- The exact Prisma 7 client construction and `@better-auth/prisma-adapter` peer requirements must be verified against the repository's Node/TypeScript toolchain before dependency changes.
- The existing `AuthProvider` port requires `accessToken`, `refreshToken`, expiry, and revoke/refresh operations. Better Auth's server-side credential verifier does not naturally expose Supabase-style refresh tokens. Decide whether to wrap Better Auth sessions with an internal provider-token lifecycle or alter only adapter internals while preserving the port; prove the choice with auth service integration tests.
- Better Auth's `signInEmail` session creation must not accumulate unbounded orphan provider sessions. If the adapter uses `signInEmail`, revoke/delete the created Better Auth session deterministically; otherwise call the internal credential verifier and keep provider token fields opaque and non-authoritative.
- Run the prototype command from the dedicated branch: `npm run smoke` in `prototypes/betterauth-headless`. It uses synthetic data and an in-memory adapter only; it is not a production recommendation and must not be merged.

## Sources

- [Better Auth API](https://better-auth.com/docs/concepts/api)
- [Better Auth email/password](https://better-auth.com/docs/authentication/email-password)
- [Better Auth user and accounts](https://better-auth.com/docs/concepts/users-accounts)
- [Better Auth Admin plugin](https://better-auth.com/docs/plugins/admin)
- [Better Auth options reference](https://better-auth.com/docs/reference/options)
- [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)
- [Better Auth CLI](https://better-auth.com/docs/concepts/cli)
- [Better Auth database](https://better-auth.com/docs/concepts/database)
