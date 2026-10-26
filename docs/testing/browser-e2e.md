# Browser E2E harness

The focused browser commands prove the cross-application Profile Consent and Work
lifecycle journeys:

```bash
pnpm e2e
```

It starts or reuses the local Supabase stack, resets the local database once for the
run, starts Core on `http://127.0.0.1:4100`, Student on `http://127.0.0.1:3002`, and
Admin on `http://127.0.0.1:3001`, Visitor on `http://127.0.0.1:3000`, and the
deterministic local media provider on `http://127.0.0.1:4191`. A local media
processor consumes the provider objects and runs the same Core processing path.
It then runs the Chromium project. Docker (or a
Docker-compatible runtime), Node 22.18+, and the pinned pnpm version are required.
The Chromium binary can be installed with `pnpm exec playwright install chromium`.

Useful variants:

```bash
pnpm e2e:headed
pnpm e2e:debug
pnpm e2e -- --grep "Profile Consent"
pnpm e2e:work
```

On failure the fixture records a screenshot with all credential inputs masked,
Playwright retains a trace in `test-results/`, and an HTML report is written to
`playwright-report/`. Before the command returns, a privacy gate scans reports and
the contents of trace ZIPs for the run-scoped identities, credentials, and session
cookies. Any unsafe artifact is deleted and the run fails with
`E2E_ARTIFACT_SENSITIVE_DATA_DETECTED`. Inspect a retained safe trace with:

```bash
pnpm exec playwright show-trace test-results/artifacts/<trace>.zip
```

The fixtures create run-scoped synthetic Students, an Admin, Accounts, a Contributor,
local Auth identities, and deterministic media preconditions directly from the Node
test process; the real Student flow creates the Work Draft. Browser specifications
only receive typed scenario interfaces and read-only state queries; they do not know
table order, hashes, or provider administration calls. Cleanup deletes only recorded
rows, local Auth identities, and media objects owned by the run. An integration
preflight verifies exact fixture creation, idempotent cleanup, and absence from local
Auth and Postgres after cleanup before Chromium starts. The Work suite proves
both approval and `changes_requested`/resubmission while retaining immutable Revision
and Review history.
The re-review path publishes Revision 1 first, keeps it public through the pending and
Change Request states, and verifies that correction resubmission creates the next
immutable Revision before publication.
The database reset happens once before Playwright starts, not before each test.

The harness fails closed unless `APP_ENV=test`, `E2E_LOCAL_ONLY=1`, Postgres is
`127.0.0.1`/`localhost` on port `54322`, and Supabase Auth is local HTTP on port
`54321`. It obtains local keys from `supabase status --output env` after `supabase
start`; no linked project is queried. Do not set remote URLs, linked-project flags,
or production/staging mode. A target or credential failure is reported as an
`E2E_SETUP_*` error before reset, fixture setup, cleanup, or browser execution.

Student IDs, credentials, session cookies, provider tokens, BFF secrets, and
database credentials are never printed by the runner. The private sensitive-value
registry is mode `0600`, is excluded from scanning, and is deleted before the runner
returns. E2E output directories are ignored by Git and CI uploads only privacy-gated
diagnostics on failure with seven-day retention; keep artifacts out of issue comments
and public reports.

The browser tests intentionally cover only critical cross-boundary transitions.
Existing Core HTTP E2E, frontend interaction, domain, and Postgres integration suites
remain responsible for invalid-input, authorization, stale-version, idempotency, and
provider-failure permutations. Browser tests use semantic locators and retrying
assertions; fixed sleeps and browser-visible test bypasses are prohibited.

CI runs only the specifications that drive an affected application. When adding a
specification, map it to the browser applications it uses in
`tools/ci/select-browser-e2e.mjs`; CI fails on an unmapped specification. See
`docs/infrastructure/ci-cd.md` for the selection rules.
