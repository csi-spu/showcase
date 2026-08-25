alter table private.roster_rows
  drop constraint roster_rows_batch_id_student_id_hash_key,
  drop constraint roster_rows_student_id_check,
  alter column student_id type text,
  alter column student_id_hash drop not null,
  alter column synthetic_identity drop not null,
  alter column provider_user_id drop not null,
  alter column first_name_th drop not null,
  alter column last_name_th drop not null,
  alter column entry_year drop not null;

alter table private.roster_rows
  add constraint roster_row_student_id_size_valid
    check (octet_length(student_id) <= 5 * 1024 * 1024),
  add constraint roster_row_error_code_valid
    check (
      error_code is null
      or error_code in (
        'DUPLICATE_STUDENT_ID',
        'INVALID_FIRST_NAME',
        'INVALID_LAST_NAME',
        'INVALID_STUDENT_ID',
        'ROSTER_AUTH_PROVIDER_UNAVAILABLE',
        'ROSTER_CONFLICT',
        'ROSTER_PROCESSING_FAILED'
      )
    ),
  add constraint roster_row_input_valid check (
    (
      student_id_hash is null
      and synthetic_identity is null
      and provider_user_id is null
      and entry_year is null
      and first_name_th is null
      and last_name_th is null
      and status = 'failed'
      and error_code in (
        'DUPLICATE_STUDENT_ID',
        'INVALID_FIRST_NAME',
        'INVALID_LAST_NAME',
        'INVALID_STUDENT_ID'
      )
    )
    or (
      student_id ~ '^[0-9]{8}$'
      and student_id_hash is not null
      and synthetic_identity is not null
      and provider_user_id is not null
      and entry_year is not null
      and first_name_th is not null
      and last_name_th is not null
    )
  );

create unique index roster_rows_batch_student_hash_valid_idx
  on private.roster_rows (batch_id, student_id_hash)
  where student_id_hash is not null;

create index roster_batches_completed_at_idx
  on private.roster_batches (completed_at, id)
  where completed_at is not null;

create or replace function private.are_valid_roster_entry_years(candidate smallint[])
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select
    candidate = (
      select coalesce(array_agg(distinct value order by value), '{}'::smallint[])
      from unnest(candidate) as entry_year(value)
    )
    and cardinality(candidate) between 0 and 100
    and array_position(candidate, null) is null
    and (
      cardinality(candidate) = 0
      or (
        candidate[1] between 2400 and 2700
        and candidate[cardinality(candidate)] between 2400 and 2700
      )
    )
$$;

create table private.roster_conflicts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references private.roster_batches (id),
  source_row_number integer not null check (source_row_number >= 2),
  person_id uuid not null references public.people (id),
  student_id_hash char(64) not null check (student_id_hash ~ '^[0-9a-f]{64}$'),
  existing_first_name_th text not null,
  existing_last_name_th text not null,
  incoming_first_name_th text not null,
  incoming_last_name_th text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  version integer not null default 1 check (version > 0),
  resolution text check (resolution in ('keep_existing', 'accept_incoming_name')),
  reason text check (reason is null or (reason = btrim(reason) and char_length(reason) between 1 and 2000)),
  resolved_by_account_id uuid references public.accounts (id),
  resolved_at timestamptz,
  resolution_idempotency_key uuid unique,
  created_at timestamptz not null,
  unique (batch_id, source_row_number),
  constraint roster_conflict_resolution_valid check (
    (
      status = 'pending'
      and resolution is null
      and reason is null
      and resolved_by_account_id is null
      and resolved_at is null
      and resolution_idempotency_key is null
    )
    or (
      status = 'resolved'
      and resolution is not null
      and resolved_by_account_id is not null
      and resolved_at is not null
      and resolution_idempotency_key is not null
      and (resolution <> 'accept_incoming_name' or reason is not null)
    )
  )
);

create index roster_conflicts_batch_row_idx
  on private.roster_conflicts (batch_id, source_row_number, id);

create index roster_conflicts_pending_idx
  on private.roster_conflicts (batch_id, source_row_number, id)
  where status = 'pending';

create table private.roster_conflict_resolution_audit_events (
  id bigint generated always as identity primary key,
  conflict_id uuid not null references private.roster_conflicts (id),
  batch_id uuid not null references private.roster_batches (id),
  actor_account_id uuid not null references public.accounts (id),
  resolution text not null check (resolution in ('keep_existing', 'accept_incoming_name')),
  reason text check (reason is null or (reason = btrim(reason) and char_length(reason) between 1 and 2000)),
  idempotency_key uuid not null unique,
  resolved_version integer not null check (resolved_version > 1),
  occurred_at timestamptz not null
);

create index roster_conflict_audit_batch_time_idx
  on private.roster_conflict_resolution_audit_events (batch_id, occurred_at, id);

revoke all on table private.roster_conflicts from public, anon, authenticated;
revoke all on table private.roster_conflict_resolution_audit_events from public, anon, authenticated;

comment on table private.roster_conflicts is
  'Private normalized identity disagreements retained independently of expiring Roster row content.';
