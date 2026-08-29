# Roster Name and Public Profile cutover

Use this runbook to remove the legacy Public Profile name columns after every application reads the authoritative Roster Name from `private.person_names`.

## Preconditions

1. Apply `20260829093000_roster_name_identity_cutover.sql` and the idempotent legacy-seed repair
   `20260829093100_backfill_showcase_roster_names.sql` as additive migrations.
2. Deploy compatible Core, Student, Visitor, and Admin builds.
3. Confirm Student and Alumnus profile forms render first name and last name read-only.
4. Confirm Admin Roster Name correction is versioned, idempotent, reason-required, and audited.
5. Confirm People catalog, Public Profile, Work authoring, and new Revision snapshots read Roster Name.
6. Verify the count below is zero. Record only the count, never Person or Student identifiers.

```sql
select count(*)
from public.public_profiles as profile
left join private.person_names as name on name.person_id = profile.person_id
where name.person_id is null
   or name.first_name_th is null
   or name.last_name_th is null;
```

## Cutover

Run once during a controlled release window:

```sql
begin;
select private.execute_roster_name_profile_cutover();
commit;
```

The transaction locks Public Profile and Roster Name writes, rechecks completeness, removes compatibility triggers and indexes, then drops `display_name` and `normalized_display_name`. Existing immutable Revision attribution snapshots are not updated.

Verify both legacy columns are absent:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'public_profiles'
  and column_name in ('display_name', 'normalized_display_name');
```

## Rollback floor

The additive migration can run before application cutover. After the explicit cutover succeeds, do not roll back to an application build that reads or writes the removed columns. Roll back through a reviewed application release that uses Roster Name; do not recreate profile names from historical attribution snapshots.
