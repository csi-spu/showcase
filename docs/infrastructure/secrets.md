# Secrets and configuration

## Ownership

A value has one authoritative home.

| Tier                                         | Stores                                     | Must not store                   |
| -------------------------------------------- | ------------------------------------------ | -------------------------------- |
| GitHub repository variables                  | non-secret Coolify application UUIDs       | tokens, provider credentials     |
| GitHub `staging` / `production` Environments | deployment-control credentials             | application runtime secrets      |
| Coolify application environment              | runtime configuration and provider secrets | GitHub token, source credentials |
| Developer ignored env files                  | local-only values                          | shared production credentials    |

Never commit real credentials, print them in CI, include them in Docker build arguments, or paste them into issues.

## GitHub configuration

Each GitHub Environment contains secrets named:

- `COOLIFY_URL`
- `COOLIFY_TOKEN`

Repository variables identify applications:

- `COOLIFY_STAGING_ENABLED`, exact value `true` only after staging provisioning is complete
- `COOLIFY_STAGING_CORE`, `COOLIFY_STAGING_CACHE_WORKER`, `COOLIFY_STAGING_MEDIA_PROCESSOR`, `COOLIFY_STAGING_ADMIN`, `COOLIFY_STAGING_STUDENT`, `COOLIFY_STAGING_VISITOR`, `COOLIFY_STAGING_MEDIA`
- `COOLIFY_PRODUCTION_CORE`, `COOLIFY_PRODUCTION_CACHE_WORKER`, `COOLIFY_PRODUCTION_MEDIA_PROCESSOR`, `COOLIFY_PRODUCTION_ADMIN`, `COOLIFY_PRODUCTION_STUDENT`, `COOLIFY_PRODUCTION_VISITOR`, `COOLIFY_PRODUCTION_MEDIA`

Protect the `production` Environment with required reviewers and restrict it to `main`. Leave `COOLIFY_STAGING_ENABLED` absent while provisioning; staging may deploy automatically after CI succeeds on `main` only after the variable is set to `true`.

## Core runtime configuration

Current required keys:

- `APP_ENV`
- `ADMIN_BFF_SECRET`, an environment-specific high-entropy secret shared only with the Admin server runtime
- `AUTH_IDENTITY_SECRET`, an environment-specific high-entropy HMAC secret for private Student ID and Admin login derivation
- `CATALOG_CURSOR_SECRET`, an environment-specific high-entropy HMAC secret for integrity-protected Public Catalog cursors
- `CLOUDFLARE_API_TOKEN`, a zone-scoped token with only Cache Purge permission
- `CLOUDFLARE_ZONE_ID`, the Cloudflare zone containing Core and Visitor public hostnames
- `CORS_ALLOWED_ORIGINS`
- `DATABASE_URL`, the self-hosted Postgres connection used only by Core
- `BETTER_AUTH_BASE_URL`, the internal Core origin used by headless BetterAuth
- `BETTER_AUTH_SECRET`, an environment-specific BetterAuth signing secret
- `GIT_SHA`, baked into the image by CI
- `NODE_ENV`
- `PORT`
- `PUBLIC_MEDIA_ORIGIN`, the controlled origin that serves sanitized eligible media only
- `MEDIA_SERVICE_URL`, the private storage-service origin used only by Core
- `MEDIA_SERVICE_HMAC_SECRET`, an environment-specific signing secret shared by Core and media
- `STUDENT_BFF_SECRET`, an environment-specific high-entropy secret shared only with the Student server runtime
- `VISITOR_CACHE_SECRET`, an environment-specific high-entropy secret shared only with the Visitor cache-revalidation endpoint
- `VISITOR_BFF_SECRET`, an environment-specific high-entropy secret used by Visitor to authenticate opaque source keys for public mutation rate limits
- `VISITOR_URL`, the exact public Visitor origin used by the cache invalidation worker

The media-service secret allows only signed object read, write, and delete operations. Signed URLs are operation- and key-scoped, short-lived, and never logged. Postgres and media backups receive the same access control and retention as production data.

Admin receives `CORE_URL` and the matching `ADMIN_BFF_SECRET` at container runtime. Admin authentication reaches Core only through Next.js Server Actions. The secret must never use a `NEXT_PUBLIC_` prefix or enter browser bundles.

Student receives `CORE_URL` and the matching `STUDENT_BFF_SECRET` at container runtime. The secret must differ between staging and production and rotate on both Core and Student as one change. Any variable beginning `NEXT_PUBLIC_` is public and build-time sensitive; adding one requires an ADR-level review because release artifacts are promoted unchanged.

Visitor receives `CORE_URL` and matching `VISITOR_BFF_SECRET` and `VISITOR_CACHE_SECRET` values at container runtime. Rotate either shared secret on Core and Visitor together. Visitor sends `VISITOR_BFF_SECRET` only to the same-environment HTTPS Core origin; neither secret enters browser code or logs. `VISITOR_BFF_SECRET` authenticates only an HMAC source key, never a raw address.

Provision an Admin from an authorized Core container after migrations are current:

```sh
pnpm --filter @showcase/core admin:provision -- <admin-login>
```

The command displays the random temporary password once. Transfer it through the approved private channel, do not record it in tickets or logs, and require the Admin to replace it on first sign-in.

## Rotation

1. Create the replacement credential with least privilege.
2. Update every affected Coolify environment without deleting the old credential yet.
3. restart or deploy the affected application and verify readiness plus a provider operation.
4. Revoke the old credential.
5. Record operator, time, affected environments, and verification in the private operations log.

If a secret may have entered Git history or logs, revoke first. Rewriting Git history is not a substitute for revocation.
