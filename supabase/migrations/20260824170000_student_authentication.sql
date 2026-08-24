create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.people (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.students (
  person_id uuid primary key references public.people (id),
  entry_year smallint not null check (entry_year between 2400 and 2700),
  access_ends_academic_year smallint not null,
  created_at timestamptz not null default now(),
  constraint students_access_period_valid
    check (access_ends_academic_year >= entry_year)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references public.people (id),
  provider_user_id uuid not null unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  credential_state text not null default 'initial'
    check (credential_state in ('initial', 'reset_required', 'set')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_roles (
  account_id uuid not null references public.accounts (id),
  role text not null check (role in ('student', 'admin')),
  created_at timestamptz not null default now(),
  primary key (account_id, role)
);

create table private.student_auth_identities (
  account_id uuid primary key references public.accounts (id),
  student_id_hash char(64) not null unique
    check (student_id_hash ~ '^[0-9a-f]{64}$'),
  synthetic_identity text not null unique
    check (synthetic_identity ~ '^[0-9a-f]{64}@auth[.]invalid$'),
  created_at timestamptz not null default now()
);

create table public.academic_settings (
  singleton boolean primary key default true check (singleton),
  current_academic_year smallint check (current_academic_year between 2400 and 2700),
  updated_at timestamptz not null default now()
);

create table private.authentication_sessions (
  session_id_hash char(64) primary key
    check (session_id_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid not null references public.accounts (id),
  audience text not null check (audience in ('student', 'admin')),
  csrf_token text not null check (length(csrf_token) >= 32),
  provider_access_token text not null,
  provider_refresh_token text not null,
  provider_token_expires_at timestamptz not null,
  created_at timestamptz not null,
  last_activity_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revocation_reason text,
  constraint authentication_sessions_time_order_valid check (
    last_activity_at >= created_at and absolute_expires_at > created_at
  ),
  constraint authentication_sessions_revocation_complete check (
    (revoked_at is null and revocation_reason is null)
    or (revoked_at is not null and revocation_reason is not null)
  )
);

create index authentication_sessions_active_account_idx
  on private.authentication_sessions (account_id, created_at desc)
  where revoked_at is null;

create index authentication_sessions_expiry_idx
  on private.authentication_sessions (absolute_expires_at)
  where revoked_at is null;

create table private.authentication_rate_limits (
  key_kind text not null check (key_kind in ('account', 'source')),
  key_hash char(64) not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (key_kind, key_hash)
);

create table private.authentication_audit_events (
  id bigint generated always as identity primary key,
  account_id uuid references public.accounts (id),
  event_type text not null,
  source_key_hash char(64)
    check (source_key_hash is null or source_key_hash ~ '^[0-9a-f]{64}$'),
  error_code text,
  occurred_at timestamptz not null default now()
);

create index authentication_audit_events_account_time_idx
  on private.authentication_audit_events (account_id, occurred_at desc);

revoke all on table public.people from anon, authenticated;
revoke all on table public.students from anon, authenticated;
revoke all on table public.accounts from anon, authenticated;
revoke all on table public.account_roles from anon, authenticated;
revoke all on table public.academic_settings from anon, authenticated;
