alter table public.accounts
  add column control_version integer not null default 1 check (control_version > 0);

alter table public.academic_settings
  add column version integer not null default 0 check (version >= 0),
  add column updated_by_account_id uuid references public.accounts (id);

insert into public.academic_settings (singleton, current_academic_year, version)
values (true, null, 0)
on conflict (singleton) do nothing;

create table private.academic_year_change_audit_events (
  id bigint generated always as identity primary key,
  idempotency_key uuid not null unique,
  actor_account_id uuid not null references public.accounts (id),
  previous_academic_year smallint,
  current_academic_year smallint not null check (current_academic_year between 2400 and 2700),
  expected_version integer not null check (expected_version >= 0),
  resulting_version integer not null check (resulting_version > 0),
  occurred_at timestamptz not null,
  constraint academic_year_change_moves_forward check (
    previous_academic_year is null or current_academic_year > previous_academic_year
  )
);

create table private.student_access_extension_audit_events (
  id bigint generated always as identity primary key,
  idempotency_key uuid not null unique,
  actor_account_id uuid not null references public.accounts (id),
  student_account_id uuid not null references public.accounts (id),
  previous_access_ends_academic_year smallint not null,
  access_ends_academic_year smallint not null check (access_ends_academic_year between 2400 and 2700),
  reason text not null check (
    reason = btrim(reason) and char_length(reason) between 1 and 2000
  ),
  expected_version integer not null check (expected_version > 0),
  resulting_version integer not null check (resulting_version > expected_version),
  occurred_at timestamptz not null,
  constraint student_access_extension_moves_later check (
    access_ends_academic_year > previous_access_ends_academic_year
  )
);

create index student_access_extension_target_time_idx
  on private.student_access_extension_audit_events (student_account_id, occurred_at desc);

create table private.student_password_reset_operations (
  idempotency_key uuid primary key,
  actor_account_id uuid not null references public.accounts (id),
  student_account_id uuid not null references public.accounts (id),
  expected_version integer not null check (expected_version > 0),
  resulting_version integer not null check (resulting_version > expected_version),
  status text not null check (status in ('pending', 'provider_failed', 'completed')),
  error_code text check (error_code is null or error_code = 'provider_unavailable'),
  started_at timestamptz not null,
  finished_at timestamptz,
  constraint student_password_reset_operation_state_valid check (
    (status = 'pending' and error_code is null and finished_at is null)
    or (status = 'provider_failed' and error_code is not null and finished_at is not null)
    or (status = 'completed' and error_code is null and finished_at is not null)
  )
);

create index student_password_reset_target_time_idx
  on private.student_password_reset_operations (student_account_id, started_at desc);

revoke all on table private.academic_year_change_audit_events from public, anon, authenticated;
revoke all on table private.student_access_extension_audit_events from public, anon, authenticated;
revoke all on table private.student_password_reset_operations from public, anon, authenticated;
