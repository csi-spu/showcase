# Local development

## Service model

Application processes run on the host for fast reload. Supabase CLI runs local Postgres, Auth, and Studio in Docker. Realtime, Supabase Storage, Edge Runtime, Analytics, and public signup are disabled because Phase 1 does not use them.

The self-hosted Media service uses a disposable local storage root and a development-only signing secret. Media adapter unit tests use local fakes. Local development without profile-photo or Work-media uploads may omit Media configuration; Core reports those upload capabilities as unavailable.

## Ports

|  Port | Service           |
| ----: | ----------------- |
|  3000 | Visitor           |
|  3001 | Admin             |
|  3002 | Student           |
|  4100 | Core              |
|  4191 | Media             |
| 54321 | Supabase API/Auth |
| 54322 | Postgres          |
| 54323 | Studio            |

Committed ports are a team contract. Resolve local conflicts instead of changing them per developer.

## Environment files

`pnpm bootstrap` creates ignored files only when absent:

- `apps/core/.env`
- `apps/admin/.env.local`
- `apps/student/.env.local`
- `apps/visitor/.env.local`

Update each `.env.example` with a non-secret placeholder whenever code adds an environment key. Existing local files are never overwritten by bootstrap.

Frontend Core URLs remain server-only as `CORE_URL`. Do not introduce `NEXT_PUBLIC_CORE_URL`: it would bake environment routing into the container and prevent one immutable image from remaining runtime-configurable.

Sentry is optional locally. Leave `NEXT_PUBLIC_SENTRY_DSN` and server `SENTRY_DSN` empty to disable event delivery. Local builds skip source-map upload unless `SENTRY_UPLOAD_SOURCE_MAPS=true`; never use the production auth token for local work. The public browser DSN exception is limited to error routing and documented by ADR 0016.

## Lifecycle

```sh
pnpm db:start
pnpm db:status
pnpm dev
pnpm db:stop
```

`pnpm db:reset` is intentionally destructive to the local Supabase database only. Review the target before running it; shared environments use migrations, never reset.

## Integration credentials

For profile-photo, Work-media, or collection-file upload testing, run Media with a disposable storage root, a development-only `MEDIA_SERVICE_HMAC_SECRET`, `STUDENT_URL=http://localhost:3002`, and `STUDENT_COLLECTION_URL=http://localhost:3004`. Configure Core with the same signing secret plus the local private and public Media origins. Do not reuse production credentials or expose the signing secret through a `NEXT_PUBLIC_*` variable.
