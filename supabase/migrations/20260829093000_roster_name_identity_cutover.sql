create table private.person_name_correction_audit_events (
  id bigint generated always as identity primary key,
  idempotency_key uuid not null unique,
  actor_account_id uuid not null references public.accounts (id),
  student_account_id uuid not null references public.accounts (id),
  previous_first_name_th text not null,
  previous_last_name_th text not null,
  first_name_th text not null,
  last_name_th text not null,
  reason text not null check (
    reason = btrim(reason) and char_length(reason) between 1 and 2000
  ),
  expected_version integer not null check (expected_version > 0),
  resulting_version integer not null check (resulting_version >= expected_version),
  occurred_at timestamptz not null,
  constraint person_name_correction_version_matches_change check (
    (
      previous_first_name_th = first_name_th
      and previous_last_name_th = last_name_th
      and resulting_version = expected_version
    )
    or (
      (
        previous_first_name_th <> first_name_th
        or previous_last_name_th <> last_name_th
      )
      and resulting_version = expected_version + 1
    )
  )
);

create index person_name_correction_target_time_idx
  on private.person_name_correction_audit_events (student_account_id, occurred_at desc);

alter table private.person_name_correction_audit_events enable row level security;
revoke all on table private.person_name_correction_audit_events
  from public, anon, authenticated;

create index person_names_public_catalog_search_idx
on private.person_names using gin (
  (lower(regexp_replace(
    normalize(btrim(first_name_th || ' ' || last_name_th), NFKC),
    '[[:space:]]+',
    ' ',
    'g'
  ))) extensions.gin_trgm_ops
)
where first_name_th is not null and last_name_th is not null;

create index person_names_public_catalog_browse_idx
on private.person_names (
  (lower(regexp_replace(
    normalize(btrim(first_name_th || ' ' || last_name_th), NFKC),
    '[[:space:]]+',
    ' ',
    'g'
  ))),
  person_id
)
where first_name_th is not null and last_name_th is not null;

-- Keep old application instances working during the compatibility release. New
-- code omits the legacy profile name columns and this trigger derives them from
-- the authoritative Roster Name until the explicit cutover runs.
create function private.fill_legacy_profile_name_from_roster()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.display_name is null then
    select concat_ws(' ', name.first_name_th, name.last_name_th)
    into new.display_name
    from private.person_names as name
    where name.person_id = new.person_id;
  end if;
  return new;
end;
$$;

create trigger legacy_profile_name_from_roster
before insert on public.public_profiles
for each row execute function private.fill_legacy_profile_name_from_roster();

create function private.sync_legacy_profile_name_from_roster()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.public_profiles
  set display_name = concat_ws(' ', new.first_name_th, new.last_name_th),
      normalized_display_name = lower(regexp_replace(
        normalize(btrim(new.first_name_th || ' ' || new.last_name_th), NFKC),
        '[[:space:]]+',
        ' ',
        'g'
      ))
  where person_id = new.person_id;
  return new;
end;
$$;

create trigger sync_legacy_profile_name_from_roster
after update of first_name_th, last_name_th on private.person_names
for each row
when (
  old.first_name_th is distinct from new.first_name_th
  or old.last_name_th is distinct from new.last_name_th
)
execute function private.sync_legacy_profile_name_from_roster();

-- Run only after Core, Student, Visitor, and Admin no longer read or write the
-- legacy columns. The function is intentionally explicit so additive migration
-- deployment remains rollback-safe during a rolling release.
create function private.execute_roster_name_profile_cutover()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('roster-name-profile-cutover', 0));
  lock table public.public_profiles in access exclusive mode;
  lock table private.person_names in share row exclusive mode;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_profiles'
      and column_name = 'display_name'
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.public_profiles as profile
    left join private.person_names as name on name.person_id = profile.person_id
    where name.person_id is null
      or name.first_name_th is null
      or name.last_name_th is null
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'ROSTER_NAME_PROFILE_CUTOVER_INCOMPLETE';
  end if;

  execute 'drop trigger if exists legacy_profile_name_from_roster on public.public_profiles';
  execute 'drop trigger if exists sync_legacy_profile_name_from_roster on private.person_names';
  execute 'drop trigger if exists public_profiles_normalized_display_name on public.public_profiles';
  execute 'drop index if exists public.public_profiles_display_name_search_idx';
  execute 'drop index if exists public.public_profiles_display_name_browse_idx';
  execute 'drop function if exists private.fill_legacy_profile_name_from_roster()';
  execute 'drop function if exists private.sync_legacy_profile_name_from_roster()';
  execute 'drop function if exists private.default_normalized_display_name()';
  execute 'alter table public.public_profiles drop column normalized_display_name';
  execute 'alter table public.public_profiles drop column display_name';
end;
$$;

revoke all on function private.fill_legacy_profile_name_from_roster()
  from public, anon, authenticated;
revoke all on function private.sync_legacy_profile_name_from_roster()
  from public, anon, authenticated;
revoke all on function private.execute_roster_name_profile_cutover()
  from public, anon, authenticated;
