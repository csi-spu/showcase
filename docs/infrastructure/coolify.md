# Coolify setup

## Resource layout

Create one `production` environment containing these Docker Image applications and workers. Add staging later as a separate delivery decision when the team is ready to operate it:

| App                                 | Image name                                    | Container port | Health path        |
| ----------------------------------- | --------------------------------------------- | -------------: | ------------------ |
| core                                | `ghcr.io/csi-spu/showcase-core`               |           4100 | `/v1/health/ready` |
| core-media-processor                | `ghcr.io/csi-spu/showcase-core`               |            n/a | n/a                |
| core-cache-worker                   | `ghcr.io/csi-spu/showcase-core`               |            n/a | n/a                |
| core-collection-export-builder      | `ghcr.io/csi-spu/showcase-core`               |            n/a | n/a                |
| core-collection-file-inspector      | `ghcr.io/csi-spu/showcase-core`               |            n/a | n/a                |
| core-collection-reminder-dispatcher | `ghcr.io/csi-spu/showcase-core`               |            n/a | n/a                |
| admin                               | `ghcr.io/csi-spu/showcase-admin`              |           3001 | `/health`          |
| instructor                          | `ghcr.io/csi-spu/showcase-instructor`         |           3003 | `/health`          |
| student                             | `ghcr.io/csi-spu/showcase-student`            |           3002 | `/health`          |
| student-collection                  | `ghcr.io/csi-spu/showcase-student-collection` |           3004 | `/health`          |
| visitor                             | `ghcr.io/csi-spu/showcase-visitor`            |           3000 | `/health`          |
| media                               | `ghcr.io/csi-spu/showcase-media`              |           4191 | `/health`          |

Give Coolify read-only GHCR access. Configure an initial valid SHA tag before first start. Do not connect these applications to a Git source or enable automatic deploy.

## Domains

Use one hostname per application in each environment. Production shape:

- Visitor: apex or public showcase hostname
- Admin: `admin.<domain>`
- Student: `student.<domain>`
- Core: `core.<domain>`
- Media: `media.<domain>`

Force HTTPS. Route Core internal authentication endpoints only where the frontend containers can reach them; the BFF secret remains mandatory even on a private network.

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

Core needs `APP_ENV`, `NODE_ENV=production`, `PORT=4100`, exact `ADMIN_URL`, `STUDENT_URL`, `VISITOR_URL`, `CORE_URL`, `DATABASE_URL`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_SECRET`, `API_KEY`, `CATALOG_CURSOR_SECRET`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `PUBLIC_MEDIA_ORIGIN`, `MEDIA_SERVICE_URL`, `MEDIA_SERVICE_HMAC_SECRET`, `VISITOR_BFF_SECRET`, `VISITOR_CACHE_SECRET`, and its public `SENTRY_DSN`. Core derives the Admin, Instructor, Student, and Student Collection BFF secrets plus `AUTH_IDENTITY_SECRET` from `API_KEY`, and derives `CORS_ALLOWED_ORIGINS` from `ADMIN_URL`, `STUDENT_URL`, and `VISITOR_URL`. Admin, Instructor, and Student Collection each need runtime `CORE_URL` and their own `API_KEY` set to the same value as Core's `API_KEY`. Student additionally needs `VISITOR_URL`. Visitor needs runtime `CORE_URL` and the same environment's `VISITOR_BFF_SECRET` and `VISITOR_CACHE_SECRET`. Keep secrets server-only; ADR 0016 explicitly allows only the public Sentry DSNs to use a `NEXT_PUBLIC_` prefix.

Media needs `APP_ENV=production`, `NODE_ENV=production`, `HOST`, `PORT=4191`, `STORAGE_ROOT=/data`, `MEDIA_SERVICE_HMAC_SECRET`, exact `STUDENT_URL`, and its public `SENTRY_DSN`. `STUDENT_URL` is the only browser origin allowed to use signed upload URLs; Media rejects other origins and validates preflight requests against the signed `PUT` method.

Set the same Core project DSN on the Core API, cache worker, collection file inspector, collection export builder, roster worker process, and media processor because they share the Core project; runtime tags distinguish them. Do not set `SENTRY_AUTH_TOKEN` in Coolify. The five frontend DSNs are build-time GitHub variables and are not Coolify values.

Create `core-media-processor` as a non-HTTP Coolify resource from the exact Core image. It runs `node dist/modules/works/commands/process-work-media.js` on a one-minute schedule, shares Core's database and media-service environment values, and exits after at most 20 processing or cleanup jobs. Limit it to one CPU and 512 MiB memory; Sharp itself uses one worker, a 64 MiB cache, bounded decoded pixels, and a 15-second operation timeout. Concurrent runs are safe because processing and cleanup claims use leased rows with `FOR UPDATE SKIP LOCKED`.

Create `core-cache-worker` as another non-HTTP Coolify resource from the exact Core image. It runs `node dist/modules/catalog/commands/process-cache-invalidations.js` continuously, uses the Core database plus Cloudflare/Visitor cache values, and restarts on failure. The worker polls idle state once per second, coalesces up to four events per purge, spaces provider calls by 12 seconds to respect the lowest Cloudflare plan limit, leases each durable delivery for 30 seconds, retries at bounded backoff up to eight attempts, and is horizontally safe through `FOR UPDATE SKIP LOCKED`. Run one worker per environment so aggregate provider calls retain that rate bound. Alert when pending lag exceeds 30 seconds or a delivery reaches `failed`; run `private.reconcile_public_cache_invalidations()` during reconciliation to restore missing derived jobs without duplicating completed deliveries.

Create `core-collection-file-inspector` as another non-HTTP Coolify resource from the exact Core image. Run `node dist/modules/collection-forms/commands/inspect-collection-files.js` on a one-minute schedule. Give it the same runtime configuration as Core because the shared environment schema validates the whole Core contract; `DATABASE_URL`, `MEDIA_SERVICE_URL`, `MEDIA_SERVICE_HMAC_SECRET`, and the Core project's `SENTRY_DSN` are the values it actively uses. One run inspects at most 50 files and exits; concurrent runs claim different rows through `FOR UPDATE SKIP LOCKED`. Alert when the oldest `quarantined` or `inspecting` file exceeds two minutes, or when the process exits unsuccessfully. A missing inspector is fail-closed: files remain quarantined and cannot be submitted.

Create `core-collection-export-builder` as another non-HTTP Coolify resource from the exact Core image. Run `node dist/modules/collection-forms/commands/build-collection-exports.js` on a one-minute schedule with the same runtime configuration as Core; `DATABASE_URL`, `MEDIA_SERVICE_URL`, `MEDIA_SERVICE_HMAC_SECRET`, and the Core project's `SENTRY_DSN` are the values it actively uses. One run builds at most five exports and sweeps at most twenty expired ones, then exits; concurrent runs claim different rows through `FOR UPDATE SKIP LOCKED` under a ten-minute lease, so a run killed mid-build is retried rather than lost, up to three attempts. Give it one CPU and 512 MiB memory: the workbook and archive writers stream, so memory does not scale with export size, but a large archive holds a storage transfer open for minutes. An export request freezes its scope when it is made, so a build that runs late produces exactly what the Instructor asked for rather than a newer picture of the group. The sweep deletes only expired export artifacts and never a submitted document. Alert when a `pending` export exceeds fifteen minutes, when an export reaches `failed`, or when the process exits unsuccessfully. A missing builder degrades visibly and safely: requested exports stay `pending` and nothing is served half-built.

Create `core-collection-reminder-dispatcher` as another non-HTTP Coolify resource from the exact Core image. Run `node dist/modules/collection-forms/commands/dispatch-collection-reminders.js` on a five-minute schedule with the same runtime configuration as Core; `DATABASE_URL` and the Core project's `SENTRY_DSN` are the values it actively uses. One run delivers at most ten batches of 200 reminders and exits. Reminders are derived from the obligation rather than queued ahead, so a missed run delays reminders instead of losing them, and a closed round or a withdrawn membership suppresses delivery at dispatch rather than needing a backfill. A unique index makes redelivery a no-op, so overlapping runs cannot notify a Student twice. Alert when the process exits unsuccessfully. A missing dispatcher degrades quietly: Students still see their obligations and deadlines, they are simply not reminded.

Configure Cloudflare to cache eligible Core API and Visitor HTML responses using their origin `Cache-Control`, retain the origin `Cache-Tag` values, and keep private/no-store routes out of shared cache. The cache worker expires matching Next.js data/path cache first and then calls Cloudflare's zone cache-purge API by tag. HTML/API remains capped at two minutes if purge delivery is delayed.

Processed Work variants (`work-media/{assetId}/{width}.webp`) are served unsigned and `immutable` for a year, so Cloudflare should cache them at the edge and they should never reach the origin twice. This is safe because an upload always mints a new `assetId`, making the URL content-addressed, and because Core only ever emits such a URL for an approved Revision of a published, active Work. Everything else the media service holds — `master.webp` originals, quarantine objects, and profile media — still requires a signed URL and stays `private, no-store`; add no cache rule that would widen the `work-media/` prefix beyond the `{width}.webp` variants.

Visitor samples one percent of LCP, CLS, and INP observations without public identifiers, URLs, Account data, or Student IDs. Aggregate structured `public_web_vital_recorded` logs by `page` and `device` over a rolling 28-day window and alert when p75 exceeds LCP 2.5 seconds, CLS 0.1, or INP 200 milliseconds. Apply a bounded Cloudflare rate limit to `/api/metrics/web-vitals`; rejected telemetry must never affect page delivery.

The media processor deletes quarantine objects older than one day in bounded batches and alerts on cleanup failure. Do not apply age-based deletion to `work-media/`: that prefix contains immutable media attached to retained Drafts and future Revisions. Core deletes expired unattached processed objects after seven days from authoritative database claims.

Create the media service as a stateful Coolify resource at `media.<domain>`, with an attached persistent volume, automated off-site volume backup, and Cloudflare proxying. Create a separate single-instance Postgres resource with an attached volume, automated periodic `pg_dump`, and an exercised restore procedure. Backups inherit production secret/data access controls and retention policy.

The reverse proxies in front of Admin and Student must overwrite, not append from untrusted clients, the client address header supplied to each application. Each application forwards the normalized address to Core only after authenticating with its distinct BFF secret so login rate limiting remains source-aware and session audiences remain isolated.

Before routing traffic to a new environment, set the singleton `academic_settings.current_academic_year` through an authorized database operation. Core readiness stays down while this value is missing; migrations intentionally do not guess an environment's current academic year.

## GitHub wiring

Copy each Coolify application UUID into the repository variable documented in `secrets.md`. Create one least-privilege Coolify API token per environment when supported; store it only in the matching GitHub Environment.

First deployment validation:

1. Finish production applications, UUID variables, Environment secrets, domains, and runtime configuration.
2. Set Media's exact `STUDENT_URL` before deploying the CORS-enabled image.
3. Push the initial harness commit to `main` and confirm CI builds all five GHCR images with the same full SHA tag.
4. Approve the protected production Environment.
5. Confirm Media becomes healthy before Core, all three Core-image workers, and frontends deploy.
6. Confirm every public health endpoint returns 200 over HTTPS and a signed Student upload completes.
7. Confirm each affected Coolify application uses the expected immutable SHA tag.

## Host access

Normal operators use Coolify and GitHub Actions. Direct host access is break-glass only, audited, and never part of a deployment. Any emergency host change must be reconciled back to Coolify or Git before the next deploy.
