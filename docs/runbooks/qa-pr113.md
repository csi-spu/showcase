# Local QA: PR #113

Scope: Instructor access, separate authentication audiences, collection Rounds,
Groups and membership management. Forms, document uploads and document review are
not implemented in this milestone. Student collection currently has authentication
only; an empty authenticated home is expected.

## Start

Open Docker Desktop, then run from the repository root:

```sh
rtk proxy docker compose up -d --wait postgres
rtk proxy pnpm --filter @showcase/core db:migrate
rtk proxy pnpm qa:seed
rtk proxy pnpm dev
```

Core uses `apps/core/.env`. The seed requires explicit `APP_ENV=development`, a
loopback Postgres URL and a loopback HTTP `CORE_URL`. It reads Core's environment
file, with shell variables taking precedence, and uses the same local Better Auth
secret default as Core when absent. Run migrations and generate the Prisma client
through normal bootstrap before first use.

Set server-only `API_KEY` and `CORE_URL` in each frontend's `.env.local` to the same
values as Core. This includes `admin`, `student`, `instructor` and
`student-collection`. Existing sample secrets for the new apps differ from Core's
secret. Restart an already-running frontend after changing its environment.

| Surface            | URL                   |
| ------------------ | --------------------- |
| Admin              | http://localhost:3001 |
| Student            | http://localhost:3002 |
| Instructor         | http://localhost:3003 |
| Student collection | http://localhost:3004 |

## Credentials and fixture behavior

Open `.scratch/qa-pr113.json` locally. Each `accounts` entry has a scenario `key`,
`login`, `password`, starting `roles`, `state` and `status`. Student logins are
synthetic Student IDs. Passwords are generated, never printed by the seed. The
manifest is Git-ignored and created with owner-only permissions. Do not attach it
to issues or publish it.

The manifest is bound to the database URL and identity secret. Keep it for repeat
runs. Re-running `qa:seed` preserves existing passwords, role changes, account
status and membership withdrawals made during QA. It does not reset scenarios.
After changing a password in the UI, use that new password; the manifest records
the original one. Existing unrelated local data is retained. No Profile Consent
or public Work is seeded. The current Academic Year is left unchanged; the
`alumnus` fixture has an access end of 2557.

## Checklist

| Scenario key           | Exercise                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `admin`                | Open Admin Accounts, Instructor management; Instructor login must fail                         |
| `instructor-a`         | Manage Rounds/Groups; Admin login must fail                                                    |
| `instructor-b`         | Access and edit the same Groups created by Instructor A                                        |
| `dual-role`            | Log into Admin and Instructor independently                                                    |
| `grant-target`         | Grant Instructor role through Admin, then log into Instructor                                  |
| `revoke-target`        | Log into Instructor, revoke role through Admin, verify next protected request rejects access   |
| `initial-instructor`   | Login requires password change before managing Groups                                          |
| `suspended-instructor` | Instructor login rejected                                                                      |
| `current`              | Existing current member in `QA113 mixed`; login to Student collection                          |
| `withdrawn`            | Already withdrawn in `QA113 mixed`; re-add must report already withdrawn                       |
| `individual`           | Add to `QA113 individual` using one Student ID                                                 |
| `list`                 | Add with other synthetic IDs to `QA113 list`; repeat list to check no duplicates               |
| `cohort`               | Add Entry Year 2568 to `QA113 entry-year`; re-run snapshot to check no duplicates              |
| `initial-student`      | Student collection requires password change; also belongs to Entry Year 2568                   |
| `suspended-student`    | Login rejected; membership addition must not accept suspended Account                          |
| `alumnus`              | Student collection login currently accepts active Student Accounts regardless of access period |

Use the manifest's `rounds` and `groups` for IDs. The active Round has `mixed`,
`individual`, `list`, and `entry-year` Groups. A separate closed Round has a
`closed` Group for inspecting that stored state. This PR does not enforce a
closed-Round write restriction.

Additional checks:

1. Create a new Round and Group through the Instructor UI.
2. Add duplicate IDs and invalid input; inspect feedback and absence of duplicate memberships.
3. Withdraw `current` with a reason, verify actor/reason/time remain recorded.
4. Attempt a second withdrawal and re-add; neither should reinstate membership or overwrite the first reason.
5. Add an Entry Year snapshot, then add another eligible Student later; existing membership is a snapshot, not a live cohort link.
6. Keep Admin and Instructor sessions open for `dual-role`; log out of one and verify the other remains usable.

Entry Year snapshots include all eligible local Accounts for that year, including
data created outside this seed. Use an empty QA Group to keep the result easy to inspect.

## Automated fixture verification

Before manually changing fixtures, with Core running:

```sh
rtk proxy pnpm qa:seed:test
rtk proxy pnpm qa:seed:integration
```

The focused integration checks re-run the seed, compare retained Accounts/roles/
memberships, exercise 13 login cases, verify cross-Instructor access and reject
an Instructor token on the Admin audience. Sessions are logged out after checks.
Auth audit events and source rate-limit counters are normal side effects. The
integration check clears only these fixture Accounts' login counters before and
after testing so manual QA is not locked out. Checks expect
the original fixture passwords/statuses; changed manual QA scenarios can fail
those expectations. No full monorepo or browser test suite is run by these commands.
