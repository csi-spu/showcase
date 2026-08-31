# Browser E2E harness

The focused browser command proves the cross-application Profile Consent journey:

```bash
pnpm e2e
```

It starts or reuses the local Supabase stack, resets the local database once for the
run, starts Core on `http://127.0.0.1:4100`, Student on `http://127.0.0.1:3002`, and
Visitor on `http://127.0.0.1:3000`, and runs the Chromium project. Docker (or a
Docker-compatible runtime), Node 22.18+, and the pinned pnpm version are required.
The Chromium binary can be installed with `pnpm exec playwright install chromium`.

Useful variants:

```bash
pnpm e2e:headed
pnpm e2e:debug
pnpm e2e -- --grep "Profile Consent"
```

On failure Playwright retains a trace and screenshot in `test-results/` and writes
an HTML report to `playwright-report/`. Inspect a trace with:

```bash
pnpm exec playwright show-trace test-results/artifacts/<trace>.zip
```

The fixture creates one run-scoped synthetic Student, Account, local Auth identity,
and private Public Profile directly from the Node test process. Browser specifications
only receive the typed scenario interface and a read-only consent-state query; they
do not know table order, hashes, or provider administration calls. Cleanup deletes
only the recorded Person, Account, Auth identity, sessions, profile, and consent rows.
The database reset happens once before Playwright starts, not before each test.

The harness fails closed unless `APP_ENV=test`, `E2E_LOCAL_ONLY=1`, Postgres is
`127.0.0.1`/`localhost` on port `54322`, and Supabase Auth is local HTTP on port
`54321`. It obtains local keys from `supabase status --output env` after `supabase
start`; no linked project is queried. Do not set remote URLs, linked-project flags,
or production/staging mode. A target or credential failure is reported as an
`E2E_SETUP_*` error before reset, fixture setup, cleanup, or browser execution.

Student IDs, credentials, session cookies, provider tokens, BFF secrets, and
database credentials are never printed by the runner. E2E output directories are
ignored by Git and CI uploads diagnostics only on failure with seven-day retention;
keep artifacts out of issue comments and public reports.

The browser test intentionally covers only the critical authentication/profile/public
visibility transition. Existing Core HTTP E2E, frontend interaction, domain, and
Postgres integration suites remain responsible for invalid-input, authorization,
stale-version, idempotency, and provider-failure permutations.
