# ADR 0014: Self-hosted Postgres, authentication, and media

## Status

Accepted for Issue #75.

## Decision

Core runs against one Coolify-managed PostgreSQL instance and uses Prisma Migrate as the schema source of truth. BetterAuth runs headlessly inside Core with its tables in the same Prisma schema. Core continues to own opaque session tokens, audience binding, cookie behavior, forced-password state, and authorization; BetterAuth never writes cookies to frontend responses.

Work and profile media use a dedicated Coolify-managed storage service with an attached persistent volume. Core issues HMAC-signed operation URLs. The service validates method, object key, expiry, and signature; `media.<domain>` is Cloudflare-proxied for public caching. Core remains stateless.

The existing provider ports remain unchanged. Supabase Auth/Postgres and Cloudflare R2 adapters and credentials are removed from runtime configuration. Quarantine cleanup is performed by the media processor (bounded, alerted) rather than a provider lifecycle rule.

## Consequences

This removes managed-provider dependency and keeps horizontal Core scaling. Postgres and media are single-instance resources, so backups and restore drills are mandatory operational controls; HA and failover are deferred. BetterAuth API calls are server-only and their headers are deliberately not forwarded by Core.

## Supersedes

This ADR supersedes the provider-specific deployment details in ADR 0001 and ADR 0004. Their domain/session and media invariants remain in force.
