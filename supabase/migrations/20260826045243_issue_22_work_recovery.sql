alter table public.works
  add column version bigint not null default 1 check (version > 0);

create table private.work_recovery_audits (
  id bigint generated always as identity primary key,
  public_id uuid not null unique default gen_random_uuid(),
  idempotency_key uuid not null unique,
  actor_account_id uuid not null references public.accounts (id) on delete restrict,
  work_id uuid not null references public.works (id) on delete restrict,
  action text not null check (
    action in ('archive', 'restore_active', 'restore_publication', 'unpublish')
  ),
  reason text not null check (
    reason = btrim(reason) and char_length(reason) between 10 and 1000
  ),
  previous_activity_state text not null check (previous_activity_state in ('active', 'archived')),
  previous_publication_state text not null
    check (previous_publication_state in ('never_published', 'published', 'unpublished')),
  resulting_activity_state text not null check (resulting_activity_state in ('active', 'archived')),
  resulting_publication_state text not null
    check (resulting_publication_state in ('never_published', 'published', 'unpublished')),
  expected_version bigint not null check (expected_version > 0),
  resulting_version bigint not null check (resulting_version = expected_version + 1),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  occurred_at timestamptz not null
);

create index work_recovery_audits_work_time_idx
  on private.work_recovery_audits (work_id, occurred_at desc, id desc);

create index work_recovery_audits_actor_time_idx
  on private.work_recovery_audits (actor_account_id, occurred_at desc, id desc);

create table private.removal_requests (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete restrict,
  revision_id uuid not null references private.work_revisions (id) on delete restrict,
  submitter_account_id uuid not null references public.accounts (id) on delete restrict,
  state text not null default 'pending'
    check (state in ('pending', 'cancelled', 'approved', 'declined')),
  reason text not null check (
    reason = btrim(reason) and char_length(reason) between 10 and 1000
  ),
  decision_reason text,
  decided_by_account_id uuid references public.accounts (id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null,
  resolved_at timestamptz,
  constraint removal_request_resolution_valid check (
    (state = 'pending' and resolved_at is null and decision_reason is null and decided_by_account_id is null)
    or (state = 'cancelled' and resolved_at is not null and decision_reason is null and decided_by_account_id is null)
    or (
      state = 'approved' and resolved_at is not null
      and decision_reason is null and decided_by_account_id is not null
    )
    or (
      state = 'declined' and resolved_at is not null and decided_by_account_id is not null
      and decision_reason = btrim(decision_reason)
      and char_length(decision_reason) between 10 and 1000
    )
  )
);

create unique index removal_requests_pending_revision_idx
  on private.removal_requests (revision_id) where state = 'pending';

create index removal_requests_work_history_idx
  on private.removal_requests (work_id, created_at desc, id desc);

create index removal_requests_submitter_history_idx
  on private.removal_requests (submitter_account_id, created_at desc, id desc);

create index removal_requests_admin_queue_idx
  on private.removal_requests (created_at, id) where state = 'pending';

create table private.removal_request_operations (
  idempotency_key uuid primary key,
  request_id uuid not null references private.removal_requests (id) on delete restrict,
  actor_account_id uuid not null references public.accounts (id) on delete restrict,
  operation text not null check (operation in ('created', 'cancelled', 'approved', 'declined')),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  resulting_state text not null check (
    resulting_state in ('pending', 'cancelled', 'approved', 'declined')
  ),
  resulting_version bigint not null check (resulting_version > 0),
  occurred_at timestamptz not null
);

create table private.attribution_removal_requests (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  invitation_id uuid not null references private.attribution_invitations (id) on delete restrict,
  work_id uuid not null references public.works (id) on delete restrict,
  revision_id uuid not null references private.work_revisions (id) on delete restrict,
  state text not null default 'pending' check (state in ('pending', 'accepted', 'declined')),
  reason text not null check (
    reason = btrim(reason) and char_length(reason) between 10 and 1000
  ),
  decision_reason text,
  decided_by_account_id uuid references public.accounts (id) on delete restrict,
  correction_revision_id uuid unique references private.work_revisions (id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null,
  resolved_at timestamptz,
  constraint attribution_removal_resolution_valid check (
    (state = 'pending' and resolved_at is null and decision_reason is null
      and decided_by_account_id is null and correction_revision_id is null)
    or (state = 'accepted' and resolved_at is not null and decision_reason is null
      and decided_by_account_id is not null and correction_revision_id is not null)
    or (state = 'declined' and resolved_at is not null and decided_by_account_id is not null
      and correction_revision_id is null and decision_reason = btrim(decision_reason)
      and char_length(decision_reason) between 10 and 1000)
  )
);

create unique index attribution_removal_pending_target_idx
  on private.attribution_removal_requests (invitation_id, revision_id) where state = 'pending';

create index attribution_removal_admin_queue_idx
  on private.attribution_removal_requests (created_at, id) where state = 'pending';

create index attribution_removal_work_history_idx
  on private.attribution_removal_requests (work_id, created_at desc, id desc);

create table private.attribution_removal_operations (
  idempotency_key uuid primary key,
  request_id uuid not null references private.attribution_removal_requests (id) on delete restrict,
  actor_account_id uuid references public.accounts (id) on delete restrict,
  operation text not null check (operation in ('created', 'accepted', 'declined')),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  resulting_state text not null check (resulting_state in ('pending', 'accepted', 'declined')),
  resulting_version bigint not null check (resulting_version > 0),
  occurred_at timestamptz not null
);

create index attribution_removal_operations_request_time_idx
  on private.attribution_removal_operations (request_id, occurred_at desc);

create index removal_request_operations_request_time_idx
  on private.removal_request_operations (request_id, occurred_at desc);

alter table private.work_recovery_audits enable row level security;
alter table private.removal_requests enable row level security;
alter table private.removal_request_operations enable row level security;
alter table private.attribution_removal_requests enable row level security;
alter table private.attribution_removal_operations enable row level security;

revoke all on table private.work_recovery_audits from public, anon, authenticated;
revoke all on table private.removal_requests from public, anon, authenticated;
revoke all on table private.removal_request_operations from public, anon, authenticated;
revoke all on table private.attribution_removal_requests from public, anon, authenticated;
revoke all on table private.attribution_removal_operations from public, anon, authenticated;

create function private.prevent_work_recovery_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'WORK_RECOVERY_HISTORY_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger work_recovery_audits_immutable
before update or delete on private.work_recovery_audits
for each row execute function private.prevent_work_recovery_history_mutation();

create trigger removal_request_operations_immutable
before update or delete on private.removal_request_operations
for each row execute function private.prevent_work_recovery_history_mutation();

create trigger attribution_removal_operations_immutable
before update or delete on private.attribution_removal_operations
for each row execute function private.prevent_work_recovery_history_mutation();

revoke all on function private.prevent_work_recovery_history_mutation()
  from public, anon, authenticated;
