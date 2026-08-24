# Git flow

## Branches

`main` is protected, reviewed, and deployable. Create short-lived branches from current `main`:

- `feat/<scope>-<description>`
- `fix/<scope>-<description>`
- `chore/<scope>-<description>`
- `docs/<description>`

Do not maintain long-lived staging or production branches. Environments track immutable commit artifacts, not branch divergence.

## Pull requests

Every pull request must state:

- behavior changed and behavior intentionally unchanged
- domain or architecture decisions
- migrations and compatibility sequence, if any
- focused checks run and checks not run
- rollout, observability, and rollback implications

Require passing CI, resolved review, and up-to-date branch protection checks. Do not bypass review for infrastructure, authentication, authorization, migration, or publication workflow changes.

## Commits

Keep commits scoped and buildable when practical. Commit messages describe intent, not file operations. Never commit generated caches, local env files, credentials, roster data, or real Student IDs.

## Release

Merge to `main` builds and deploys staging. After verification, run `Deploy production` with the full staged commit SHA. Production requires protected Environment approval and promotes existing images unchanged.

Normal rollback is a revert pull request or an emergency revert commit on `main`, followed by the normal pipeline. Coolify image rollback is an escape hatch and must be reconciled with Git immediately.
