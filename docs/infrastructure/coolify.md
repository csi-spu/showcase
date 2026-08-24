# Coolify setup

## Resource layout

Create two environments, `staging` and `production`. Each contains four Docker Image applications:

| App     | Image name                         | Container port | Health path        |
| ------- | ---------------------------------- | -------------: | ------------------ |
| core    | `ghcr.io/csi-spu/showcase-core`    |           4100 | `/v1/health/ready` |
| admin   | `ghcr.io/csi-spu/showcase-admin`   |           3001 | `/health`          |
| student | `ghcr.io/csi-spu/showcase-student` |           3002 | `/health`          |
| visitor | `ghcr.io/csi-spu/showcase-visitor` |           3000 | `/health`          |

Give Coolify read-only GHCR access. Configure an initial valid SHA tag before first start. Do not connect these applications to a Git source or enable automatic deploy.

## Domains

Use one hostname per application in each environment. Production shape:

- Visitor: apex or public showcase hostname
- Admin: `admin.<domain>`
- Student: `student.<domain>`
- Core: `core.<domain>`

Staging uses isolated hostnames and must not share authentication cookies with production. Force HTTPS. Core CORS origins list exact Admin, Student, and Visitor origins without wildcard credentials.

## Runtime settings

- Set application ports and health checks from the table.
- Enable start-before-stop rolling updates when the host has capacity.
- Give readiness enough start period for framework boot but keep a bounded deployment timeout.
- Set CPU and memory limits per app; measure before increasing.
- Keep container filesystem ephemeral. Persist metadata in Supabase and objects in R2.
- Configure restarts for process failure, not application-level retry loops.

Core needs `APP_ENV`, `NODE_ENV=production`, `PORT=4100`, exact `CORS_ALLOWED_ORIGINS` and `STUDENT_ORIGIN`, `DATABASE_URL`, `AUTH_IDENTITY_SECRET`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_AUTH_TIMEOUT_MS`. Frontends need runtime `CORE_URL` for their environment.

Before routing traffic to a new environment, set the singleton `academic_settings.current_academic_year` through an authorized database operation. Core readiness stays down while this value is missing; migrations intentionally do not guess an environment's current academic year.

## GitHub wiring

Copy each Coolify application UUID into the repository variable documented in `secrets.md`. Create one least-privilege Coolify API token per environment when supported; store it only in the matching GitHub Environment.

First deployment validation:

1. Leave `COOLIFY_STAGING_ENABLED` absent and push the initial harness commit to `main`.
2. Confirm successful CI builds four GHCR images with the same full SHA tag and skips deployment.
3. Finish staging applications, UUID variables, environment secrets, domains, and runtime configuration.
4. Set `COOLIFY_STAGING_ENABLED=true` and manually run `Deploy staging` with the full SHA.
5. Confirm staging Core becomes healthy before frontends deploy.
6. Confirm every public health endpoint returns 200 over HTTPS.
7. Trigger production with that full SHA and approve the protected Environment.
8. Confirm Coolify shows the exact same image tags in both environments.

## Host access

Normal operators use Coolify and GitHub Actions. Direct host access is break-glass only, audited, and never part of a deployment. Any emergency host change must be reconciled back to Coolify or Git before the next deploy.
