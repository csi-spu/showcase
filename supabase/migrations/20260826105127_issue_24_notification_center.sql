create table private.notifications (
  id bigint generated always as identity primary key,
  public_id uuid not null unique default gen_random_uuid(),
  event_id bigint not null references private.outbox_events (id) on delete restrict,
  recipient_person_id uuid not null references public.people (id) on delete restrict,
  audience text not null check (audience in ('student', 'admin')),
  type text not null check (type in (
    'admin_correction_created',
    'attribution_invitation_accepted',
    'attribution_invitation_expired',
    'attribution_invitation_received',
    'attribution_invitation_rejected',
    'attribution_invitation_revoked',
    'attribution_withdrawn',
    'removal_request_approved',
    'removal_request_declined',
    'roster_batch_completed',
    'student_access_extended',
    'work_archive',
    'work_change_requested',
    'work_published',
    'work_restore_active',
    'work_restore_publication',
    'work_unpublish'
  )),
  parameters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(parameters) = 'object' and octet_length(parameters::text) <= 2048),
  target jsonb not null
    check (jsonb_typeof(target) = 'object' and octet_length(target::text) <= 1024),
  created_at timestamptz not null,
  read_at timestamptz,
  unique (event_id, recipient_person_id, audience, type),
  constraint notifications_read_time_valid check (read_at is null or read_at >= created_at)
);

create index notifications_inbox_idx
  on private.notifications (recipient_person_id, audience, created_at desc, id desc);

create index notifications_unread_inbox_idx
  on private.notifications (recipient_person_id, audience, created_at desc, id desc)
  where read_at is null;

create index notifications_expiry_idx on private.notifications (created_at, id);

create table private.notification_deliveries (
  event_id bigint primary key references private.outbox_events (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz not null,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  projected_count smallint check (projected_count between 0 and 21),
  last_error_code text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint notification_deliveries_processing_valid check (
    (status = 'processing' and lease_expires_at is not null)
    or (status <> 'processing' and lease_expires_at is null)
  ),
  constraint notification_deliveries_completion_valid check (
    (status = 'completed' and completed_at is not null and projected_count is not null)
    or (status <> 'completed' and completed_at is null and projected_count is null)
  )
);

create index notification_deliveries_claim_idx
  on private.notification_deliveries (next_attempt_at, event_id)
  where status in ('pending', 'processing');

create function private.enqueue_notification_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_type in (
    'admin_correction_created',
    'attribution_invitation_accepted',
    'attribution_invitation_created',
    'attribution_invitation_expired',
    'attribution_invitation_rejected',
    'attribution_invitation_revoked',
    'attribution_withdrawn',
    'removal_request_approved',
    'removal_request_declined',
    'roster_batch_completed',
    'student_access_extended',
    'work_archive',
    'work_restore_active',
    'work_restore_publication',
    'work_revision_changes_requested',
    'work_revision_published',
    'work_unpublish'
  ) then
    insert into private.notification_deliveries (
      event_id, next_attempt_at, created_at, updated_at
    ) values (new.id, new.occurred_at, new.occurred_at, new.occurred_at)
    on conflict (event_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger outbox_enqueue_notification_delivery
after insert on private.outbox_events
for each row execute function private.enqueue_notification_delivery();

insert into private.notification_deliveries (
  event_id, next_attempt_at, created_at, updated_at
)
select event.id, event.occurred_at, event.occurred_at, event.occurred_at
from private.outbox_events as event
where event.event_type in (
  'admin_correction_created',
  'attribution_invitation_accepted',
  'attribution_invitation_created',
  'attribution_invitation_expired',
  'attribution_invitation_rejected',
  'attribution_invitation_revoked',
  'attribution_withdrawn',
  'removal_request_approved',
  'removal_request_declined',
  'roster_batch_completed',
  'student_access_extended',
  'work_archive',
  'work_restore_active',
  'work_restore_publication',
  'work_revision_changes_requested',
  'work_revision_published',
  'work_unpublish'
)
on conflict (event_id) do nothing;

alter table private.notifications enable row level security;
alter table private.notification_deliveries enable row level security;

revoke all on table private.notifications from public, anon, authenticated;
revoke all on table private.notification_deliveries from public, anon, authenticated;
revoke all on function private.enqueue_notification_delivery() from public, anon, authenticated;
