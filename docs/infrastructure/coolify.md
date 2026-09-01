# Coolify setup

## Resource layout

Create two environments, `staging` and `production`. Each contains these Docker Image applications and workers:

| App                  | Image name                         | Container port | Health path        |
| -------------------- | ---------------------------------- | -------------: | ------------------ |
| core                 | `ghcr.io/csi-spu/showcase-core`    |           4100 | `/v1/health/ready` |
| core-media-processor | `ghcr.io/csi-spu/showcase-core`    |            n/a | n/a                |
| core-cache-worker    | `ghcr.io/csi-spu/showcase-core`    |            n/a | n/a                |
| admin                | `ghcr.io/csi-spu/showcase-admin`   |           3001 | `/health`          |
| student              | `ghcr.io/csi-spu/showcase-student` |           3002 | `/health`          |
| visitor              | `ghcr.io/csi-spu/showcase-visitor` |           3000 | `/health`          |
| media                | `ghcr.io/csi-spu/showcase-media`   |           4191 | `/health`          |

Give Coolify read-only GHCR access. Configure an initial valid SHA tag before first start. Do not connect these applications to a Git source or enable automatic deploy.

## Domains

Use one hostname per application in each environment. Production shape:

- Visitor: apex or public showcase hostname
- Admin: `admin.<domain>`
- Student: `student.<domain>`
- Core: `core.<domain>`
- Media: `media.<domain>`

Staging uses isolated hostnames and must not share authentication cookies or BFF secrets with production. Force HTTPS. Route Core internal authentication endpoints only where the frontend containers can reach them; the BFF secret remains mandatory even on a private network.

## Runtime settings

- Set application ports and health checks from the table.
- Enable start-before-stop rolling updates when the host has capacity.
- Issue #56 uses a controlled blue-green Core cutover rather than a normal rolling replacement; follow `docs/runbooks/issue-56-student-workspace-cutover.md` before routing the new containers.
- Keep Visitor reachable only through the managed edge proxy. The proxy must append the connection address as the right-most `X-Forwarded-For` hop; Visitor ignores client-prepended hops and fails closed to a shared rate-limit bucket when the trusted hop is absent.
- Give readiness enough start period for framework boot but keep a bounded deployment timeout.
- Set CPU and memory limits per app; measure before increasing.
- Keep Core and frontend container filesystems ephemeral. Postgres and media are the two explicit stateful exceptions, each with an attached volume and automated backup.
- Mount the media volume at `/data`. Docker-managed empty volumes inherit the image's `node` ownership; pre-provision host bind mounts as UID/GID `1000:1000`. Verify the running media container can create and remove a test file in `/data` before routing uploads.
- Configure restarts for process failure, not application-level retry loops.

Core needs `APP_ENV`, `NODE_ENV=production`, `PORT=4100`, exact `CORS_ALLOWED_ORIGINS`, `DATABASE_URL`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_SECRET`, `ADMIN_BFF_SECRET`, `AUTH_IDENTITY_SECRET`, `CATALOG_CURSOR_SECRET`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `PUBLIC_MEDIA_ORIGIN`, `MEDIA_SERVICE_URL`, `MEDIA_SERVICE_HMAC_SECRET`, `STUDENT_BFF_SECRET`, `VISITOR_BFF_SECRET`, `VISITOR_CACHE_SECRET`, and `VISITOR_URL`. Admin needs runtime `CORE_URL` and the same environment's `ADMIN_BFF_SECRET`. Student needs runtime `CORE_URL`, `VISITOR_URL`, and the same environment's `STUDENT_BFF_SECRET`. Visitor needs runtime `CORE_URL` and the same environment's `VISITOR_BFF_SECRET` and `VISITOR_CACHE_SECRET`. Keep these values server-only; never prefix them with `NEXT_PUBLIC_`.

Create a fifth non-HTTP Coolify resource from the exact Core image. It runs `node dist/modules/works/commands/process-work-media.js` on a one-minute schedule, shares Core's database and media-service environment values, and exits after at most 20 processing or cleanup jobs. Limit it to one CPU and 512 MiB memory; Sharp itself uses one worker, a 64 MiB cache, bounded decoded pixels, and a 15-second operation timeout. Concurrent runs are safe because processing and cleanup claims use leased rows with `FOR UPDATE SKIP LOCKED`.

Create a sixth non-HTTP Coolify resource from the exact Core image. It runs `node dist/modules/catalog/commands/process-cache-invalidations.js` continuously, uses the Core database plus Cloudflare/Visitor cache values, and restarts on failure. The worker polls idle state once per second, coalesces up to four events per purge, spaces provider calls by 12 seconds to respect the lowest Cloudflare plan limit, leases each durable delivery for 30 seconds, retries at bounded backoff up to eight attempts, and is horizontally safe through `FOR UPDATE SKIP LOCKED`. Run one worker per environment so aggregate provider calls retain that rate bound. Alert when pending lag exceeds 30 seconds or a delivery reaches `failed`; run `private.reconcile_public_cache_invalidations()` during reconciliation to restore missing derived jobs without duplicating completed deliveries.

Configure Cloudflare to cache eligible Core API and Visitor HTML responses using their origin `Cache-Control`, retain the origin `Cache-Tag` values, and keep private/no-store routes out of shared cache. The cache worker expires matching Next.js data/path cache first and then calls Cloudflare's zone cache-purge API by tag. Media remains capped at five minutes without `stale-if-error`; HTML/API remains capped at two minutes if purge delivery is delayed.

Visitor samples one percent of LCP, CLS, and INP observations without public identifiers, URLs, Account data, or Student IDs. Aggregate structured `public_web_vital_recorded` logs by `page` and `device` over a rolling 28-day window and alert when p75 exceeds LCP 2.5 seconds, CLS 0.1, or INP 200 milliseconds. Apply a bounded Cloudflare rate limit to `/api/metrics/web-vitals`; rejected telemetry must never affect page delivery.

The media processor deletes quarantine objects older than one day in bounded batches and alerts on cleanup failure. Do not apply age-based deletion to `work-media/`: that prefix contains immutable media attached to retained Drafts and future Revisions. Core deletes expired unattached processed objects after seven days from authoritative database claims.

Create a seventh stateful Coolify resource for the media service at `media.<domain>`, with an attached persistent volume, automated off-site volume backup, and Cloudflare proxying. Create a separate single-instance Postgres resource with an attached volume, automated periodic `pg_dump`, and an exercised staging restore procedure. Backups inherit production secret/data access controls and retention policy.

The reverse proxies in front of Admin and Student must overwrite, not append from untrusted clients, the client address header supplied to each application. Each application forwards the normalized address to Core only after authenticating with its distinct BFF secret so login rate limiting remains source-aware and session audiences remain isolated.

Before routing traffic to a new environment, set the singleton `academic_settings.current_academic_year` through an authorized database operation. Core readiness stays down while this value is missing; migrations intentionally do not guess an environment's current academic year.

## GitHub wiring

Copy each Coolify application UUID into the repository variable documented in `secrets.md`. Create one least-privilege Coolify API token per environment when supported; store it only in the matching GitHub Environment.

First deployment validation:

1. Leave `COOLIFY_STAGING_ENABLED` absent and push the initial harness commit to `main`.
2. Confirm successful CI builds five GHCR images with the same full SHA tag and skips deployment.
3. Finish staging applications, UUID variables, environment secrets, domains, and runtime configuration.
4. Set `COOLIFY_STAGING_ENABLED=true` and manually run `Deploy staging` with the full SHA.
5. Confirm staging Media becomes healthy before Core, workers, and frontends deploy.
6. Confirm every public health endpoint returns 200 over HTTPS.
7. Trigger production with that full SHA and approve the protected Environment.
8. Confirm Coolify shows the exact same image tags in both environments.

## Host access

Normal operators use Coolify and GitHub Actions. Direct host access is break-glass only, audited, and never part of a deployment. Any emergency host change must be reconciled back to Coolify or Git before the next deploy.
