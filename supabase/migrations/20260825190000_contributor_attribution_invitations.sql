create table private.attribution_invitations (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete restrict,
  kind text not null check (kind in ('account', 'external')),
  invitee_person_id uuid references public.people (id),
  accepted_person_id uuid references public.people (id),
  state text not null default 'pending'
    check (state in ('pending', 'accepted', 'rejected', 'revoked', 'expired', 'withdrawn')),
  proposed_attribution_name text,
  proposed_contribution_role text,
  proposed_affiliation text,
  attribution_name text,
  study_year smallint,
  contribution_role text,
  affiliation text,
  public_attribution_consented_at timestamptz,
  invitation_token_hash char(64) unique,
  invitation_token_exchanged_at timestamptz,
  recovery_code_hash char(64) unique,
  expires_at timestamptz not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  resolved_at timestamptz,
  constraint attribution_invitation_kind_valid check (
    (
      kind = 'account'
      and invitee_person_id is not null
      and invitation_token_hash is null
      and proposed_attribution_name is null
      and proposed_contribution_role is null
      and proposed_affiliation is null
    )
    or (
      kind = 'external'
      and invitation_token_hash ~ '^[0-9a-f]{64}$'
      and proposed_attribution_name = btrim(proposed_attribution_name)
      and char_length(proposed_attribution_name) between 1 and 100
      and proposed_contribution_role = btrim(proposed_contribution_role)
      and char_length(proposed_contribution_role) between 1 and 100
      and (
        proposed_affiliation is null
        or (
          proposed_affiliation = btrim(proposed_affiliation)
          and char_length(proposed_affiliation) between 1 and 150
        )
      )
    )
  ),
  constraint attribution_invitation_acceptance_valid check (
    (
      state <> 'accepted' and state <> 'withdrawn'
      and attribution_name is null
      and study_year is null
      and contribution_role is null
      and affiliation is null
      and public_attribution_consented_at is null
      and recovery_code_hash is null
    )
    or (
      state in ('accepted', 'withdrawn')
      and attribution_name = btrim(attribution_name)
      and char_length(attribution_name) between 1 and 100
      and public_attribution_consented_at is not null
      and (
        (
          kind = 'account'
          and accepted_person_id = invitee_person_id
          and study_year between 1 and 8
          and contribution_role is null
          and affiliation is null
          and recovery_code_hash is null
        )
        or (
          kind = 'external'
          and accepted_person_id is not null
          and study_year is null
          and contribution_role = btrim(contribution_role)
          and char_length(contribution_role) between 1 and 100
          and (
            affiliation is null
            or (affiliation = btrim(affiliation) and char_length(affiliation) between 1 and 150)
          )
          and recovery_code_hash ~ '^[0-9a-f]{64}$'
        )
      )
    )
  ),
  constraint attribution_invitation_resolution_valid check (
    (state = 'pending' and resolved_at is null)
    or (state <> 'pending' and resolved_at is not null)
  )
);

create unique index attribution_invitations_pending_person_work_idx
  on private.attribution_invitations (work_id, invitee_person_id)
  where state = 'pending' and invitee_person_id is not null;

create index attribution_invitations_work_history_idx
  on private.attribution_invitations (work_id, created_at desc, id desc);

create index attribution_invitations_recipient_pending_idx
  on private.attribution_invitations (invitee_person_id, created_at desc, id desc)
  where state = 'pending';

create index attribution_invitations_active_work_idx
  on private.attribution_invitations (work_id)
  where state in ('pending', 'accepted');

create table private.attribution_invitation_sessions (
  session_hash char(64) primary key check (session_hash ~ '^[0-9a-f]{64}$'),
  invitation_id uuid not null references private.attribution_invitations (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  revoked_at timestamptz
);

create index attribution_invitation_sessions_invitation_idx
  on private.attribution_invitation_sessions (invitation_id, expires_at desc);

create table private.attribution_invitation_operations (
  idempotency_key uuid primary key,
  invitation_id uuid references private.attribution_invitations (id) on delete restrict,
  actor_account_id uuid references public.accounts (id),
  operation text not null check (
    operation in (
      'account_invitation_created',
      'external_invitation_created',
      'invitation_accepted',
      'invitation_rejected',
      'invitation_revoked',
      'attribution_withdrawn'
    )
  ),
  request_payload jsonb not null,
  resulting_state text,
  resulting_version bigint,
  occurred_at timestamptz not null,
  constraint attribution_invitation_operation_result_valid check (
    (invitation_id is null and resulting_state is null and resulting_version is null)
    or (
      invitation_id is not null
      and resulting_state in ('pending', 'accepted', 'rejected', 'revoked', 'expired', 'withdrawn')
      and resulting_version > 0
    )
  )
);

create index attribution_invitation_operations_invitation_time_idx
  on private.attribution_invitation_operations (invitation_id, occurred_at desc)
  where invitation_id is not null;

create table private.attribution_account_lookup_rate_limits (
  actor_account_id uuid primary key references public.accounts (id) on delete cascade,
  window_started_at timestamptz not null,
  attempt_count smallint not null check (attempt_count between 1 and 32767)
);

create table private.attribution_source_lookup_rate_limits (
  source_key_hash char(64) primary key check (source_key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempt_count smallint not null check (attempt_count between 1 and 32767)
);

alter table private.attribution_invitations enable row level security;
alter table private.attribution_invitation_sessions enable row level security;
alter table private.attribution_invitation_operations enable row level security;
alter table private.attribution_account_lookup_rate_limits enable row level security;
alter table private.attribution_source_lookup_rate_limits enable row level security;

revoke all on table private.attribution_invitations from public, anon, authenticated;
revoke all on table private.attribution_invitation_sessions from public, anon, authenticated;
revoke all on table private.attribution_invitation_operations from public, anon, authenticated;
revoke all on table private.attribution_account_lookup_rate_limits from public, anon, authenticated;
revoke all on table private.attribution_source_lookup_rate_limits from public, anon, authenticated;
