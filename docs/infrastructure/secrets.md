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
- `COOLIFY_STAGING_CORE`, `COOLIFY_STAGING_ADMIN`, `COOLIFY_STAGING_STUDENT`, `COOLIFY_STAGING_VISITOR`
- `COOLIFY_PRODUCTION_CORE`, `COOLIFY_PRODUCTION_ADMIN`, `COOLIFY_PRODUCTION_STUDENT`, `COOLIFY_PRODUCTION_VISITOR`

Protect the `production` Environment with required reviewers and restrict it to `main`. Leave `COOLIFY_STAGING_ENABLED` absent while provisioning; staging may deploy automatically after CI succeeds on `main` only after the variable is set to `true`.

## Core runtime configuration

Current required keys:

- `APP_ENV`
- `AUTH_IDENTITY_SECRET`, an environment-specific high-entropy HMAC secret for private Student identity derivation
- `CORS_ALLOWED_ORIGINS`
- `DATABASE_URL`, the pooled Supabase Postgres connection used only by Core
- `GIT_SHA`, baked into the image by CI
- `NODE_ENV`
- `PORT`
- `STUDENT_ORIGIN`, the exact Student browser origin accepted by Student auth mutations
- `SUPABASE_AUTH_TIMEOUT_MS`
- `SUPABASE_PUBLISHABLE_KEY`, used by Core for Supabase Auth password and refresh grants
- `SUPABASE_URL`

R2 adapters will add validated keys in the implementation change that introduces them. Supabase service-role access is not required for runtime Student login and must not be added to Core until an authorized provisioning use case needs it.

Frontends receive `CORE_URL` at container runtime. Any variable beginning `NEXT_PUBLIC_` is public and build-time sensitive; adding one requires an ADR-level review because release artifacts are promoted unchanged.

## Rotation

1. Create the replacement credential with least privilege.
2. Update every affected Coolify environment without deleting the old credential yet.
3. restart or deploy the affected application and verify readiness plus a provider operation.
4. Revoke the old credential.
5. Record operator, time, affected environments, and verification in the private operations log.

If a secret may have entered Git history or logs, revoke first. Rewriting Git history is not a substitute for revocation.
