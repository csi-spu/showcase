# Local development

## Service model

Application processes run on the host for fast reload. Supabase CLI runs local Postgres, Auth, and Studio in Docker. Realtime, Supabase Storage, Edge Runtime, Analytics, and public signup are disabled because Phase 1 does not use them.

R2 has no committed production credential or bucket fallback. Media adapter unit tests use fakes; provider integration tests use a dedicated non-production R2 bucket with short-lived, least-privilege credentials. Local development without media features needs no R2 access.

## Ports

|  Port | Service           |
| ----: | ----------------- |
|  3000 | Visitor           |
|  3001 | Admin             |
|  3002 | Student           |
|  4100 | Core              |
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

Frontend Core URLs remain server-only as `CORE_URL`. Do not introduce `NEXT_PUBLIC_CORE_URL`: it would bake environment routing into the container and break immutable promotion from staging to production.

## Lifecycle

```sh
pnpm db:start
pnpm db:status
pnpm dev
pnpm db:stop
```

`pnpm db:reset` is intentionally destructive to the local Supabase database only. Review the target before running it; shared environments use migrations, never reset.

## Integration credentials

When R2 integration work starts, create a separate development bucket and API token restricted to that bucket. Put its endpoint, account ID, access key, secret, bucket, and public media origin in the Core local env. Do not reuse staging or production credentials and do not expose secret values through a `NEXT_PUBLIC_*` variable.
