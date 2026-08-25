create table private.person_names (
  person_id uuid primary key references public.people (id),
  first_name_th text not null check (first_name_th = btrim(first_name_th) and first_name_th <> ''),
  last_name_th text not null check (last_name_th = btrim(last_name_th) and last_name_th <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.roster_batches (
  id uuid primary key default gen_random_uuid(),
  uploader_account_id uuid not null references public.accounts (id),
  entry_year smallint not null check (entry_year between 2400 and 2700),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'completed_with_errors')),
  total_row_count integer not null check (total_row_count between 0 and 10000),
  processed_row_count integer not null default 0 check (processed_row_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  uploaded_at timestamptz not null,
  completed_at timestamptz,
  constraint roster_batch_counts_valid check (
    processed_row_count = created_count + unchanged_count + failed_count
    and processed_row_count <= total_row_count
  ),
  constraint roster_batch_completion_valid check (
    (status in ('pending', 'processing') and completed_at is null)
    or (status in ('completed', 'completed_with_errors') and completed_at is not null)
  )
);

create index roster_batches_uploader_time_idx
  on private.roster_batches (uploader_account_id, uploaded_at desc);

create table private.roster_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references private.roster_batches (id) on delete cascade,
  row_number integer not null check (row_number >= 2),
  student_id char(8) not null check (student_id ~ '^[0-9]{8}$'),
  student_id_hash char(64) not null check (student_id_hash ~ '^[0-9a-f]{64}$'),
  synthetic_identity text not null check (synthetic_identity ~ '^[0-9a-f]{64}@auth[.]invalid$'),
  provider_user_id uuid not null,
  first_name_th text not null check (first_name_th = btrim(first_name_th) and first_name_th <> ''),
  last_name_th text not null check (last_name_th = btrim(last_name_th) and last_name_th <> ''),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'created', 'unchanged', 'failed')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  error_code text,
  lease_until timestamptz,
  next_attempt_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (batch_id, row_number),
  unique (batch_id, student_id_hash),
  constraint roster_row_processing_valid check (
    (status = 'processing' and lease_until is not null)
    or (status <> 'processing' and lease_until is null)
  ),
  constraint roster_row_completion_valid check (
    (status in ('created', 'unchanged', 'failed') and processed_at is not null)
    or (status in ('pending', 'processing') and processed_at is null)
  )
);

create index roster_rows_claim_idx
  on private.roster_rows (next_attempt_at, created_at)
  where status in ('pending', 'processing');

create table private.roster_audit_events (
  id bigint generated always as identity primary key,
  batch_id uuid not null references private.roster_batches (id),
  actor_account_id uuid not null references public.accounts (id),
  event_type text not null check (event_type in ('roster_batch_created', 'roster_batch_completed')),
  occurred_at timestamptz not null
);

create index roster_audit_events_batch_time_idx
  on private.roster_audit_events (batch_id, occurred_at);

create table private.outbox_events (
  id bigint generated always as identity primary key,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  occurred_at timestamptz not null,
  published_at timestamptz,
  unique (aggregate_type, aggregate_id, event_type)
);

create index outbox_events_pending_idx
  on private.outbox_events (occurred_at, id)
  where published_at is null;

revoke all on table private.person_names from public, anon, authenticated;
revoke all on table private.roster_batches from public, anon, authenticated;
revoke all on table private.roster_rows from public, anon, authenticated;
revoke all on table private.roster_audit_events from public, anon, authenticated;
revoke all on table private.outbox_events from public, anon, authenticated;
