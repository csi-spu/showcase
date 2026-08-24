# Backward compatibility

Coolify may run old and new containers concurrently during rollout. Database, API, cookie, and event changes must tolerate that overlap.

## Database expand and contract

1. Expand: add nullable columns, tables, indexes, or compatible constraints.
2. Deploy code that reads old and new forms and writes the new form.
3. Backfill with an idempotent, observable process when needed.
4. Verify no old application version or unfinished job depends on the old form.
5. Contract in a later deployment by removing obsolete columns, values, or code.

Avoid table rewrites and long blocking locks in a request-time migration. Create large indexes concurrently where Supabase/Postgres supports it and verify failure recovery.

## API changes

- Add fields compatibly; clients ignore unknown response fields.
- Do not rename/remove fields or change meaning in place.
- New required input starts optional until all callers send it, or ships under a new endpoint/version.
- Enum expansion requires callers to handle unknown values safely before producers emit them.
- Publication and consent filters may become stricter immediately; never loosen them accidentally for compatibility.

## Sessions and cookies

Deploy session format changes with dual-read support. Cookie name, scope, signing/encryption, and expiry changes require a migration path that avoids logging everyone out unless explicitly accepted.

## Rollback test

Before merging a risky change, answer both:

- Can old code run against the expanded schema after migration?
- Can new code run while old containers still serve traffic?

If either answer is no, split the change into multiple deployments.
