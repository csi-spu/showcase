-- Phase B cutover machinery for issue #56. Applying this migration is safe while
-- legacy Core instances are still serving. An operator executes the function only
-- after the compatible Core release is healthy and legacy instances are drained.

create table private.issue_56_contributor_cutover_state (
  singleton boolean primary key default true check (singleton),
  completed_at timestamptz,
  invalidated_invitation_count integer not null default 0
    check (invalidated_invitation_count >= 0),
  deleted_session_count integer not null default 0 check (deleted_session_count >= 0)
);

insert into private.issue_56_contributor_cutover_state (singleton) values (true);

create function private.prevent_legacy_attribution_invitation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'LEGACY_ATTRIBUTION_INVITATION_READ_ONLY' using errcode = '23514';
end;
$$;

create function private.execute_issue_56_contributor_cutover()
returns table (
  completed_at timestamptz,
  invalidated_invitation_count integer,
  deleted_session_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  state_row private.issue_56_contributor_cutover_state%rowtype;
  v_invalidated_invitation_count integer := 0;
  v_deleted_session_count integer := 0;
  v_completed_at timestamptz := now();
begin
  -- Serialize with the batch worker, then stop legacy writers before the final
  -- completeness check. Reads remain available throughout the transaction.
  perform pg_advisory_xact_lock(
    hashtextextended('issue-56-work-draft-contributor-backfill', 0)
  );
  lock table private.attribution_invitations in share row exclusive mode;
  lock table private.attribution_invitation_sessions in share row exclusive mode;
  lock table private.attribution_invitation_operations in share row exclusive mode;

  select * into state_row
  from private.issue_56_contributor_cutover_state
  where singleton = true
  for update;

  if state_row.completed_at is not null then
    return query select
      state_row.completed_at,
      state_row.invalidated_invitation_count,
      state_row.deleted_session_count;
    return;
  end if;

  if exists (
    select 1
    from private.attribution_invitations as invitation
    where not exists (
      select 1 from private.work_draft_contributor_backfill_items as processed
      where processed.invitation_id = invitation.id
    )
  ) then
    raise exception 'ISSUE_56_BACKFILL_INCOMPLETE' using errcode = '55000';
  end if;

  if exists (
    select 1
    from private.work_draft_contributor_backfill_items
    where outcome in ('missing_draft', 'invalid_source', 'over_limit')
  ) then
    raise exception 'ISSUE_56_BACKFILL_REQUIRES_RESOLUTION' using errcode = '55000';
  end if;

  alter table private.attribution_invitations
    drop constraint attribution_invitation_kind_valid,
    drop constraint attribution_invitation_acceptance_valid;

  update private.attribution_invitations
  set invitation_token_hash = null,
    recovery_code_hash = null,
    updated_at = greatest(updated_at, v_completed_at)
  where invitation_token_hash is not null or recovery_code_hash is not null;
  get diagnostics v_invalidated_invitation_count = row_count;

  delete from private.attribution_invitation_sessions;
  get diagnostics v_deleted_session_count = row_count;

  create trigger attribution_invitations_read_only
  before insert or update or delete on private.attribution_invitations
  for each row execute function private.prevent_legacy_attribution_invitation_mutation();

  create trigger attribution_invitation_sessions_read_only
  before insert or update or delete on private.attribution_invitation_sessions
  for each row execute function private.prevent_legacy_attribution_invitation_mutation();

  create trigger attribution_invitation_operations_read_only
  before insert or update or delete on private.attribution_invitation_operations
  for each row execute function private.prevent_legacy_attribution_invitation_mutation();

  update private.issue_56_contributor_cutover_state
  set completed_at = v_completed_at,
    invalidated_invitation_count = v_invalidated_invitation_count,
    deleted_session_count = v_deleted_session_count
  where singleton = true;

  return query select
    v_completed_at,
    v_invalidated_invitation_count,
    v_deleted_session_count;
end;
$$;

alter table private.issue_56_contributor_cutover_state enable row level security;

revoke all on table private.issue_56_contributor_cutover_state
  from public, anon, authenticated;
revoke all on function private.prevent_legacy_attribution_invitation_mutation()
  from public, anon, authenticated;
revoke all on function private.execute_issue_56_contributor_cutover()
  from public, anon, authenticated;
