-- Phase A: additive schema and compatibility backfill for issue #56.
-- Legacy invitation tables and secrets intentionally remain usable until the cutover migration.

alter table private.work_drafts
  alter column title drop not null,
  alter column summary drop not null,
  alter column description drop not null,
  alter column category drop not null,
  alter column academic_year drop not null,
  alter column semester drop not null,
  add column lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'retained')),
  add column submitter_study_year smallint
    check (submitter_study_year between 1 and 4);

update private.work_drafts as draft
set lifecycle_state = 'retained'
from public.works as work
join private.work_revisions as revision on revision.id = work.published_revision_id
where draft.work_id = work.id
  and revision.author_kind = 'student_submission'
  and revision.status = 'approved'
  and revision.draft_version = draft.version
  and draft.base_published_revision_id is distinct from work.published_revision_id;

create index work_drafts_active_updated_idx
  on private.work_drafts (updated_at desc, work_id)
  where lifecycle_state = 'active';

alter table private.work_operations
  drop constraint work_operations_operation_check,
  add constraint work_operations_operation_check check (
    operation in (
      'work_created',
      'work_draft_updated',
      'published_work_draft_seeded',
      'work_draft_rebased',
      'work_media_attached'
    )
  );

alter table public.works
  add column archive_source text,
  add constraint works_archive_source_valid check (
    (activity_state = 'active' and archive_source is null)
    or (activity_state = 'archived' and archive_source in ('admin', 'submitter'))
  ) not valid;

update public.works
set archive_source = 'admin'
where activity_state = 'archived' and archive_source is null;

alter table public.works validate constraint works_archive_source_valid;

create index works_submitter_current_page_idx
  on public.works (submitter_person_id, updated_at desc, public_id desc)
  where activity_state = 'active';

create index works_submitter_saved_page_idx
  on public.works (submitter_person_id, updated_at desc, public_id desc)
  where activity_state = 'archived'
    and publication_state = 'never_published'
    and archive_source = 'submitter';

create index works_submitter_workspace_summary_idx
  on public.works (submitter_person_id, activity_state, publication_state);

create table private.work_saved_draft_operations (
  idempotency_key uuid primary key,
  actor_account_id uuid not null references public.accounts (id) on delete restrict,
  work_id uuid not null references public.works (id) on delete restrict,
  operation text not null check (operation in ('archive_saved_draft', 'restore_saved_draft')),
  request_fingerprint char(64) not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  resulting_work_version bigint not null check (resulting_work_version > 0),
  occurred_at timestamptz not null
);

create index work_saved_draft_operations_work_time_idx
  on private.work_saved_draft_operations (work_id, occurred_at desc, idempotency_key);

create table private.work_draft_contributors (
  id bigint generated always as identity primary key,
  public_id uuid not null unique default gen_random_uuid(),
  work_id uuid not null references private.work_drafts (work_id) on delete cascade,
  kind text not null check (kind in ('account', 'external')),
  person_id uuid not null references public.people (id) on delete restrict,
  attribution_name text not null check (
    attribution_name = btrim(attribution_name)
    and char_length(attribution_name) between 1 and 100
  ),
  contribution_role text check (
    contribution_role is null
    or (
      contribution_role = btrim(contribution_role)
      and char_length(contribution_role) between 1 and 100
    )
  ),
  position smallint not null check (position between 1 and 20),
  legacy_invitation_id uuid unique
    references private.attribution_invitations (id) on delete restrict,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  removed_at timestamptz
);

create unique index work_draft_contributors_account_person_idx
  on private.work_draft_contributors (work_id, person_id)
  where kind = 'account' and removed_at is null;

create unique index work_draft_contributors_active_position_idx
  on private.work_draft_contributors (work_id, position)
  where removed_at is null;

create index work_draft_contributors_person_idx
  on private.work_draft_contributors (person_id)
  where removed_at is null;

create function private.validate_work_draft_contributor_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'account' and not exists (
    select 1 from public.accounts as account where account.person_id = new.person_id
  ) then
    raise exception 'WORK_DRAFT_ACCOUNT_CONTRIBUTOR_REQUIRES_ACCOUNT' using errcode = '23514';
  end if;
  if new.kind = 'external' and exists (
    select 1 from public.accounts as account where account.person_id = new.person_id
  ) then
    raise exception 'WORK_DRAFT_EXTERNAL_CONTRIBUTOR_MUST_NOT_HAVE_ACCOUNT' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger work_draft_contributors_identity_valid
before insert or update of kind, person_id on private.work_draft_contributors
for each row execute function private.validate_work_draft_contributor_identity();

create table private.work_contributor_candidates (
  reference uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  unique (reference, work_id, person_id)
);

create index work_contributor_candidates_expiry_idx
  on private.work_contributor_candidates (expires_at, reference);

create table private.work_draft_contributor_operations (
  idempotency_key uuid primary key,
  actor_account_id uuid not null references public.accounts (id) on delete restrict,
  work_id uuid not null references public.works (id) on delete restrict,
  contributor_id bigint references private.work_draft_contributors (id) on delete restrict,
  operation text not null check (operation in (
    'account_contributor_added',
    'external_contributor_added',
    'draft_contributor_removed'
  )),
  request_fingerprint char(64) not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  resulting_version bigint not null check (resulting_version > 0),
  occurred_at timestamptz not null
);

create index work_draft_contributor_operations_work_time_idx
  on private.work_draft_contributor_operations (work_id, occurred_at desc, idempotency_key);

create table private.work_draft_contributor_backfill_runs (
  id bigint generated always as identity primary key,
  batch_size integer not null check (batch_size between 1 and 5000),
  accepted_source_count integer not null check (accepted_source_count >= 0),
  pending_source_count integer not null check (pending_source_count >= 0),
  terminal_excluded_count integer not null check (terminal_excluded_count >= 0),
  inserted_count integer not null check (inserted_count >= 0),
  retained_count integer not null check (retained_count >= 0),
  missing_draft_count integer not null check (missing_draft_count >= 0),
  invalid_source_count integer not null check (invalid_source_count >= 0),
  over_limit_count integer not null check (over_limit_count >= 0),
  remaining_count integer not null check (remaining_count >= 0),
  occurred_at timestamptz not null
);

create table private.work_draft_contributor_backfill_items (
  invitation_id uuid primary key references private.attribution_invitations(id) on delete restrict,
  source_state text not null check (
    source_state in ('pending', 'accepted', 'rejected', 'revoked', 'expired', 'withdrawn')
  ),
  outcome text not null check (
    outcome in (
      'inserted',
      'retained',
      'excluded_terminal',
      'missing_draft',
      'invalid_source',
      'over_limit'
    )
  ),
  processed_at timestamptz not null
);

create index attribution_invitations_issue_56_backfill_order_idx
  on private.attribution_invitations (created_at, id);
create index attribution_invitations_issue_56_work_order_idx
  on private.attribution_invitations (work_id, created_at, id)
  where state in ('accepted', 'pending');

create function private.backfill_work_draft_contributors(p_batch_size integer default 500)
returns table (
  accepted_source_count integer,
  pending_source_count integer,
  terminal_excluded_count integer,
  inserted_count integer,
  retained_count integer,
  missing_draft_count integer,
  invalid_source_count integer,
  over_limit_count integer,
  remaining_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate record;
  contributor_person_id uuid;
  contributor_name text;
  v_accepted_source_count integer := 0;
  v_pending_source_count integer := 0;
  v_terminal_excluded_count integer := 0;
  v_inserted_count integer := 0;
  v_retained_count integer := 0;
  v_missing_draft_count integer := 0;
  v_invalid_source_count integer := 0;
  v_over_limit_count integer := 0;
  v_remaining_count integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 5000 then
    raise exception 'ISSUE_56_BACKFILL_BATCH_SIZE_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('issue-56-work-draft-contributor-backfill', 0));

  for candidate in
    with batch as materialized (
      select invitation.id
      from private.attribution_invitations as invitation
      where not exists (
        select 1 from private.work_draft_contributor_backfill_items as processed
        where processed.invitation_id = invitation.id
      )
      order by invitation.created_at, invitation.id
      limit p_batch_size
      for update skip locked
    )
    select invitation.id as invitation_id,
      invitation.work_id,
      invitation.kind,
      invitation.state,
      invitation.accepted_person_id,
      invitation.invitee_person_id,
      invitation.attribution_name,
      invitation.proposed_attribution_name,
      invitation.contribution_role,
      invitation.proposed_contribution_role,
      invitation.created_at,
      invitation.updated_at,
      person_name.first_name_th,
      person_name.last_name_th,
      draft.work_id is not null as has_draft,
      case when invitation.state in ('accepted', 'pending') then (
        select count(*)::integer
        from private.attribution_invitations as prior
        where prior.work_id = invitation.work_id
          and prior.state in ('accepted', 'pending')
          and (prior.created_at, prior.id) <= (invitation.created_at, invitation.id)
      ) else 0 end as contributor_position
    from batch
    join private.attribution_invitations as invitation on invitation.id = batch.id
    left join private.person_names as person_name
      on person_name.person_id = coalesce(
        invitation.accepted_person_id,
        invitation.invitee_person_id
      )
    left join private.work_drafts as draft on draft.work_id = invitation.work_id
    order by invitation.created_at, invitation.id
  loop
    if candidate.state = 'accepted' then
      v_accepted_source_count := v_accepted_source_count + 1;
    elsif candidate.state = 'pending' then
      v_pending_source_count := v_pending_source_count + 1;
    else
      v_terminal_excluded_count := v_terminal_excluded_count + 1;
      insert into private.work_draft_contributor_backfill_items (
        invitation_id, source_state, outcome, processed_at
      ) values (candidate.invitation_id, candidate.state, 'excluded_terminal', now());
      continue;
    end if;

    if not candidate.has_draft then
      v_missing_draft_count := v_missing_draft_count + 1;
      insert into private.work_draft_contributor_backfill_items (
        invitation_id, source_state, outcome, processed_at
      ) values (candidate.invitation_id, candidate.state, 'missing_draft', now());
      continue;
    end if;

    if exists (
      select 1
      from private.work_draft_contributors as contributor
      where contributor.legacy_invitation_id = candidate.invitation_id
    ) then
      v_retained_count := v_retained_count + 1;
      insert into private.work_draft_contributor_backfill_items (
        invitation_id, source_state, outcome, processed_at
      ) values (candidate.invitation_id, candidate.state, 'retained', now());
      continue;
    end if;

    if candidate.contributor_position > 20 then
      v_over_limit_count := v_over_limit_count + 1;
      insert into private.work_draft_contributor_backfill_items (
        invitation_id, source_state, outcome, processed_at
      ) values (candidate.invitation_id, candidate.state, 'over_limit', now());
      continue;
    end if;

    contributor_person_id := coalesce(
      candidate.accepted_person_id,
      candidate.invitee_person_id
    );
    contributor_name := coalesce(
      candidate.attribution_name,
      candidate.proposed_attribution_name,
      concat_ws(' ', candidate.first_name_th, candidate.last_name_th)
    );
    contributor_name := nullif(btrim(contributor_name), '');

    if contributor_name is null
      or char_length(contributor_name) > 100
    then
      v_invalid_source_count := v_invalid_source_count + 1;
      insert into private.work_draft_contributor_backfill_items (
        invitation_id, source_state, outcome, processed_at
      ) values (candidate.invitation_id, candidate.state, 'invalid_source', now());
      continue;
    end if;

    if candidate.kind = 'external' and contributor_person_id is null then
      insert into public.people (created_at)
      values (candidate.created_at)
      returning id into contributor_person_id;
    end if;

    if contributor_person_id is null then
      v_invalid_source_count := v_invalid_source_count + 1;
      insert into private.work_draft_contributor_backfill_items (
        invitation_id, source_state, outcome, processed_at
      ) values (candidate.invitation_id, candidate.state, 'invalid_source', now());
      continue;
    end if;

    if candidate.kind = 'account' and exists (
      select 1 from private.work_draft_contributors as contributor
      where contributor.work_id = candidate.work_id
        and contributor.kind = 'account'
        and contributor.person_id = contributor_person_id
        and contributor.removed_at is null
    ) then
      v_invalid_source_count := v_invalid_source_count + 1;
      insert into private.work_draft_contributor_backfill_items (
        invitation_id, source_state, outcome, processed_at
      ) values (candidate.invitation_id, candidate.state, 'invalid_source', now());
      continue;
    end if;

    insert into private.work_draft_contributors (
      work_id,
      kind,
      person_id,
      attribution_name,
      contribution_role,
      position,
      legacy_invitation_id,
      created_at,
      updated_at
    ) values (
      candidate.work_id,
      candidate.kind,
      contributor_person_id,
      contributor_name,
      case
        when candidate.kind = 'external'
          then coalesce(candidate.contribution_role, candidate.proposed_contribution_role)
        else candidate.contribution_role
      end,
      candidate.contributor_position,
      candidate.invitation_id,
      candidate.created_at,
      candidate.updated_at
    );
    v_inserted_count := v_inserted_count + 1;
    insert into private.work_draft_contributor_backfill_items (
      invitation_id, source_state, outcome, processed_at
    ) values (candidate.invitation_id, candidate.state, 'inserted', now());
  end loop;

  select count(*)::integer into v_remaining_count
  from private.attribution_invitations as invitation
  where not exists (
    select 1 from private.work_draft_contributor_backfill_items as processed
    where processed.invitation_id = invitation.id
  );

  insert into private.work_draft_contributor_backfill_runs (
    batch_size,
    accepted_source_count,
    pending_source_count,
    terminal_excluded_count,
    inserted_count,
    retained_count,
    missing_draft_count,
    invalid_source_count,
    over_limit_count,
    remaining_count,
    occurred_at
  ) values (
    p_batch_size,
    v_accepted_source_count,
    v_pending_source_count,
    v_terminal_excluded_count,
    v_inserted_count,
    v_retained_count,
    v_missing_draft_count,
    v_invalid_source_count,
    v_over_limit_count,
    v_remaining_count,
    now()
  );

  return query select
    v_accepted_source_count,
    v_pending_source_count,
    v_terminal_excluded_count,
    v_inserted_count,
    v_retained_count,
    v_missing_draft_count,
    v_invalid_source_count,
    v_over_limit_count,
    v_remaining_count;
end;
$$;

alter table private.work_revision_attributions
  add column attribution_public_id uuid not null unique default gen_random_uuid(),
  add column attribution_model_version smallint not null default 1
    check (attribution_model_version in (1, 2)),
  drop constraint work_revision_attribution_kind_valid,
  add constraint work_revision_attribution_kind_valid check (
    (
      attribution_model_version = 1
      and (
        (
          kind in ('submitter', 'account')
          and person_id is not null
          and study_year is not null
          and contribution_role is null
          and affiliation is null
        )
        or (
          kind = 'external'
          and person_id is not null
          and study_year is null
          and contribution_role is not null
        )
      )
    )
    or (
      attribution_model_version = 2
      and (
        (
          kind = 'submitter'
          and person_id is not null
          and study_year between 1 and 4
          and contribution_role is null
          and affiliation is null
        )
        or (
          kind in ('account', 'external')
          and person_id is not null
          and study_year is null
          and contribution_role is not null
          and affiliation is null
        )
      )
    )
  );

create index work_revision_attributions_public_target_idx
  on private.work_revision_attributions (revision_id, attribution_public_id);

alter table private.attribution_removal_requests
  alter column invitation_id drop not null,
  add column attribution_public_id uuid unique
    references private.work_revision_attributions (attribution_public_id) on delete restrict,
  add constraint attribution_removal_target_valid check (
    (invitation_id is not null) <> (attribution_public_id is not null)
  );

create index attribution_removal_target_history_idx
  on private.attribution_removal_requests (attribution_public_id, created_at desc, id desc)
  where attribution_public_id is not null;

create table private.attribution_removal_rate_limits (
  dimension text not null check (dimension in ('source', 'target')),
  key_hash char(64) not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempt_count smallint not null check (attempt_count between 1 and 32767),
  primary key (dimension, key_hash)
);

alter table private.notifications
  drop constraint notifications_type_check,
  add constraint notifications_type_check check (type in (
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
    'work_attribution_removed',
    'work_change_requested',
    'work_published',
    'work_restore_active',
    'work_restore_publication',
    'work_unpublish'
  ));

alter table private.notification_deliveries
  drop constraint notification_deliveries_projected_count_check,
  add constraint notification_deliveries_projected_count_check
    check (projected_count between 0 and 41);

create or replace function private.enqueue_notification_delivery()
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
    'work_attribution_removed',
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

alter table private.work_draft_contributors enable row level security;
alter table private.work_saved_draft_operations enable row level security;
alter table private.work_contributor_candidates enable row level security;
alter table private.work_draft_contributor_operations enable row level security;
alter table private.work_draft_contributor_backfill_runs enable row level security;
alter table private.work_draft_contributor_backfill_items enable row level security;
alter table private.attribution_removal_rate_limits enable row level security;

revoke all on table private.work_draft_contributors from public, anon, authenticated;
revoke all on table private.work_saved_draft_operations from public, anon, authenticated;
revoke all on table private.work_contributor_candidates from public, anon, authenticated;
revoke all on table private.work_draft_contributor_operations from public, anon, authenticated;
revoke all on table private.work_draft_contributor_backfill_runs from public, anon, authenticated;
revoke all on table private.work_draft_contributor_backfill_items from public, anon, authenticated;
revoke all on table private.attribution_removal_rate_limits from public, anon, authenticated;
revoke all on function private.backfill_work_draft_contributors(integer)
  from public, anon, authenticated;
revoke all on function private.validate_work_draft_contributor_identity()
  from public, anon, authenticated;
