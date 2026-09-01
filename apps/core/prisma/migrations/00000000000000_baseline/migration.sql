--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: are_valid_roster_entry_years(smallint[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.are_valid_roster_entry_years(candidate smallint[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO ''
    AS $$
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


--
-- Name: backfill_work_draft_contributors(integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.backfill_work_draft_contributors(p_batch_size integer DEFAULT 500) RETURNS TABLE(accepted_source_count integer, pending_source_count integer, terminal_excluded_count integer, inserted_count integer, retained_count integer, missing_draft_count integer, invalid_source_count integer, over_limit_count integer, remaining_count integer)
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: default_normalized_display_name(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.default_normalized_display_name() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.normalized_display_name is null
    or (tg_op = 'UPDATE' and new.display_name is distinct from old.display_name
      and new.normalized_display_name is not distinct from old.normalized_display_name)
  then
    new.normalized_display_name := lower(regexp_replace(
      normalize(btrim(new.display_name), NFKC), '[[:space:]]+', ' ', 'g'
    ));
  end if;
  return new;
end;
$$;


--
-- Name: enforce_immutable_work_revision_content(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_immutable_work_revision_content() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.work_id is distinct from old.work_id
    or new.revision_number is distinct from old.revision_number
    or new.base_published_revision_id is distinct from old.base_published_revision_id
    or new.draft_version is distinct from old.draft_version
    or new.author_kind is distinct from old.author_kind
    or new.title is distinct from old.title
    or new.summary is distinct from old.summary
    or new.description is distinct from old.description
    or new.category is distinct from old.category
    or new.academic_year is distinct from old.academic_year
    or new.semester is distinct from old.semester
    or new.submitted_at is distinct from old.submitted_at
  then
    raise exception 'WORK_REVISION_CONTENT_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;


--
-- Name: enforce_immutable_work_submitter(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_immutable_work_submitter() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.submitter_person_id is distinct from old.submitter_person_id then
    raise exception 'WORK_SUBMITTER_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;


--
-- Name: enforce_published_revision_membership(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_published_revision_membership() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.published_revision_id is not null
    and not exists (
      select 1
      from private.work_revisions as revision
      where revision.id = new.published_revision_id
        and revision.work_id = new.id
    )
  then
    raise exception 'WORK_PUBLISHED_REVISION_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;


--
-- Name: enforce_work_revision_membership(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_work_revision_membership() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.base_published_revision_id is not null
    and not exists (
      select 1
      from private.work_revisions as revision
      where revision.id = new.base_published_revision_id
        and revision.work_id = new.work_id
    )
  then
    raise exception 'WORK_BASE_REVISION_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;


--
-- Name: enqueue_public_cache_invalidation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enqueue_public_cache_invalidation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.payload ? 'cacheTargets'
    or new.event_type in ('public_profile_cache_invalidated', 'public_profile_visible')
  then
    update private.public_cache_version
    set version = greatest(version, new.id), updated_at = new.occurred_at
    where singleton;
    insert into private.cache_invalidation_deliveries (
      event_id, next_attempt_at, created_at, updated_at
    ) values (new.id, new.occurred_at, new.occurred_at, new.occurred_at)
    on conflict (event_id) do nothing;
  end if;
  return new;
end;
$$;


--
-- Name: execute_issue_56_contributor_cutover(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.execute_issue_56_contributor_cutover() RETURNS TABLE(completed_at timestamp with time zone, invalidated_invitation_count integer, deleted_session_count integer)
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: execute_roster_name_profile_cutover(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.execute_roster_name_profile_cutover() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: fill_legacy_profile_name_from_roster(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.fill_legacy_profile_name_from_roster() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: prevent_admin_correction_audit_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.prevent_admin_correction_audit_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception 'ADMIN_CORRECTION_AUDIT_IMMUTABLE' using errcode = '23514';
end;
$$;


--
-- Name: prevent_legacy_attribution_invitation_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.prevent_legacy_attribution_invitation_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception 'LEGACY_ATTRIBUTION_INVITATION_READ_ONLY' using errcode = '23514';
end;
$$;


--
-- Name: prevent_review_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.prevent_review_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception 'REVIEW_IMMUTABLE' using errcode = '23514';
end;
$$;


--
-- Name: prevent_work_recovery_history_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.prevent_work_recovery_history_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception 'WORK_RECOVERY_HISTORY_IMMUTABLE' using errcode = '23514';
end;
$$;


--
-- Name: prevent_work_revision_snapshot_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.prevent_work_revision_snapshot_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception 'WORK_REVISION_SNAPSHOT_IMMUTABLE' using errcode = '23514';
end;
$$;


--
-- Name: reconcile_public_cache_invalidations(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reconcile_public_cache_invalidations() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  inserted_count integer;
begin
  with inserted as (
    insert into private.cache_invalidation_deliveries (
      event_id, next_attempt_at, created_at, updated_at
    )
    select event.id, event.occurred_at, event.occurred_at, event.occurred_at
    from private.outbox_events as event
    where (event.payload ? 'cacheTargets'
      or event.event_type in ('public_profile_cache_invalidated', 'public_profile_visible'))
      and not exists (
        select 1 from private.cache_invalidation_deliveries as delivery
        where delivery.event_id = event.id
      )
    on conflict (event_id) do nothing
    returning event_id
  )
  select count(*)::integer into inserted_count from inserted;
  return inserted_count;
end;
$$;


--
-- Name: reconcile_tag_popularity(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reconcile_tag_popularity() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  changed_count integer;
begin
  with expected as (
    select tag.id, count(distinct catalog.work_id)::bigint as active_work_count
    from public.tags as tag
    left join private.published_revision_tags as published_tag on published_tag.tag_id = tag.id
    left join private.public_work_catalog as catalog
      on catalog.revision_id = published_tag.revision_id
    group by tag.id
  ), changed as (
    update public.tags as tag
    set active_work_count = expected.active_work_count
    from expected
    where tag.id = expected.id
      and tag.active_work_count is distinct from expected.active_work_count
    returning tag.id
  )
  select count(*)::integer into changed_count from changed;
  if changed_count > 0 then
    insert into private.outbox_events (
      aggregate_type, aggregate_id, event_type, payload, occurred_at
    ) values (
      'catalog_reconciliation', gen_random_uuid(), 'tag_popularity_reconciled',
      jsonb_build_object('cacheTargets', jsonb_build_object()), now()
    );
  end if;
  return changed_count;
end;
$$;


--
-- Name: sync_legacy_profile_name_from_roster(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.sync_legacy_profile_name_from_roster() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: validate_work_draft_contributor_identity(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.validate_work_draft_contributor_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: academic_year_change_audit_events; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.academic_year_change_audit_events (
    id bigint NOT NULL,
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    previous_academic_year smallint,
    current_academic_year smallint NOT NULL,
    expected_version integer NOT NULL,
    resulting_version integer NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT academic_year_change_audit_events_current_academic_year_check CHECK (((current_academic_year >= 2400) AND (current_academic_year <= 2700))),
    CONSTRAINT academic_year_change_audit_events_expected_version_check CHECK ((expected_version >= 0)),
    CONSTRAINT academic_year_change_audit_events_resulting_version_check CHECK ((resulting_version > 0)),
    CONSTRAINT academic_year_change_moves_forward CHECK (((previous_academic_year IS NULL) OR (current_academic_year > previous_academic_year)))
);


--
-- Name: academic_year_change_audit_events_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.academic_year_change_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.academic_year_change_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: admin_auth_identities; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_auth_identities (
    account_id uuid NOT NULL,
    admin_login_hash character(64) NOT NULL,
    synthetic_identity text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_auth_identities_admin_login_hash_check CHECK ((admin_login_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT admin_auth_identities_synthetic_identity_check CHECK ((synthetic_identity ~ '^[0-9a-f]{64}@admin[.]auth[.]invalid$'::text))
);


--
-- Name: admin_correction_audits; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_correction_audits (
    id bigint NOT NULL,
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    work_id uuid NOT NULL,
    base_revision_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    action text DEFAULT 'admin_correction_created'::text NOT NULL,
    reason text NOT NULL,
    diff_metadata jsonb NOT NULL,
    request_fingerprint character(64) NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT admin_correction_audits_action_check CHECK ((action = 'admin_correction_created'::text)),
    CONSTRAINT admin_correction_audits_diff_metadata_check CHECK (((jsonb_typeof(diff_metadata) = 'object'::text) AND (jsonb_typeof((diff_metadata -> 'fields'::text)) = 'array'::text) AND (jsonb_array_length((diff_metadata -> 'fields'::text)) > 0) AND (jsonb_typeof((diff_metadata -> 'categories'::text)) = 'array'::text) AND (jsonb_array_length((diff_metadata -> 'categories'::text)) > 0))),
    CONSTRAINT admin_correction_audits_reason_check CHECK (((reason = btrim(reason)) AND ((char_length(reason) >= 10) AND (char_length(reason) <= 1000)))),
    CONSTRAINT admin_correction_audits_request_fingerprint_check CHECK ((request_fingerprint ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: admin_correction_audits_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.admin_correction_audits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.admin_correction_audits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: attribution_account_lookup_rate_limits; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.attribution_account_lookup_rate_limits (
    actor_account_id uuid NOT NULL,
    window_started_at timestamp with time zone NOT NULL,
    attempt_count smallint NOT NULL,
    CONSTRAINT attribution_account_lookup_rate_limits_attempt_count_check CHECK (((attempt_count >= 1) AND (attempt_count <= 32767)))
);


--
-- Name: attribution_invitation_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.attribution_invitation_operations (
    idempotency_key uuid NOT NULL,
    invitation_id uuid,
    actor_account_id uuid,
    operation text NOT NULL,
    request_payload jsonb NOT NULL,
    resulting_state text,
    resulting_version bigint,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT attribution_invitation_operation_result_valid CHECK ((((invitation_id IS NULL) AND (resulting_state IS NULL) AND (resulting_version IS NULL)) OR ((invitation_id IS NOT NULL) AND (resulting_state = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'revoked'::text, 'expired'::text, 'withdrawn'::text])) AND (resulting_version > 0)))),
    CONSTRAINT attribution_invitation_operations_operation_check CHECK ((operation = ANY (ARRAY['account_invitation_created'::text, 'external_invitation_created'::text, 'invitation_accepted'::text, 'invitation_rejected'::text, 'invitation_revoked'::text, 'attribution_withdrawn'::text])))
);


--
-- Name: attribution_invitation_sessions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.attribution_invitation_sessions (
    session_hash character(64) NOT NULL,
    invitation_id uuid NOT NULL,
    account_id uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT attribution_invitation_sessions_session_hash_check CHECK ((session_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: attribution_invitations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.attribution_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    kind text NOT NULL,
    invitee_person_id uuid,
    accepted_person_id uuid,
    state text DEFAULT 'pending'::text NOT NULL,
    proposed_attribution_name text,
    proposed_contribution_role text,
    proposed_affiliation text,
    attribution_name text,
    study_year smallint,
    contribution_role text,
    affiliation text,
    public_attribution_consented_at timestamp with time zone,
    invitation_token_hash character(64),
    invitation_token_exchanged_at timestamp with time zone,
    recovery_code_hash character(64),
    expires_at timestamp with time zone NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT attribution_invitation_resolution_valid CHECK ((((state = 'pending'::text) AND (resolved_at IS NULL)) OR ((state <> 'pending'::text) AND (resolved_at IS NOT NULL)))),
    CONSTRAINT attribution_invitations_kind_check CHECK ((kind = ANY (ARRAY['account'::text, 'external'::text]))),
    CONSTRAINT attribution_invitations_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'revoked'::text, 'expired'::text, 'withdrawn'::text]))),
    CONSTRAINT attribution_invitations_version_check CHECK ((version > 0))
);


--
-- Name: attribution_removal_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.attribution_removal_operations (
    idempotency_key uuid NOT NULL,
    request_id uuid NOT NULL,
    actor_account_id uuid,
    operation text NOT NULL,
    request_payload jsonb NOT NULL,
    resulting_state text NOT NULL,
    resulting_version bigint NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT attribution_removal_operations_operation_check CHECK ((operation = ANY (ARRAY['created'::text, 'accepted'::text, 'declined'::text]))),
    CONSTRAINT attribution_removal_operations_request_payload_check CHECK ((jsonb_typeof(request_payload) = 'object'::text)),
    CONSTRAINT attribution_removal_operations_resulting_state_check CHECK ((resulting_state = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text]))),
    CONSTRAINT attribution_removal_operations_resulting_version_check CHECK ((resulting_version > 0))
);


--
-- Name: attribution_removal_rate_limits; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.attribution_removal_rate_limits (
    dimension text NOT NULL,
    key_hash character(64) NOT NULL,
    window_started_at timestamp with time zone NOT NULL,
    attempt_count smallint NOT NULL,
    CONSTRAINT attribution_removal_rate_limits_attempt_count_check CHECK (((attempt_count >= 1) AND (attempt_count <= 32767))),
    CONSTRAINT attribution_removal_rate_limits_dimension_check CHECK ((dimension = ANY (ARRAY['source'::text, 'target'::text]))),
    CONSTRAINT attribution_removal_rate_limits_key_hash_check CHECK ((key_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: attribution_removal_requests; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.attribution_removal_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    invitation_id uuid,
    work_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    reason text NOT NULL,
    decision_reason text,
    decided_by_account_id uuid,
    correction_revision_id uuid,
    version bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    attribution_public_id uuid,
    CONSTRAINT attribution_removal_requests_reason_check CHECK (((reason = btrim(reason)) AND ((char_length(reason) >= 10) AND (char_length(reason) <= 1000)))),
    CONSTRAINT attribution_removal_requests_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text]))),
    CONSTRAINT attribution_removal_requests_version_check CHECK ((version > 0)),
    CONSTRAINT attribution_removal_resolution_valid CHECK ((((state = 'pending'::text) AND (resolved_at IS NULL) AND (decision_reason IS NULL) AND (decided_by_account_id IS NULL) AND (correction_revision_id IS NULL)) OR ((state = 'accepted'::text) AND (resolved_at IS NOT NULL) AND (decision_reason IS NULL) AND (decided_by_account_id IS NOT NULL) AND (correction_revision_id IS NOT NULL)) OR ((state = 'declined'::text) AND (resolved_at IS NOT NULL) AND (decided_by_account_id IS NOT NULL) AND (correction_revision_id IS NULL) AND (decision_reason = btrim(decision_reason)) AND ((char_length(decision_reason) >= 10) AND (char_length(decision_reason) <= 1000))))),
    CONSTRAINT attribution_removal_target_valid CHECK (((invitation_id IS NOT NULL) <> (attribution_public_id IS NOT NULL)))
);


--
-- Name: attribution_source_lookup_rate_limits; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.attribution_source_lookup_rate_limits (
    source_key_hash character(64) NOT NULL,
    window_started_at timestamp with time zone NOT NULL,
    attempt_count smallint NOT NULL,
    CONSTRAINT attribution_source_lookup_rate_limits_attempt_count_check CHECK (((attempt_count >= 1) AND (attempt_count <= 32767))),
    CONSTRAINT attribution_source_lookup_rate_limits_source_key_hash_check CHECK ((source_key_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: authentication_audit_events; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.authentication_audit_events (
    id bigint NOT NULL,
    account_id uuid,
    event_type text NOT NULL,
    source_key_hash character(64),
    error_code text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT authentication_audit_events_source_key_hash_check CHECK (((source_key_hash IS NULL) OR (source_key_hash ~ '^[0-9a-f]{64}$'::text)))
);


--
-- Name: authentication_audit_events_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.authentication_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.authentication_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: authentication_rate_limits; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.authentication_rate_limits (
    key_kind text NOT NULL,
    key_hash character(64) NOT NULL,
    window_started_at timestamp with time zone NOT NULL,
    attempts integer NOT NULL,
    CONSTRAINT authentication_rate_limits_attempts_check CHECK ((attempts > 0)),
    CONSTRAINT authentication_rate_limits_key_hash_check CHECK ((key_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT authentication_rate_limits_key_kind_check CHECK ((key_kind = ANY (ARRAY['account'::text, 'source'::text])))
);


--
-- Name: authentication_sessions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.authentication_sessions (
    session_id_hash character(64) NOT NULL,
    account_id uuid NOT NULL,
    audience text NOT NULL,
    provider_access_token text NOT NULL,
    provider_refresh_token text NOT NULL,
    provider_token_expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    last_activity_at timestamp with time zone NOT NULL,
    absolute_expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    revocation_reason text,
    CONSTRAINT authentication_sessions_audience_check CHECK ((audience = ANY (ARRAY['student'::text, 'admin'::text]))),
    CONSTRAINT authentication_sessions_revocation_complete CHECK ((((revoked_at IS NULL) AND (revocation_reason IS NULL)) OR ((revoked_at IS NOT NULL) AND (revocation_reason IS NOT NULL)))),
    CONSTRAINT authentication_sessions_session_id_hash_check CHECK ((session_id_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT authentication_sessions_time_order_valid CHECK (((last_activity_at >= created_at) AND (absolute_expires_at > created_at)))
);


--
-- Name: cache_invalidation_deliveries; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.cache_invalidation_deliveries (
    event_id bigint NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone NOT NULL,
    lease_expires_at timestamp with time zone,
    completed_at timestamp with time zone,
    last_error_code text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT cache_invalidation_deliveries_attempt_count_check CHECK (((attempt_count >= 0) AND (attempt_count <= 8))),
    CONSTRAINT cache_invalidation_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT cache_invalidation_delivery_state_valid CHECK ((((status = 'processing'::text) AND (lease_expires_at IS NOT NULL) AND (completed_at IS NULL)) OR ((status = 'completed'::text) AND (lease_expires_at IS NULL) AND (completed_at IS NOT NULL)) OR ((status = ANY (ARRAY['pending'::text, 'failed'::text])) AND (lease_expires_at IS NULL) AND (completed_at IS NULL))))
);


--
-- Name: issue_56_contributor_cutover_state; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.issue_56_contributor_cutover_state (
    singleton boolean DEFAULT true NOT NULL,
    completed_at timestamp with time zone,
    invalidated_invitation_count integer DEFAULT 0 NOT NULL,
    deleted_session_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT issue_56_contributor_cutover_invalidated_invitation_count_check CHECK ((invalidated_invitation_count >= 0)),
    CONSTRAINT issue_56_contributor_cutover_state_deleted_session_count_check CHECK ((deleted_session_count >= 0)),
    CONSTRAINT issue_56_contributor_cutover_state_singleton_check CHECK (singleton)
);

-- This baseline already contains the post-cutover contributor tables and
-- read-only legacy triggers. Fresh databases must therefore start in the
-- completed state instead of attempting the retired one-time cutover.
INSERT INTO private.issue_56_contributor_cutover_state (singleton, completed_at)
VALUES (true, CURRENT_TIMESTAMP);


--
-- Name: outbox_events; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.outbox_events (
    id bigint NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    published_at timestamp with time zone
);


--
-- Name: outbox_events_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.outbox_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.outbox_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: person_name_correction_audit_events; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.person_name_correction_audit_events (
    id bigint NOT NULL,
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    student_account_id uuid NOT NULL,
    previous_first_name_th text NOT NULL,
    previous_last_name_th text NOT NULL,
    first_name_th text NOT NULL,
    last_name_th text NOT NULL,
    reason text NOT NULL,
    expected_version integer NOT NULL,
    resulting_version integer NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT person_name_correction_audit_events_check CHECK ((resulting_version >= expected_version)),
    CONSTRAINT person_name_correction_audit_events_expected_version_check CHECK ((expected_version > 0)),
    CONSTRAINT person_name_correction_audit_events_reason_check CHECK (((reason = btrim(reason)) AND ((char_length(reason) >= 1) AND (char_length(reason) <= 2000)))),
    CONSTRAINT person_name_correction_version_matches_change CHECK ((((previous_first_name_th = first_name_th) AND (previous_last_name_th = last_name_th) AND (resulting_version = expected_version)) OR (((previous_first_name_th <> first_name_th) OR (previous_last_name_th <> last_name_th)) AND (resulting_version = (expected_version + 1)))))
);


--
-- Name: person_name_correction_audit_events_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.person_name_correction_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.person_name_correction_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: person_names; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.person_names (
    person_id uuid NOT NULL,
    first_name_th text NOT NULL,
    last_name_th text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT person_names_first_name_th_check CHECK (((first_name_th = btrim(first_name_th)) AND (first_name_th <> ''::text))),
    CONSTRAINT person_names_last_name_th_check CHECK (((last_name_th = btrim(last_name_th)) AND (last_name_th <> ''::text)))
);


--
-- Name: profile_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.profile_operations (
    idempotency_key uuid NOT NULL,
    person_id uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    operation text NOT NULL,
    expected_version bigint NOT NULL,
    resulting_version bigint NOT NULL,
    request_payload jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT profile_operations_expected_version_check CHECK ((expected_version >= 0)),
    CONSTRAINT profile_operations_operation_check CHECK ((operation = ANY (ARRAY['profile_updated'::text, 'profile_consent_granted'::text, 'profile_consent_withdrawn'::text]))),
    CONSTRAINT profile_operations_resulting_version_check CHECK ((resulting_version > 0))
);


--
-- Name: profile_photo_assets; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.profile_photo_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    person_id uuid NOT NULL,
    status text NOT NULL,
    quarantine_object_key text NOT NULL,
    sanitized_object_key text,
    declared_content_type text NOT NULL,
    declared_byte_size integer NOT NULL,
    inspected_content_type text,
    inspected_byte_size integer,
    width integer,
    height integer,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    rejection_code text,
    CONSTRAINT profile_photo_assets_declared_byte_size_check CHECK (((declared_byte_size > 0) AND (declared_byte_size <= 2097152))),
    CONSTRAINT profile_photo_assets_declared_content_type_check CHECK ((declared_content_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
    CONSTRAINT profile_photo_assets_height_check CHECK (((height IS NULL) OR ((height >= 512) AND (height <= 4096)))),
    CONSTRAINT profile_photo_assets_inspected_byte_size_check CHECK (((inspected_byte_size IS NULL) OR (inspected_byte_size > 0))),
    CONSTRAINT profile_photo_assets_inspected_content_type_check CHECK (((inspected_content_type IS NULL) OR (inspected_content_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text])))),
    CONSTRAINT profile_photo_assets_ready_complete CHECK (((status <> 'ready'::text) OR ((sanitized_object_key IS NOT NULL) AND (inspected_content_type IS NOT NULL) AND (inspected_byte_size IS NOT NULL) AND (width IS NOT NULL) AND (height IS NOT NULL) AND (width = height) AND (rejection_code IS NULL)))),
    CONSTRAINT profile_photo_assets_rejection_complete CHECK ((((status = 'rejected'::text) AND (rejection_code IS NOT NULL)) OR ((status <> 'rejected'::text) AND (rejection_code IS NULL)))),
    CONSTRAINT profile_photo_assets_status_check CHECK ((status = ANY (ARRAY['pending_upload'::text, 'processing'::text, 'ready'::text, 'rejected'::text]))),
    CONSTRAINT profile_photo_assets_width_check CHECK (((width IS NULL) OR ((width >= 512) AND (width <= 4096))))
);


--
-- Name: public_cache_version; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.public_cache_version (
    singleton boolean DEFAULT true NOT NULL,
    version bigint NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT public_cache_version_singleton_check CHECK (singleton),
    CONSTRAINT public_cache_version_version_check CHECK ((version >= 0))
);


--
-- Name: public_work_catalog; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.public_work_catalog (
    work_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    work_public_id uuid NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    academic_year smallint NOT NULL,
    semester text NOT NULL,
    semester_order smallint NOT NULL,
    published_at timestamp with time zone NOT NULL,
    normalized_title text NOT NULL,
    normalized_summary text NOT NULL,
    normalized_tags text NOT NULL,
    normalized_attributions text NOT NULL,
    normalized_description text NOT NULL,
    normalized_search text NOT NULL,
    CONSTRAINT public_work_catalog_academic_year_check CHECK (((academic_year >= 2400) AND (academic_year <= 2700))),
    CONSTRAINT public_work_catalog_category_check CHECK ((category = ANY (ARRAY['course_work'::text, 'competition_entry'::text, 'academic_article'::text]))),
    CONSTRAINT public_work_catalog_search_complete CHECK ((normalized_search = concat_ws(' '::text, normalized_title, normalized_summary, normalized_tags, normalized_attributions, normalized_description))),
    CONSTRAINT public_work_catalog_semester_check CHECK ((semester = ANY (ARRAY['1'::text, '2'::text, 'summer'::text]))),
    CONSTRAINT public_work_catalog_semester_order_check CHECK (((semester_order >= 1) AND (semester_order <= 3)))
);


--
-- Name: published_revision_tags; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.published_revision_tags (
    revision_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    "position" smallint NOT NULL,
    CONSTRAINT published_revision_tags_position_check CHECK ((("position" >= 1) AND ("position" <= 5)))
);


--
-- Name: removal_request_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.removal_request_operations (
    idempotency_key uuid NOT NULL,
    request_id uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    operation text NOT NULL,
    request_payload jsonb NOT NULL,
    resulting_state text NOT NULL,
    resulting_version bigint NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT removal_request_operations_operation_check CHECK ((operation = ANY (ARRAY['created'::text, 'cancelled'::text, 'approved'::text, 'declined'::text]))),
    CONSTRAINT removal_request_operations_request_payload_check CHECK ((jsonb_typeof(request_payload) = 'object'::text)),
    CONSTRAINT removal_request_operations_resulting_state_check CHECK ((resulting_state = ANY (ARRAY['pending'::text, 'cancelled'::text, 'approved'::text, 'declined'::text]))),
    CONSTRAINT removal_request_operations_resulting_version_check CHECK ((resulting_version > 0))
);


--
-- Name: removal_requests; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.removal_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    submitter_account_id uuid NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    reason text NOT NULL,
    decision_reason text,
    decided_by_account_id uuid,
    version bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT removal_request_resolution_valid CHECK ((((state = 'pending'::text) AND (resolved_at IS NULL) AND (decision_reason IS NULL) AND (decided_by_account_id IS NULL)) OR ((state = 'cancelled'::text) AND (resolved_at IS NOT NULL) AND (decision_reason IS NULL) AND (decided_by_account_id IS NULL)) OR ((state = 'approved'::text) AND (resolved_at IS NOT NULL) AND (decision_reason IS NULL) AND (decided_by_account_id IS NOT NULL)) OR ((state = 'declined'::text) AND (resolved_at IS NOT NULL) AND (decided_by_account_id IS NOT NULL) AND (decision_reason = btrim(decision_reason)) AND ((char_length(decision_reason) >= 10) AND (char_length(decision_reason) <= 1000))))),
    CONSTRAINT removal_requests_reason_check CHECK (((reason = btrim(reason)) AND ((char_length(reason) >= 10) AND (char_length(reason) <= 1000)))),
    CONSTRAINT removal_requests_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'cancelled'::text, 'approved'::text, 'declined'::text]))),
    CONSTRAINT removal_requests_version_check CHECK ((version > 0))
);


--
-- Name: reviews; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    revision_id uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    decision text NOT NULL,
    reason text,
    feedback text,
    expected_revision_version bigint NOT NULL,
    resulting_revision_version bigint NOT NULL,
    idempotency_key uuid NOT NULL,
    request_payload jsonb NOT NULL,
    reviewed_at timestamp with time zone NOT NULL,
    CONSTRAINT reviews_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'changes_requested'::text]))),
    CONSTRAINT reviews_decision_detail_valid CHECK ((((decision = 'approved'::text) AND (reason IS NULL) AND (feedback IS NULL)) OR ((decision = 'changes_requested'::text) AND (reason IS NOT NULL) AND (feedback IS NOT NULL) AND (reason = ANY (ARRAY['content'::text, 'attribution'::text, 'media'::text, 'links_tags'::text, 'policy'::text, 'other'::text])) AND (feedback = btrim(feedback)) AND ((char_length(feedback) >= 10) AND (char_length(feedback) <= 2000))))),
    CONSTRAINT reviews_expected_revision_version_check CHECK ((expected_revision_version > 0)),
    CONSTRAINT reviews_resulting_revision_version_check CHECK ((resulting_revision_version > 0))
);


--
-- Name: roster_audit_events; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.roster_audit_events (
    id bigint NOT NULL,
    batch_id uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    event_type text NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT roster_audit_events_event_type_check CHECK ((event_type = ANY (ARRAY['roster_batch_created'::text, 'roster_batch_completed'::text])))
);


--
-- Name: roster_audit_events_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.roster_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.roster_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: roster_batches; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.roster_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uploader_account_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_row_count integer NOT NULL,
    processed_row_count integer DEFAULT 0 NOT NULL,
    created_count integer DEFAULT 0 NOT NULL,
    unchanged_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    uploaded_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    entry_years smallint[] NOT NULL,
    CONSTRAINT roster_batch_completion_valid CHECK ((((status = ANY (ARRAY['pending'::text, 'processing'::text])) AND (completed_at IS NULL)) OR ((status = ANY (ARRAY['completed'::text, 'completed_with_errors'::text])) AND (completed_at IS NOT NULL)))),
    CONSTRAINT roster_batch_counts_valid CHECK (((processed_row_count = ((created_count + unchanged_count) + failed_count)) AND (processed_row_count <= total_row_count))),
    CONSTRAINT roster_batch_entry_years_count_valid CHECK (private.are_valid_roster_entry_years(entry_years)),
    CONSTRAINT roster_batches_created_count_check CHECK ((created_count >= 0)),
    CONSTRAINT roster_batches_failed_count_check CHECK ((failed_count >= 0)),
    CONSTRAINT roster_batches_processed_row_count_check CHECK ((processed_row_count >= 0)),
    CONSTRAINT roster_batches_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'completed_with_errors'::text]))),
    CONSTRAINT roster_batches_total_row_count_check CHECK (((total_row_count >= 0) AND (total_row_count <= 10000))),
    CONSTRAINT roster_batches_unchanged_count_check CHECK ((unchanged_count >= 0))
);


--
-- Name: COLUMN roster_batches.entry_years; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON COLUMN private.roster_batches.entry_years IS 'Sorted distinct Buddhist Era entry years represented by this Batch.';


--
-- Name: roster_conflict_resolution_audit_events; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.roster_conflict_resolution_audit_events (
    id bigint NOT NULL,
    conflict_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    resolution text NOT NULL,
    reason text,
    idempotency_key uuid NOT NULL,
    resolved_version integer NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT roster_conflict_resolution_audit_events_reason_check CHECK (((reason IS NULL) OR ((reason = btrim(reason)) AND ((char_length(reason) >= 1) AND (char_length(reason) <= 2000))))),
    CONSTRAINT roster_conflict_resolution_audit_events_resolution_check CHECK ((resolution = ANY (ARRAY['keep_existing'::text, 'accept_incoming_name'::text]))),
    CONSTRAINT roster_conflict_resolution_audit_events_resolved_version_check CHECK ((resolved_version > 1))
);


--
-- Name: roster_conflict_resolution_audit_events_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.roster_conflict_resolution_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.roster_conflict_resolution_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: roster_conflicts; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.roster_conflicts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    source_row_number integer NOT NULL,
    person_id uuid NOT NULL,
    student_id_hash character(64) NOT NULL,
    existing_first_name_th text NOT NULL,
    existing_last_name_th text NOT NULL,
    incoming_first_name_th text NOT NULL,
    incoming_last_name_th text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    resolution text,
    reason text,
    resolved_by_account_id uuid,
    resolved_at timestamp with time zone,
    resolution_idempotency_key uuid,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT roster_conflict_resolution_valid CHECK ((((status = 'pending'::text) AND (resolution IS NULL) AND (reason IS NULL) AND (resolved_by_account_id IS NULL) AND (resolved_at IS NULL) AND (resolution_idempotency_key IS NULL)) OR ((status = 'resolved'::text) AND (resolution IS NOT NULL) AND (resolved_by_account_id IS NOT NULL) AND (resolved_at IS NOT NULL) AND (resolution_idempotency_key IS NOT NULL) AND ((resolution <> 'accept_incoming_name'::text) OR (reason IS NOT NULL))))),
    CONSTRAINT roster_conflicts_reason_check CHECK (((reason IS NULL) OR ((reason = btrim(reason)) AND ((char_length(reason) >= 1) AND (char_length(reason) <= 2000))))),
    CONSTRAINT roster_conflicts_resolution_check CHECK ((resolution = ANY (ARRAY['keep_existing'::text, 'accept_incoming_name'::text]))),
    CONSTRAINT roster_conflicts_source_row_number_check CHECK ((source_row_number >= 2)),
    CONSTRAINT roster_conflicts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text]))),
    CONSTRAINT roster_conflicts_student_id_hash_check CHECK ((student_id_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT roster_conflicts_version_check CHECK ((version > 0))
);


--
-- Name: TABLE roster_conflicts; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.roster_conflicts IS 'Private normalized identity disagreements retained independently of expiring Roster row content.';


--
-- Name: roster_rows; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.roster_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    row_number integer NOT NULL,
    student_id text NOT NULL,
    student_id_hash character(64),
    synthetic_identity text,
    provider_user_id uuid,
    first_name_th text,
    last_name_th text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempt_count smallint DEFAULT 0 NOT NULL,
    error_code text,
    lease_until timestamp with time zone,
    next_attempt_at timestamp with time zone NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    entry_year smallint,
    student_id_prefix_hashes character(64)[],
    CONSTRAINT roster_row_completion_valid CHECK ((((status = ANY (ARRAY['created'::text, 'unchanged'::text, 'failed'::text])) AND (processed_at IS NOT NULL)) OR ((status = ANY (ARRAY['pending'::text, 'processing'::text])) AND (processed_at IS NULL)))),
    CONSTRAINT roster_row_entry_year_valid CHECK (((entry_year >= 2400) AND (entry_year <= 2700))),
    CONSTRAINT roster_row_error_code_valid CHECK (((error_code IS NULL) OR (error_code = ANY (ARRAY['DUPLICATE_STUDENT_ID'::text, 'INVALID_FIRST_NAME'::text, 'INVALID_LAST_NAME'::text, 'INVALID_STUDENT_ID'::text, 'ROSTER_AUTH_PROVIDER_UNAVAILABLE'::text, 'ROSTER_CONFLICT'::text, 'ROSTER_PROCESSING_FAILED'::text])))),
    CONSTRAINT roster_row_input_valid CHECK ((((student_id_hash IS NULL) AND (synthetic_identity IS NULL) AND (provider_user_id IS NULL) AND (entry_year IS NULL) AND (first_name_th IS NULL) AND (last_name_th IS NULL) AND (status = 'failed'::text) AND (error_code = ANY (ARRAY['DUPLICATE_STUDENT_ID'::text, 'INVALID_FIRST_NAME'::text, 'INVALID_LAST_NAME'::text, 'INVALID_STUDENT_ID'::text]))) OR ((student_id ~ '^[0-9]{8}$'::text) AND (student_id_hash IS NOT NULL) AND (synthetic_identity IS NOT NULL) AND (provider_user_id IS NOT NULL) AND (entry_year IS NOT NULL) AND (first_name_th IS NOT NULL) AND (last_name_th IS NOT NULL)))),
    CONSTRAINT roster_row_processing_valid CHECK ((((status = 'processing'::text) AND (lease_until IS NOT NULL)) OR ((status <> 'processing'::text) AND (lease_until IS NULL)))),
    CONSTRAINT roster_row_student_id_size_valid CHECK ((octet_length(student_id) <= ((5 * 1024) * 1024))),
    CONSTRAINT roster_rows_attempt_count_check CHECK (((attempt_count >= 0) AND (attempt_count <= 3))),
    CONSTRAINT roster_rows_first_name_th_check CHECK (((first_name_th = btrim(first_name_th)) AND (first_name_th <> ''::text))),
    CONSTRAINT roster_rows_last_name_th_check CHECK (((last_name_th = btrim(last_name_th)) AND (last_name_th <> ''::text))),
    CONSTRAINT roster_rows_row_number_check CHECK ((row_number >= 2)),
    CONSTRAINT roster_rows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'created'::text, 'unchanged'::text, 'failed'::text]))),
    CONSTRAINT roster_rows_student_id_hash_check CHECK ((student_id_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT roster_rows_student_id_prefix_hashes_valid CHECK (((student_id_prefix_hashes IS NULL) OR ((cardinality(student_id_prefix_hashes) = 7) AND (array_to_string(student_id_prefix_hashes, ''::text) ~ '^(?:[0-9a-f]{64}){7}$'::text)))),
    CONSTRAINT roster_rows_synthetic_identity_check CHECK ((synthetic_identity ~ '^[0-9a-f]{64}@auth[.]invalid$'::text))
);


--
-- Name: COLUMN roster_rows.entry_year; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON COLUMN private.roster_rows.entry_year IS 'Buddhist Era entry year derived from the first two digits of the Student ID.';


--
-- Name: student_access_extension_audit_events; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.student_access_extension_audit_events (
    id bigint NOT NULL,
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    student_account_id uuid NOT NULL,
    previous_access_ends_academic_year smallint NOT NULL,
    access_ends_academic_year smallint NOT NULL,
    reason text NOT NULL,
    expected_version integer NOT NULL,
    resulting_version integer NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT student_access_extension_audit__access_ends_academic_year_check CHECK (((access_ends_academic_year >= 2400) AND (access_ends_academic_year <= 2700))),
    CONSTRAINT student_access_extension_audit_events_check CHECK ((resulting_version > expected_version)),
    CONSTRAINT student_access_extension_audit_events_expected_version_check CHECK ((expected_version > 0)),
    CONSTRAINT student_access_extension_audit_events_reason_check CHECK (((reason = btrim(reason)) AND ((char_length(reason) >= 1) AND (char_length(reason) <= 2000)))),
    CONSTRAINT student_access_extension_moves_later CHECK ((access_ends_academic_year > previous_access_ends_academic_year))
);


--
-- Name: student_access_extension_audit_events_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.student_access_extension_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.student_access_extension_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: student_auth_identities; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.student_auth_identities (
    account_id uuid NOT NULL,
    student_id_hash character(64) NOT NULL,
    synthetic_identity text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_auth_identities_student_id_hash_check CHECK ((student_id_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT student_auth_identities_synthetic_identity_check CHECK ((synthetic_identity ~ '^[0-9a-f]{64}@auth[.]invalid$'::text))
);


--
-- Name: student_id_search_prefixes; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.student_id_search_prefixes (
    account_id uuid NOT NULL,
    prefix_length smallint NOT NULL,
    prefix_hash character(64) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT student_id_search_prefixes_prefix_hash_check CHECK ((prefix_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT student_id_search_prefixes_prefix_length_check CHECK (((prefix_length >= 1) AND (prefix_length <= 7)))
);


--
-- Name: student_password_reset_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.student_password_reset_operations (
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    student_account_id uuid NOT NULL,
    expected_version integer NOT NULL,
    resulting_version integer NOT NULL,
    status text NOT NULL,
    error_code text,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone,
    lease_until timestamp with time zone,
    attempt_number integer DEFAULT 1 NOT NULL,
    CONSTRAINT student_password_reset_operation_lease_valid CHECK ((((status = 'pending'::text) AND (lease_until IS NOT NULL)) OR ((status = ANY (ARRAY['provider_failed'::text, 'completed'::text])) AND (lease_until IS NULL)))),
    CONSTRAINT student_password_reset_operation_state_valid CHECK ((((status = 'pending'::text) AND (error_code IS NULL) AND (finished_at IS NULL)) OR ((status = 'provider_failed'::text) AND (error_code IS NOT NULL) AND (finished_at IS NOT NULL)) OR ((status = 'completed'::text) AND (error_code IS NULL) AND (finished_at IS NOT NULL)))),
    CONSTRAINT student_password_reset_operations_attempt_number_check CHECK ((attempt_number > 0)),
    CONSTRAINT student_password_reset_operations_check CHECK ((resulting_version > expected_version)),
    CONSTRAINT student_password_reset_operations_error_code_check CHECK (((error_code IS NULL) OR (error_code = 'provider_unavailable'::text))),
    CONSTRAINT student_password_reset_operations_expected_version_check CHECK ((expected_version > 0)),
    CONSTRAINT student_password_reset_operations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'provider_failed'::text, 'completed'::text])))
);


--
-- Name: work_contributor_candidates; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_contributor_candidates (
    reference uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    person_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: work_draft_contributor_backfill_items; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_draft_contributor_backfill_items (
    invitation_id uuid NOT NULL,
    source_state text NOT NULL,
    outcome text NOT NULL,
    processed_at timestamp with time zone NOT NULL,
    CONSTRAINT work_draft_contributor_backfill_items_outcome_check CHECK ((outcome = ANY (ARRAY['inserted'::text, 'retained'::text, 'excluded_terminal'::text, 'missing_draft'::text, 'invalid_source'::text, 'over_limit'::text]))),
    CONSTRAINT work_draft_contributor_backfill_items_source_state_check CHECK ((source_state = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'revoked'::text, 'expired'::text, 'withdrawn'::text])))
);


--
-- Name: work_draft_contributor_backfill_runs; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_draft_contributor_backfill_runs (
    id bigint NOT NULL,
    batch_size integer NOT NULL,
    accepted_source_count integer NOT NULL,
    pending_source_count integer NOT NULL,
    terminal_excluded_count integer NOT NULL,
    inserted_count integer NOT NULL,
    retained_count integer NOT NULL,
    missing_draft_count integer NOT NULL,
    invalid_source_count integer NOT NULL,
    over_limit_count integer NOT NULL,
    remaining_count integer NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT work_draft_contributor_backfill_r_terminal_excluded_count_check CHECK ((terminal_excluded_count >= 0)),
    CONSTRAINT work_draft_contributor_backfill_run_accepted_source_count_check CHECK ((accepted_source_count >= 0)),
    CONSTRAINT work_draft_contributor_backfill_runs_batch_size_check CHECK (((batch_size >= 1) AND (batch_size <= 5000))),
    CONSTRAINT work_draft_contributor_backfill_runs_inserted_count_check CHECK ((inserted_count >= 0)),
    CONSTRAINT work_draft_contributor_backfill_runs_invalid_source_count_check CHECK ((invalid_source_count >= 0)),
    CONSTRAINT work_draft_contributor_backfill_runs_missing_draft_count_check CHECK ((missing_draft_count >= 0)),
    CONSTRAINT work_draft_contributor_backfill_runs_over_limit_count_check CHECK ((over_limit_count >= 0)),
    CONSTRAINT work_draft_contributor_backfill_runs_pending_source_count_check CHECK ((pending_source_count >= 0)),
    CONSTRAINT work_draft_contributor_backfill_runs_remaining_count_check CHECK ((remaining_count >= 0)),
    CONSTRAINT work_draft_contributor_backfill_runs_retained_count_check CHECK ((retained_count >= 0))
);


--
-- Name: work_draft_contributor_backfill_runs_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.work_draft_contributor_backfill_runs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.work_draft_contributor_backfill_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: work_draft_contributor_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_draft_contributor_operations (
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    work_id uuid NOT NULL,
    contributor_id bigint,
    operation text NOT NULL,
    request_fingerprint character(64) NOT NULL,
    resulting_version bigint NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT work_draft_contributor_operations_operation_check CHECK ((operation = ANY (ARRAY['account_contributor_added'::text, 'external_contributor_added'::text, 'draft_contributor_removed'::text]))),
    CONSTRAINT work_draft_contributor_operations_request_fingerprint_check CHECK ((request_fingerprint ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT work_draft_contributor_operations_resulting_version_check CHECK ((resulting_version > 0))
);


--
-- Name: work_draft_contributors; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_draft_contributors (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    kind text NOT NULL,
    person_id uuid NOT NULL,
    attribution_name text NOT NULL,
    contribution_role text,
    "position" smallint NOT NULL,
    legacy_invitation_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    removed_at timestamp with time zone,
    CONSTRAINT work_draft_contributors_attribution_name_check CHECK (((attribution_name = btrim(attribution_name)) AND ((char_length(attribution_name) >= 1) AND (char_length(attribution_name) <= 100)))),
    CONSTRAINT work_draft_contributors_contribution_role_check CHECK (((contribution_role IS NULL) OR ((contribution_role = btrim(contribution_role)) AND ((char_length(contribution_role) >= 1) AND (char_length(contribution_role) <= 100))))),
    CONSTRAINT work_draft_contributors_kind_check CHECK ((kind = ANY (ARRAY['account'::text, 'external'::text]))),
    CONSTRAINT work_draft_contributors_position_check CHECK ((("position" >= 1) AND ("position" <= 20)))
);


--
-- Name: work_draft_contributors_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.work_draft_contributors ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.work_draft_contributors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: work_draft_links; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_draft_links (
    work_id uuid NOT NULL,
    "position" smallint NOT NULL,
    label text NOT NULL,
    url text NOT NULL,
    CONSTRAINT work_draft_links_label_check CHECK (((label = btrim(label)) AND ((char_length(label) >= 1) AND (char_length(label) <= 50)))),
    CONSTRAINT work_draft_links_position_check CHECK ((("position" >= 1) AND ("position" <= 5))),
    CONSTRAINT work_draft_links_url_check CHECK (((char_length(url) <= 2048) AND (url ~ '^https://'::text)))
);


--
-- Name: work_draft_media; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_draft_media (
    work_id uuid NOT NULL,
    media_kind text NOT NULL,
    "position" smallint NOT NULL,
    asset_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT work_draft_media_media_kind_check CHECK ((media_kind = ANY (ARRAY['poster'::text, 'gallery'::text]))),
    CONSTRAINT work_draft_media_position_check CHECK ((("position" >= 1) AND ("position" <= 3))),
    CONSTRAINT work_draft_media_poster_position CHECK (((media_kind <> 'poster'::text) OR ("position" = 1)))
);


--
-- Name: work_draft_tags; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_draft_tags (
    work_id uuid NOT NULL,
    "position" smallint NOT NULL,
    display_label text NOT NULL,
    normalized_identity text NOT NULL,
    CONSTRAINT work_draft_tags_display_label_check CHECK (((display_label = btrim(display_label)) AND ((char_length(display_label) >= 1) AND (char_length(display_label) <= 50)))),
    CONSTRAINT work_draft_tags_normalized_identity_check CHECK (((normalized_identity = btrim(normalized_identity)) AND (char_length(normalized_identity) >= 1))),
    CONSTRAINT work_draft_tags_position_check CHECK ((("position" >= 1) AND ("position" <= 5)))
);


--
-- Name: work_draft_video_links; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_draft_video_links (
    work_id uuid NOT NULL,
    "position" smallint NOT NULL,
    provider text NOT NULL,
    provider_video_id text NOT NULL,
    url text NOT NULL,
    CONSTRAINT work_draft_video_links_position_check CHECK ((("position" >= 1) AND ("position" <= 3))),
    CONSTRAINT work_draft_video_links_provider_check CHECK ((provider = ANY (ARRAY['youtube'::text, 'tiktok'::text]))),
    CONSTRAINT work_draft_video_links_provider_video_id_check CHECK (((char_length(provider_video_id) >= 1) AND (char_length(provider_video_id) <= 255))),
    CONSTRAINT work_draft_video_links_url_check CHECK ((url ~ '^https://'::text))
);


--
-- Name: work_drafts; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_drafts (
    work_id uuid NOT NULL,
    base_published_revision_id uuid,
    title text,
    summary text,
    description text,
    category text,
    academic_year smallint,
    semester text,
    version bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    lifecycle_state text DEFAULT 'active'::text NOT NULL,
    submitter_study_year smallint,
    CONSTRAINT work_drafts_academic_year_check CHECK (((academic_year >= 2400) AND (academic_year <= 2700))),
    CONSTRAINT work_drafts_category_check CHECK ((category = ANY (ARRAY['course_work'::text, 'competition_entry'::text, 'academic_article'::text]))),
    CONSTRAINT work_drafts_description_check CHECK (((description = btrim(description)) AND ((char_length(description) >= 1) AND (char_length(description) <= 10000)))),
    CONSTRAINT work_drafts_lifecycle_state_check CHECK ((lifecycle_state = ANY (ARRAY['active'::text, 'retained'::text]))),
    CONSTRAINT work_drafts_semester_check CHECK ((semester = ANY (ARRAY['1'::text, '2'::text, 'summer'::text]))),
    CONSTRAINT work_drafts_submitter_study_year_check CHECK (((submitter_study_year >= 1) AND (submitter_study_year <= 4))),
    CONSTRAINT work_drafts_summary_check CHECK (((summary = btrim(summary)) AND ((char_length(summary) >= 1) AND (char_length(summary) <= 300)))),
    CONSTRAINT work_drafts_title_check CHECK (((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 150)))),
    CONSTRAINT work_drafts_version_check CHECK ((version > 0))
);


--
-- Name: work_media_assets; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    media_kind text NOT NULL,
    status text NOT NULL,
    quarantine_object_key text NOT NULL,
    authorize_idempotency_key uuid NOT NULL,
    master_object_key text,
    declared_content_type text NOT NULL,
    declared_extension text NOT NULL,
    declared_byte_size integer NOT NULL,
    inspected_byte_size integer,
    width integer,
    height integer,
    content_hash bytea,
    dominant_color text,
    rejection_code text,
    warnings text[] DEFAULT '{}'::text[] NOT NULL,
    processing_attempts smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    processing_started_at timestamp with time zone,
    cleanup_started_at timestamp with time zone,
    CONSTRAINT work_media_assets_declared_byte_size_check CHECK (((declared_byte_size > 0) AND (declared_byte_size <= 5242880))),
    CONSTRAINT work_media_assets_declared_content_type_check CHECK ((declared_content_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
    CONSTRAINT work_media_assets_declared_extension_check CHECK ((declared_extension = ANY (ARRAY['jpeg'::text, 'jpg'::text, 'png'::text, 'webp'::text]))),
    CONSTRAINT work_media_assets_declared_type_matches_extension CHECK ((((declared_content_type = 'image/jpeg'::text) AND (declared_extension = ANY (ARRAY['jpeg'::text, 'jpg'::text]))) OR ((declared_content_type = 'image/png'::text) AND (declared_extension = 'png'::text)) OR ((declared_content_type = 'image/webp'::text) AND (declared_extension = 'webp'::text)))),
    CONSTRAINT work_media_assets_dominant_color_check CHECK (((dominant_color IS NULL) OR (dominant_color ~ '^#[0-9A-F]{6}$'::text))),
    CONSTRAINT work_media_assets_height_check CHECK (((height >= 1) AND (height <= 2560))),
    CONSTRAINT work_media_assets_inspected_byte_size_check CHECK ((inspected_byte_size > 0)),
    CONSTRAINT work_media_assets_media_kind_check CHECK ((media_kind = ANY (ARRAY['poster'::text, 'gallery'::text]))),
    CONSTRAINT work_media_assets_processing_attempts_check CHECK (((processing_attempts >= 0) AND (processing_attempts <= 3))),
    CONSTRAINT work_media_assets_ready_complete CHECK (((status <> 'ready'::text) OR ((master_object_key IS NOT NULL) AND (inspected_byte_size IS NOT NULL) AND (width IS NOT NULL) AND (height IS NOT NULL) AND (content_hash IS NOT NULL) AND (dominant_color IS NOT NULL) AND (rejection_code IS NULL)))),
    CONSTRAINT work_media_assets_rejection_code_check CHECK ((rejection_code = ANY (ARRAY['expired'::text, 'invalid_media'::text, 'processing_failed'::text]))),
    CONSTRAINT work_media_assets_rejection_complete CHECK ((((status = 'rejected'::text) AND (rejection_code IS NOT NULL)) OR ((status <> 'rejected'::text) AND (rejection_code IS NULL)))),
    CONSTRAINT work_media_assets_status_check CHECK ((status = ANY (ARRAY['pending_upload'::text, 'uploaded'::text, 'processing'::text, 'ready'::text, 'rejected'::text]))),
    CONSTRAINT work_media_assets_warnings_check CHECK ((warnings <@ ARRAY['poster_width_below_recommended'::text])),
    CONSTRAINT work_media_assets_width_check CHECK (((width >= 1) AND (width <= 2560)))
);


--
-- Name: work_media_variants; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_media_variants (
    asset_id uuid NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    byte_size integer NOT NULL,
    content_hash bytea NOT NULL,
    object_key text NOT NULL,
    CONSTRAINT work_media_variants_byte_size_check CHECK ((byte_size > 0)),
    CONSTRAINT work_media_variants_height_check CHECK (((height > 0) AND (height <= 2560))),
    CONSTRAINT work_media_variants_width_check CHECK (((width > 0) AND (width <= 2560)))
);


--
-- Name: work_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_operations (
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    work_id uuid NOT NULL,
    operation text NOT NULL,
    request_payload jsonb NOT NULL,
    resulting_version bigint NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT work_operations_operation_check CHECK ((operation = ANY (ARRAY['work_created'::text, 'work_draft_updated'::text, 'published_work_draft_seeded'::text, 'work_draft_rebased'::text, 'work_media_attached'::text]))),
    CONSTRAINT work_operations_resulting_version_check CHECK ((resulting_version > 0))
);


--
-- Name: work_recovery_audits; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_recovery_audits (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    work_id uuid NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    previous_activity_state text NOT NULL,
    previous_publication_state text NOT NULL,
    resulting_activity_state text NOT NULL,
    resulting_publication_state text NOT NULL,
    expected_version bigint NOT NULL,
    resulting_version bigint NOT NULL,
    request_payload jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT work_recovery_audits_action_check CHECK ((action = ANY (ARRAY['archive'::text, 'restore_active'::text, 'restore_publication'::text, 'unpublish'::text]))),
    CONSTRAINT work_recovery_audits_check CHECK ((resulting_version = (expected_version + 1))),
    CONSTRAINT work_recovery_audits_expected_version_check CHECK ((expected_version > 0)),
    CONSTRAINT work_recovery_audits_previous_activity_state_check CHECK ((previous_activity_state = ANY (ARRAY['active'::text, 'archived'::text]))),
    CONSTRAINT work_recovery_audits_previous_publication_state_check CHECK ((previous_publication_state = ANY (ARRAY['never_published'::text, 'published'::text, 'unpublished'::text]))),
    CONSTRAINT work_recovery_audits_reason_check CHECK (((reason = btrim(reason)) AND ((char_length(reason) >= 10) AND (char_length(reason) <= 1000)))),
    CONSTRAINT work_recovery_audits_request_payload_check CHECK ((jsonb_typeof(request_payload) = 'object'::text)),
    CONSTRAINT work_recovery_audits_resulting_activity_state_check CHECK ((resulting_activity_state = ANY (ARRAY['active'::text, 'archived'::text]))),
    CONSTRAINT work_recovery_audits_resulting_publication_state_check CHECK ((resulting_publication_state = ANY (ARRAY['never_published'::text, 'published'::text, 'unpublished'::text])))
);


--
-- Name: work_recovery_audits_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.work_recovery_audits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.work_recovery_audits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: work_revision_attributions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_revision_attributions (
    revision_id uuid NOT NULL,
    "position" smallint NOT NULL,
    kind text NOT NULL,
    person_id uuid,
    attribution_name text NOT NULL,
    study_year smallint,
    contribution_role text,
    affiliation text,
    attribution_public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    attribution_model_version smallint DEFAULT 1 NOT NULL,
    CONSTRAINT work_revision_attribution_kind_valid CHECK ((((attribution_model_version = 1) AND (((kind = ANY (ARRAY['submitter'::text, 'account'::text])) AND (person_id IS NOT NULL) AND (study_year IS NOT NULL) AND (contribution_role IS NULL) AND (affiliation IS NULL)) OR ((kind = 'external'::text) AND (person_id IS NOT NULL) AND (study_year IS NULL) AND (contribution_role IS NOT NULL)))) OR ((attribution_model_version = 2) AND (((kind = 'submitter'::text) AND (person_id IS NOT NULL) AND ((study_year >= 1) AND (study_year <= 4)) AND (contribution_role IS NULL) AND (affiliation IS NULL)) OR ((kind = ANY (ARRAY['account'::text, 'external'::text])) AND (person_id IS NOT NULL) AND (study_year IS NULL) AND (contribution_role IS NOT NULL) AND (affiliation IS NULL)))))),
    CONSTRAINT work_revision_attributions_affiliation_check CHECK (((affiliation IS NULL) OR ((affiliation = btrim(affiliation)) AND ((char_length(affiliation) >= 1) AND (char_length(affiliation) <= 150))))),
    CONSTRAINT work_revision_attributions_attribution_model_version_check CHECK ((attribution_model_version = ANY (ARRAY[1, 2]))),
    CONSTRAINT work_revision_attributions_attribution_name_check CHECK (((attribution_name = btrim(attribution_name)) AND ((char_length(attribution_name) >= 1) AND (char_length(attribution_name) <= 100)))),
    CONSTRAINT work_revision_attributions_contribution_role_check CHECK (((contribution_role IS NULL) OR ((contribution_role = btrim(contribution_role)) AND ((char_length(contribution_role) >= 1) AND (char_length(contribution_role) <= 100))))),
    CONSTRAINT work_revision_attributions_kind_check CHECK ((kind = ANY (ARRAY['submitter'::text, 'account'::text, 'external'::text]))),
    CONSTRAINT work_revision_attributions_position_check CHECK ((("position" >= 1) AND ("position" <= 21))),
    CONSTRAINT work_revision_attributions_study_year_check CHECK (((study_year >= 1) AND (study_year <= 8))),
    CONSTRAINT work_revision_submitter_position_valid CHECK (((("position" = 1) AND (kind = 'submitter'::text)) OR (("position" > 1) AND (kind <> 'submitter'::text))))
);


--
-- Name: work_revision_links; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_revision_links (
    revision_id uuid NOT NULL,
    "position" smallint NOT NULL,
    label text NOT NULL,
    url text NOT NULL,
    CONSTRAINT work_revision_links_label_check CHECK (((label = btrim(label)) AND ((char_length(label) >= 1) AND (char_length(label) <= 50)))),
    CONSTRAINT work_revision_links_position_check CHECK ((("position" >= 1) AND ("position" <= 5))),
    CONSTRAINT work_revision_links_url_check CHECK (((char_length(url) <= 2048) AND (url ~ '^https://'::text)))
);


--
-- Name: work_revision_media; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_revision_media (
    revision_id uuid NOT NULL,
    media_kind text NOT NULL,
    "position" smallint NOT NULL,
    asset_id uuid NOT NULL,
    CONSTRAINT work_revision_media_media_kind_check CHECK ((media_kind = ANY (ARRAY['poster'::text, 'gallery'::text]))),
    CONSTRAINT work_revision_media_position_check CHECK ((("position" >= 1) AND ("position" <= 3))),
    CONSTRAINT work_revision_media_poster_position CHECK (((media_kind <> 'poster'::text) OR ("position" = 1)))
);


--
-- Name: work_revision_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_revision_operations (
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    work_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    operation text NOT NULL,
    request_payload jsonb NOT NULL,
    resulting_status text NOT NULL,
    resulting_version bigint NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT work_revision_operations_operation_check CHECK ((operation = ANY (ARRAY['revision_submitted'::text, 'revision_withdrawn'::text]))),
    CONSTRAINT work_revision_operations_resulting_status_check CHECK ((resulting_status = ANY (ARRAY['pending_review'::text, 'withdrawn'::text]))),
    CONSTRAINT work_revision_operations_resulting_version_check CHECK ((resulting_version > 0))
);


--
-- Name: work_revision_tags; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_revision_tags (
    revision_id uuid NOT NULL,
    "position" smallint NOT NULL,
    display_label text NOT NULL,
    normalized_identity text NOT NULL,
    CONSTRAINT work_revision_tags_display_label_check CHECK (((display_label = btrim(display_label)) AND ((char_length(display_label) >= 1) AND (char_length(display_label) <= 50)))),
    CONSTRAINT work_revision_tags_normalized_identity_check CHECK (((normalized_identity = btrim(normalized_identity)) AND ((char_length(normalized_identity) >= 1) AND (char_length(normalized_identity) <= 255)))),
    CONSTRAINT work_revision_tags_position_check CHECK ((("position" >= 1) AND ("position" <= 5)))
);


--
-- Name: work_revision_video_links; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_revision_video_links (
    revision_id uuid NOT NULL,
    "position" smallint NOT NULL,
    provider text NOT NULL,
    provider_video_id text NOT NULL,
    url text NOT NULL,
    CONSTRAINT work_revision_video_links_position_check CHECK ((("position" >= 1) AND ("position" <= 3))),
    CONSTRAINT work_revision_video_links_provider_check CHECK ((provider = ANY (ARRAY['youtube'::text, 'tiktok'::text]))),
    CONSTRAINT work_revision_video_links_provider_video_id_check CHECK (((char_length(provider_video_id) >= 1) AND (char_length(provider_video_id) <= 255))),
    CONSTRAINT work_revision_video_links_url_check CHECK (((char_length(url) <= 2048) AND (url ~ '^https://'::text)))
);


--
-- Name: work_revisions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    revision_number bigint NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    base_published_revision_id uuid,
    draft_version bigint,
    title text NOT NULL,
    summary text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    academic_year smallint NOT NULL,
    semester text NOT NULL,
    submitted_at timestamp with time zone NOT NULL,
    withdrawn_at timestamp with time zone,
    version bigint DEFAULT 1 NOT NULL,
    author_kind text DEFAULT 'student_submission'::text NOT NULL,
    CONSTRAINT work_revisions_academic_year_check CHECK (((academic_year >= 2400) AND (academic_year <= 2700))),
    CONSTRAINT work_revisions_author_kind_check CHECK ((author_kind = ANY (ARRAY['student_submission'::text, 'admin_correction'::text]))),
    CONSTRAINT work_revisions_author_source_valid CHECK ((((author_kind = 'student_submission'::text) AND (draft_version IS NOT NULL)) OR ((author_kind = 'admin_correction'::text) AND (draft_version IS NULL)))),
    CONSTRAINT work_revisions_category_check CHECK ((category = ANY (ARRAY['course_work'::text, 'competition_entry'::text, 'academic_article'::text]))),
    CONSTRAINT work_revisions_description_check CHECK (((description = btrim(description)) AND ((char_length(description) >= 1) AND (char_length(description) <= 10000)))),
    CONSTRAINT work_revisions_draft_version_check CHECK ((draft_version > 0)),
    CONSTRAINT work_revisions_revision_number_check CHECK ((revision_number > 0)),
    CONSTRAINT work_revisions_semester_check CHECK ((semester = ANY (ARRAY['1'::text, '2'::text, 'summer'::text]))),
    CONSTRAINT work_revisions_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'changes_requested'::text, 'approved'::text, 'withdrawn'::text]))),
    CONSTRAINT work_revisions_summary_check CHECK (((summary = btrim(summary)) AND ((char_length(summary) >= 1) AND (char_length(summary) <= 300)))),
    CONSTRAINT work_revisions_title_check CHECK (((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 150)))),
    CONSTRAINT work_revisions_version_check CHECK ((version > 0)),
    CONSTRAINT work_revisions_withdrawal_state_valid CHECK ((((status = 'withdrawn'::text) AND (withdrawn_at IS NOT NULL)) OR ((status <> 'withdrawn'::text) AND (withdrawn_at IS NULL))))
);


--
-- Name: work_saved_draft_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.work_saved_draft_operations (
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    work_id uuid NOT NULL,
    operation text NOT NULL,
    request_fingerprint character(64) NOT NULL,
    resulting_work_version bigint NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT work_saved_draft_operations_operation_check CHECK ((operation = ANY (ARRAY['archive_saved_draft'::text, 'restore_saved_draft'::text]))),
    CONSTRAINT work_saved_draft_operations_request_fingerprint_check CHECK ((request_fingerprint ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT work_saved_draft_operations_resulting_work_version_check CHECK ((resulting_work_version > 0))
);


--
-- Name: academic_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_settings (
    singleton boolean DEFAULT true NOT NULL,
    current_academic_year smallint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    updated_by_account_id uuid,
    CONSTRAINT academic_settings_current_academic_year_check CHECK (((current_academic_year >= 2400) AND (current_academic_year <= 2700))),
    CONSTRAINT academic_settings_singleton_check CHECK (singleton),
    CONSTRAINT academic_settings_version_check CHECK ((version >= 0))
);


--
-- Name: account_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_roles (
    account_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_roles_role_check CHECK ((role = ANY (ARRAY['student'::text, 'admin'::text])))
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    person_id uuid NOT NULL,
    provider_user_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    credential_state text DEFAULT 'initial'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    control_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT accounts_control_version_check CHECK ((control_version > 0)),
    CONSTRAINT accounts_credential_state_check CHECK ((credential_state = ANY (ARRAY['initial'::text, 'reset_required'::text, 'set'::text]))),
    CONSTRAINT accounts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
);


--
-- Name: people; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_consents (
    id bigint NOT NULL,
    person_id uuid NOT NULL,
    consent_text_version text NOT NULL,
    granted_at timestamp with time zone NOT NULL,
    withdrawn_at timestamp with time zone,
    CONSTRAINT profile_consents_consent_text_version_check CHECK ((consent_text_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'::text)),
    CONSTRAINT profile_consents_time_order_valid CHECK (((withdrawn_at IS NULL) OR (withdrawn_at >= granted_at)))
);


--
-- Name: profile_consents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.profile_consents ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.profile_consents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: public_profile_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_profile_links (
    person_id uuid NOT NULL,
    "position" smallint NOT NULL,
    label text NOT NULL,
    url text NOT NULL,
    CONSTRAINT public_profile_links_label_check CHECK (((label = btrim(label)) AND ((char_length(label) >= 1) AND (char_length(label) <= 50)))),
    CONSTRAINT public_profile_links_position_check CHECK ((("position" >= 1) AND ("position" <= 5))),
    CONSTRAINT public_profile_links_url_check CHECK (((char_length(url) <= 2048) AND (url ~ '^https://'::text)))
);


--
-- Name: public_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_profiles (
    person_id uuid NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    display_name text NOT NULL,
    bio text,
    photo_id uuid,
    version bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    normalized_display_name text NOT NULL,
    CONSTRAINT public_profiles_bio_check CHECK (((bio IS NULL) OR ((bio = btrim(bio)) AND ((char_length(bio) >= 1) AND (char_length(bio) <= 500))))),
    CONSTRAINT public_profiles_display_name_check CHECK (((display_name = btrim(display_name)) AND ((char_length(display_name) >= 1) AND (char_length(display_name) <= 100)))),
    CONSTRAINT public_profiles_version_check CHECK ((version > 0))
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    person_id uuid NOT NULL,
    entry_year smallint NOT NULL,
    access_ends_academic_year smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT students_access_period_minimum CHECK ((access_ends_academic_year >= (entry_year + 7))),
    CONSTRAINT students_access_period_valid CHECK ((access_ends_academic_year >= entry_year)),
    CONSTRAINT students_entry_year_check CHECK (((entry_year >= 2400) AND (entry_year <= 2700)))
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    normalized_identity text NOT NULL,
    display_label text NOT NULL,
    activated_at timestamp with time zone NOT NULL,
    active_work_count bigint DEFAULT 0 NOT NULL,
    CONSTRAINT tags_active_work_count_check CHECK ((active_work_count >= 0)),
    CONSTRAINT tags_display_label_check CHECK (((display_label = btrim(display_label)) AND ((char_length(display_label) >= 1) AND (char_length(display_label) <= 50)))),
    CONSTRAINT tags_normalized_identity_check CHECK (((normalized_identity = btrim(normalized_identity)) AND ((char_length(normalized_identity) >= 1) AND (char_length(normalized_identity) <= 255))))
);


--
-- Name: works; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.works (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    submitter_person_id uuid NOT NULL,
    activity_state text DEFAULT 'active'::text NOT NULL,
    publication_state text DEFAULT 'never_published'::text NOT NULL,
    published_revision_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    archive_source text,
    CONSTRAINT works_activity_state_check CHECK ((activity_state = ANY (ARRAY['active'::text, 'archived'::text]))),
    CONSTRAINT works_archive_source_valid CHECK ((((activity_state = 'active'::text) AND (archive_source IS NULL)) OR ((activity_state = 'archived'::text) AND (archive_source = ANY (ARRAY['admin'::text, 'submitter'::text]))))),
    CONSTRAINT works_publication_state_check CHECK ((publication_state = ANY (ARRAY['never_published'::text, 'published'::text, 'unpublished'::text]))),
    CONSTRAINT works_version_check CHECK ((version > 0))
);


--
-- Name: academic_year_change_audit_events academic_year_change_audit_events_idempotency_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.academic_year_change_audit_events
    ADD CONSTRAINT academic_year_change_audit_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: academic_year_change_audit_events academic_year_change_audit_events_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.academic_year_change_audit_events
    ADD CONSTRAINT academic_year_change_audit_events_pkey PRIMARY KEY (id);


--
-- Name: admin_auth_identities admin_auth_identities_admin_login_hash_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_auth_identities
    ADD CONSTRAINT admin_auth_identities_admin_login_hash_key UNIQUE (admin_login_hash);


--
-- Name: admin_auth_identities admin_auth_identities_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_auth_identities
    ADD CONSTRAINT admin_auth_identities_pkey PRIMARY KEY (account_id);


--
-- Name: admin_auth_identities admin_auth_identities_synthetic_identity_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_auth_identities
    ADD CONSTRAINT admin_auth_identities_synthetic_identity_key UNIQUE (synthetic_identity);


--
-- Name: admin_correction_audits admin_correction_audits_idempotency_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_correction_audits
    ADD CONSTRAINT admin_correction_audits_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: admin_correction_audits admin_correction_audits_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_correction_audits
    ADD CONSTRAINT admin_correction_audits_pkey PRIMARY KEY (id);


--
-- Name: admin_correction_audits admin_correction_audits_revision_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_correction_audits
    ADD CONSTRAINT admin_correction_audits_revision_id_key UNIQUE (revision_id);


--
-- Name: attribution_account_lookup_rate_limits attribution_account_lookup_rate_limits_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_account_lookup_rate_limits
    ADD CONSTRAINT attribution_account_lookup_rate_limits_pkey PRIMARY KEY (actor_account_id);


--
-- Name: attribution_invitation_operations attribution_invitation_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitation_operations
    ADD CONSTRAINT attribution_invitation_operations_pkey PRIMARY KEY (idempotency_key);


--
-- Name: attribution_invitation_sessions attribution_invitation_sessions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitation_sessions
    ADD CONSTRAINT attribution_invitation_sessions_pkey PRIMARY KEY (session_hash);


--
-- Name: attribution_invitations attribution_invitations_invitation_token_hash_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitations
    ADD CONSTRAINT attribution_invitations_invitation_token_hash_key UNIQUE (invitation_token_hash);


--
-- Name: attribution_invitations attribution_invitations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitations
    ADD CONSTRAINT attribution_invitations_pkey PRIMARY KEY (id);


--
-- Name: attribution_invitations attribution_invitations_public_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitations
    ADD CONSTRAINT attribution_invitations_public_id_key UNIQUE (public_id);


--
-- Name: attribution_invitations attribution_invitations_recovery_code_hash_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitations
    ADD CONSTRAINT attribution_invitations_recovery_code_hash_key UNIQUE (recovery_code_hash);


--
-- Name: attribution_removal_operations attribution_removal_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_operations
    ADD CONSTRAINT attribution_removal_operations_pkey PRIMARY KEY (idempotency_key);


--
-- Name: attribution_removal_rate_limits attribution_removal_rate_limits_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_rate_limits
    ADD CONSTRAINT attribution_removal_rate_limits_pkey PRIMARY KEY (dimension, key_hash);


--
-- Name: attribution_removal_requests attribution_removal_requests_attribution_public_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_requests
    ADD CONSTRAINT attribution_removal_requests_attribution_public_id_key UNIQUE (attribution_public_id);


--
-- Name: attribution_removal_requests attribution_removal_requests_correction_revision_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_requests
    ADD CONSTRAINT attribution_removal_requests_correction_revision_id_key UNIQUE (correction_revision_id);


--
-- Name: attribution_removal_requests attribution_removal_requests_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_requests
    ADD CONSTRAINT attribution_removal_requests_pkey PRIMARY KEY (id);


--
-- Name: attribution_removal_requests attribution_removal_requests_public_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_requests
    ADD CONSTRAINT attribution_removal_requests_public_id_key UNIQUE (public_id);


--
-- Name: attribution_source_lookup_rate_limits attribution_source_lookup_rate_limits_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_source_lookup_rate_limits
    ADD CONSTRAINT attribution_source_lookup_rate_limits_pkey PRIMARY KEY (source_key_hash);


--
-- Name: authentication_audit_events authentication_audit_events_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.authentication_audit_events
    ADD CONSTRAINT authentication_audit_events_pkey PRIMARY KEY (id);


--
-- Name: authentication_rate_limits authentication_rate_limits_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.authentication_rate_limits
    ADD CONSTRAINT authentication_rate_limits_pkey PRIMARY KEY (key_kind, key_hash);


--
-- Name: authentication_sessions authentication_sessions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.authentication_sessions
    ADD CONSTRAINT authentication_sessions_pkey PRIMARY KEY (session_id_hash);


--
-- Name: cache_invalidation_deliveries cache_invalidation_deliveries_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.cache_invalidation_deliveries
    ADD CONSTRAINT cache_invalidation_deliveries_pkey PRIMARY KEY (event_id);


--
-- Name: issue_56_contributor_cutover_state issue_56_contributor_cutover_state_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.issue_56_contributor_cutover_state
    ADD CONSTRAINT issue_56_contributor_cutover_state_pkey PRIMARY KEY (singleton);


--
-- Name: outbox_events outbox_events_aggregate_type_aggregate_id_event_type_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.outbox_events
    ADD CONSTRAINT outbox_events_aggregate_type_aggregate_id_event_type_key UNIQUE (aggregate_type, aggregate_id, event_type);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: person_name_correction_audit_events person_name_correction_audit_events_idempotency_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.person_name_correction_audit_events
    ADD CONSTRAINT person_name_correction_audit_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: person_name_correction_audit_events person_name_correction_audit_events_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.person_name_correction_audit_events
    ADD CONSTRAINT person_name_correction_audit_events_pkey PRIMARY KEY (id);


--
-- Name: person_names person_names_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.person_names
    ADD CONSTRAINT person_names_pkey PRIMARY KEY (person_id);


--
-- Name: profile_operations profile_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_operations
    ADD CONSTRAINT profile_operations_pkey PRIMARY KEY (idempotency_key);


--
-- Name: profile_photo_assets profile_photo_assets_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_photo_assets
    ADD CONSTRAINT profile_photo_assets_pkey PRIMARY KEY (id);


--
-- Name: profile_photo_assets profile_photo_assets_quarantine_object_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_photo_assets
    ADD CONSTRAINT profile_photo_assets_quarantine_object_key_key UNIQUE (quarantine_object_key);


--
-- Name: profile_photo_assets profile_photo_assets_sanitized_object_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_photo_assets
    ADD CONSTRAINT profile_photo_assets_sanitized_object_key_key UNIQUE (sanitized_object_key);


--
-- Name: public_cache_version public_cache_version_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.public_cache_version
    ADD CONSTRAINT public_cache_version_pkey PRIMARY KEY (singleton);


--
-- Name: public_work_catalog public_work_catalog_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.public_work_catalog
    ADD CONSTRAINT public_work_catalog_pkey PRIMARY KEY (work_id);


--
-- Name: public_work_catalog public_work_catalog_revision_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.public_work_catalog
    ADD CONSTRAINT public_work_catalog_revision_id_key UNIQUE (revision_id);


--
-- Name: public_work_catalog public_work_catalog_work_public_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.public_work_catalog
    ADD CONSTRAINT public_work_catalog_work_public_id_key UNIQUE (work_public_id);


--
-- Name: published_revision_tags published_revision_tags_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.published_revision_tags
    ADD CONSTRAINT published_revision_tags_pkey PRIMARY KEY (revision_id, "position");


--
-- Name: published_revision_tags published_revision_tags_revision_id_tag_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.published_revision_tags
    ADD CONSTRAINT published_revision_tags_revision_id_tag_id_key UNIQUE (revision_id, tag_id);


--
-- Name: removal_request_operations removal_request_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.removal_request_operations
    ADD CONSTRAINT removal_request_operations_pkey PRIMARY KEY (idempotency_key);


--
-- Name: removal_requests removal_requests_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.removal_requests
    ADD CONSTRAINT removal_requests_pkey PRIMARY KEY (id);


--
-- Name: removal_requests removal_requests_public_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.removal_requests
    ADD CONSTRAINT removal_requests_public_id_key UNIQUE (public_id);


--
-- Name: reviews reviews_idempotency_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.reviews
    ADD CONSTRAINT reviews_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_public_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.reviews
    ADD CONSTRAINT reviews_public_id_key UNIQUE (public_id);


--
-- Name: reviews reviews_revision_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.reviews
    ADD CONSTRAINT reviews_revision_id_key UNIQUE (revision_id);


--
-- Name: roster_audit_events roster_audit_events_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_audit_events
    ADD CONSTRAINT roster_audit_events_pkey PRIMARY KEY (id);


--
-- Name: roster_batches roster_batches_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_batches
    ADD CONSTRAINT roster_batches_pkey PRIMARY KEY (id);


--
-- Name: roster_conflict_resolution_audit_events roster_conflict_resolution_audit_events_idempotency_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflict_resolution_audit_events
    ADD CONSTRAINT roster_conflict_resolution_audit_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: roster_conflict_resolution_audit_events roster_conflict_resolution_audit_events_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflict_resolution_audit_events
    ADD CONSTRAINT roster_conflict_resolution_audit_events_pkey PRIMARY KEY (id);


--
-- Name: roster_conflicts roster_conflicts_batch_id_source_row_number_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflicts
    ADD CONSTRAINT roster_conflicts_batch_id_source_row_number_key UNIQUE (batch_id, source_row_number);


--
-- Name: roster_conflicts roster_conflicts_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflicts
    ADD CONSTRAINT roster_conflicts_pkey PRIMARY KEY (id);


--
-- Name: roster_conflicts roster_conflicts_resolution_idempotency_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflicts
    ADD CONSTRAINT roster_conflicts_resolution_idempotency_key_key UNIQUE (resolution_idempotency_key);


--
-- Name: roster_rows roster_rows_batch_id_row_number_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_rows
    ADD CONSTRAINT roster_rows_batch_id_row_number_key UNIQUE (batch_id, row_number);


--
-- Name: roster_rows roster_rows_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_rows
    ADD CONSTRAINT roster_rows_pkey PRIMARY KEY (id);


--
-- Name: student_access_extension_audit_events student_access_extension_audit_events_idempotency_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_access_extension_audit_events
    ADD CONSTRAINT student_access_extension_audit_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: student_access_extension_audit_events student_access_extension_audit_events_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_access_extension_audit_events
    ADD CONSTRAINT student_access_extension_audit_events_pkey PRIMARY KEY (id);


--
-- Name: student_auth_identities student_auth_identities_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_auth_identities
    ADD CONSTRAINT student_auth_identities_pkey PRIMARY KEY (account_id);


--
-- Name: student_auth_identities student_auth_identities_student_id_hash_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_auth_identities
    ADD CONSTRAINT student_auth_identities_student_id_hash_key UNIQUE (student_id_hash);


--
-- Name: student_auth_identities student_auth_identities_synthetic_identity_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_auth_identities
    ADD CONSTRAINT student_auth_identities_synthetic_identity_key UNIQUE (synthetic_identity);


--
-- Name: student_id_search_prefixes student_id_search_prefixes_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_id_search_prefixes
    ADD CONSTRAINT student_id_search_prefixes_pkey PRIMARY KEY (account_id, prefix_length);


--
-- Name: student_password_reset_operations student_password_reset_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_password_reset_operations
    ADD CONSTRAINT student_password_reset_operations_pkey PRIMARY KEY (idempotency_key);


--
-- Name: work_contributor_candidates work_contributor_candidates_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_contributor_candidates
    ADD CONSTRAINT work_contributor_candidates_pkey PRIMARY KEY (reference);


--
-- Name: work_contributor_candidates work_contributor_candidates_reference_work_id_person_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_contributor_candidates
    ADD CONSTRAINT work_contributor_candidates_reference_work_id_person_id_key UNIQUE (reference, work_id, person_id);


--
-- Name: work_draft_contributor_backfill_items work_draft_contributor_backfill_items_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributor_backfill_items
    ADD CONSTRAINT work_draft_contributor_backfill_items_pkey PRIMARY KEY (invitation_id);


--
-- Name: work_draft_contributor_backfill_runs work_draft_contributor_backfill_runs_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributor_backfill_runs
    ADD CONSTRAINT work_draft_contributor_backfill_runs_pkey PRIMARY KEY (id);


--
-- Name: work_draft_contributor_operations work_draft_contributor_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributor_operations
    ADD CONSTRAINT work_draft_contributor_operations_pkey PRIMARY KEY (idempotency_key);


--
-- Name: work_draft_contributors work_draft_contributors_legacy_invitation_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributors
    ADD CONSTRAINT work_draft_contributors_legacy_invitation_id_key UNIQUE (legacy_invitation_id);


--
-- Name: work_draft_contributors work_draft_contributors_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributors
    ADD CONSTRAINT work_draft_contributors_pkey PRIMARY KEY (id);


--
-- Name: work_draft_contributors work_draft_contributors_public_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributors
    ADD CONSTRAINT work_draft_contributors_public_id_key UNIQUE (public_id);


--
-- Name: work_draft_links work_draft_links_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_links
    ADD CONSTRAINT work_draft_links_pkey PRIMARY KEY (work_id, "position");


--
-- Name: work_draft_links work_draft_links_work_id_url_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_links
    ADD CONSTRAINT work_draft_links_work_id_url_key UNIQUE (work_id, url);


--
-- Name: work_draft_media work_draft_media_asset_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_media
    ADD CONSTRAINT work_draft_media_asset_id_key UNIQUE (asset_id);


--
-- Name: work_draft_media work_draft_media_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_media
    ADD CONSTRAINT work_draft_media_pkey PRIMARY KEY (work_id, media_kind, "position");


--
-- Name: work_draft_tags work_draft_tags_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_tags
    ADD CONSTRAINT work_draft_tags_pkey PRIMARY KEY (work_id, "position");


--
-- Name: work_draft_tags work_draft_tags_work_id_normalized_identity_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_tags
    ADD CONSTRAINT work_draft_tags_work_id_normalized_identity_key UNIQUE (work_id, normalized_identity);


--
-- Name: work_draft_video_links work_draft_video_links_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_video_links
    ADD CONSTRAINT work_draft_video_links_pkey PRIMARY KEY (work_id, "position");


--
-- Name: work_draft_video_links work_draft_video_links_work_id_provider_provider_video_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_video_links
    ADD CONSTRAINT work_draft_video_links_work_id_provider_provider_video_id_key UNIQUE (work_id, provider, provider_video_id);


--
-- Name: work_drafts work_drafts_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_drafts
    ADD CONSTRAINT work_drafts_pkey PRIMARY KEY (work_id);


--
-- Name: work_media_assets work_media_assets_master_object_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_media_assets
    ADD CONSTRAINT work_media_assets_master_object_key_key UNIQUE (master_object_key);


--
-- Name: work_media_assets work_media_assets_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_media_assets
    ADD CONSTRAINT work_media_assets_pkey PRIMARY KEY (id);


--
-- Name: work_media_assets work_media_assets_quarantine_object_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_media_assets
    ADD CONSTRAINT work_media_assets_quarantine_object_key_key UNIQUE (quarantine_object_key);


--
-- Name: work_media_variants work_media_variants_object_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_media_variants
    ADD CONSTRAINT work_media_variants_object_key_key UNIQUE (object_key);


--
-- Name: work_media_variants work_media_variants_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_media_variants
    ADD CONSTRAINT work_media_variants_pkey PRIMARY KEY (asset_id, width);


--
-- Name: work_operations work_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_operations
    ADD CONSTRAINT work_operations_pkey PRIMARY KEY (idempotency_key);


--
-- Name: work_recovery_audits work_recovery_audits_idempotency_key_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_recovery_audits
    ADD CONSTRAINT work_recovery_audits_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: work_recovery_audits work_recovery_audits_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_recovery_audits
    ADD CONSTRAINT work_recovery_audits_pkey PRIMARY KEY (id);


--
-- Name: work_recovery_audits work_recovery_audits_public_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_recovery_audits
    ADD CONSTRAINT work_recovery_audits_public_id_key UNIQUE (public_id);


--
-- Name: work_revision_attributions work_revision_attributions_attribution_public_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_attributions
    ADD CONSTRAINT work_revision_attributions_attribution_public_id_key UNIQUE (attribution_public_id);


--
-- Name: work_revision_attributions work_revision_attributions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_attributions
    ADD CONSTRAINT work_revision_attributions_pkey PRIMARY KEY (revision_id, "position");


--
-- Name: work_revision_attributions work_revision_attributions_revision_id_person_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_attributions
    ADD CONSTRAINT work_revision_attributions_revision_id_person_id_key UNIQUE (revision_id, person_id);


--
-- Name: work_revision_links work_revision_links_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_links
    ADD CONSTRAINT work_revision_links_pkey PRIMARY KEY (revision_id, "position");


--
-- Name: work_revision_links work_revision_links_revision_id_url_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_links
    ADD CONSTRAINT work_revision_links_revision_id_url_key UNIQUE (revision_id, url);


--
-- Name: work_revision_media work_revision_media_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_media
    ADD CONSTRAINT work_revision_media_pkey PRIMARY KEY (revision_id, media_kind, "position");


--
-- Name: work_revision_media work_revision_media_revision_id_asset_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_media
    ADD CONSTRAINT work_revision_media_revision_id_asset_id_key UNIQUE (revision_id, asset_id);


--
-- Name: work_revision_operations work_revision_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_operations
    ADD CONSTRAINT work_revision_operations_pkey PRIMARY KEY (idempotency_key);


--
-- Name: work_revision_tags work_revision_tags_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_tags
    ADD CONSTRAINT work_revision_tags_pkey PRIMARY KEY (revision_id, "position");


--
-- Name: work_revision_tags work_revision_tags_revision_id_normalized_identity_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_tags
    ADD CONSTRAINT work_revision_tags_revision_id_normalized_identity_key UNIQUE (revision_id, normalized_identity);


--
-- Name: work_revision_video_links work_revision_video_links_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_video_links
    ADD CONSTRAINT work_revision_video_links_pkey PRIMARY KEY (revision_id, "position");


--
-- Name: work_revision_video_links work_revision_video_links_revision_id_provider_provider_vid_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_video_links
    ADD CONSTRAINT work_revision_video_links_revision_id_provider_provider_vid_key UNIQUE (revision_id, provider, provider_video_id);


--
-- Name: work_revisions work_revisions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revisions
    ADD CONSTRAINT work_revisions_pkey PRIMARY KEY (id);


--
-- Name: work_revisions work_revisions_public_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revisions
    ADD CONSTRAINT work_revisions_public_id_key UNIQUE (public_id);


--
-- Name: work_revisions work_revisions_work_id_revision_number_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revisions
    ADD CONSTRAINT work_revisions_work_id_revision_number_key UNIQUE (work_id, revision_number);


--
-- Name: work_saved_draft_operations work_saved_draft_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_saved_draft_operations
    ADD CONSTRAINT work_saved_draft_operations_pkey PRIMARY KEY (idempotency_key);


--
-- Name: academic_settings academic_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_settings
    ADD CONSTRAINT academic_settings_pkey PRIMARY KEY (singleton);


--
-- Name: account_roles account_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_roles
    ADD CONSTRAINT account_roles_pkey PRIMARY KEY (account_id, role);


--
-- Name: accounts accounts_person_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_person_id_key UNIQUE (person_id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_provider_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_provider_user_id_key UNIQUE (provider_user_id);


--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);


--
-- Name: profile_consents profile_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_consents
    ADD CONSTRAINT profile_consents_pkey PRIMARY KEY (id);


--
-- Name: public_profile_links public_profile_links_person_id_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_profile_links
    ADD CONSTRAINT public_profile_links_person_id_url_key UNIQUE (person_id, url);


--
-- Name: public_profile_links public_profile_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_profile_links
    ADD CONSTRAINT public_profile_links_pkey PRIMARY KEY (person_id, "position");


--
-- Name: public_profiles public_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_profiles
    ADD CONSTRAINT public_profiles_pkey PRIMARY KEY (person_id);


--
-- Name: public_profiles public_profiles_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_profiles
    ADD CONSTRAINT public_profiles_public_id_key UNIQUE (public_id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (person_id);


--
-- Name: tags tags_normalized_identity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_normalized_identity_key UNIQUE (normalized_identity);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: tags tags_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_public_id_key UNIQUE (public_id);


--
-- Name: works works_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.works
    ADD CONSTRAINT works_pkey PRIMARY KEY (id);


--
-- Name: works works_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.works
    ADD CONSTRAINT works_public_id_key UNIQUE (public_id);


--
-- Name: admin_correction_audits_actor_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX admin_correction_audits_actor_time_idx ON private.admin_correction_audits USING btree (actor_account_id, occurred_at DESC, id DESC);


--
-- Name: admin_correction_audits_base_revision_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX admin_correction_audits_base_revision_idx ON private.admin_correction_audits USING btree (base_revision_id);


--
-- Name: admin_correction_audits_work_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX admin_correction_audits_work_time_idx ON private.admin_correction_audits USING btree (work_id, occurred_at DESC, id DESC);


--
-- Name: attribution_invitation_operations_invitation_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_invitation_operations_invitation_time_idx ON private.attribution_invitation_operations USING btree (invitation_id, occurred_at DESC) WHERE (invitation_id IS NOT NULL);


--
-- Name: attribution_invitation_sessions_invitation_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_invitation_sessions_invitation_idx ON private.attribution_invitation_sessions USING btree (invitation_id, expires_at DESC);


--
-- Name: attribution_invitations_active_work_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_invitations_active_work_idx ON private.attribution_invitations USING btree (work_id) WHERE (state = ANY (ARRAY['pending'::text, 'accepted'::text]));


--
-- Name: attribution_invitations_issue_56_backfill_order_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_invitations_issue_56_backfill_order_idx ON private.attribution_invitations USING btree (created_at, id);


--
-- Name: attribution_invitations_issue_56_work_order_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_invitations_issue_56_work_order_idx ON private.attribution_invitations USING btree (work_id, created_at, id) WHERE (state = ANY (ARRAY['accepted'::text, 'pending'::text]));


--
-- Name: attribution_invitations_pending_person_work_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX attribution_invitations_pending_person_work_idx ON private.attribution_invitations USING btree (work_id, invitee_person_id) WHERE ((state = 'pending'::text) AND (invitee_person_id IS NOT NULL));


--
-- Name: attribution_invitations_recipient_pending_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_invitations_recipient_pending_idx ON private.attribution_invitations USING btree (invitee_person_id, created_at DESC, id DESC) WHERE (state = 'pending'::text);


--
-- Name: attribution_invitations_work_history_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_invitations_work_history_idx ON private.attribution_invitations USING btree (work_id, created_at DESC, id DESC);


--
-- Name: attribution_removal_admin_queue_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_removal_admin_queue_idx ON private.attribution_removal_requests USING btree (created_at, id) WHERE (state = 'pending'::text);


--
-- Name: attribution_removal_operations_request_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_removal_operations_request_time_idx ON private.attribution_removal_operations USING btree (request_id, occurred_at DESC);


--
-- Name: attribution_removal_pending_target_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX attribution_removal_pending_target_idx ON private.attribution_removal_requests USING btree (invitation_id, revision_id) WHERE (state = 'pending'::text);


--
-- Name: attribution_removal_target_history_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_removal_target_history_idx ON private.attribution_removal_requests USING btree (attribution_public_id, created_at DESC, id DESC) WHERE (attribution_public_id IS NOT NULL);


--
-- Name: attribution_removal_work_history_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX attribution_removal_work_history_idx ON private.attribution_removal_requests USING btree (work_id, created_at DESC, id DESC);


--
-- Name: authentication_audit_events_account_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX authentication_audit_events_account_time_idx ON private.authentication_audit_events USING btree (account_id, occurred_at DESC);


--
-- Name: authentication_sessions_active_account_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX authentication_sessions_active_account_idx ON private.authentication_sessions USING btree (account_id, created_at DESC) WHERE (revoked_at IS NULL);


--
-- Name: authentication_sessions_expiry_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX authentication_sessions_expiry_idx ON private.authentication_sessions USING btree (absolute_expires_at) WHERE (revoked_at IS NULL);


--
-- Name: cache_invalidation_deliveries_claim_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX cache_invalidation_deliveries_claim_idx ON private.cache_invalidation_deliveries USING btree (next_attempt_at, event_id) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: outbox_events_pending_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX outbox_events_pending_idx ON private.outbox_events USING btree (occurred_at, id) WHERE (published_at IS NULL);


--
-- Name: person_name_correction_target_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX person_name_correction_target_time_idx ON private.person_name_correction_audit_events USING btree (student_account_id, occurred_at DESC);


--
-- Name: person_names_contributor_first_name_prefix_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX person_names_contributor_first_name_prefix_idx ON private.person_names USING btree (lower(first_name_th) text_pattern_ops, person_id) WHERE ((first_name_th IS NOT NULL) AND (last_name_th IS NOT NULL));


--
-- Name: person_names_contributor_last_name_prefix_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX person_names_contributor_last_name_prefix_idx ON private.person_names USING btree (lower(last_name_th) text_pattern_ops, person_id) WHERE ((first_name_th IS NOT NULL) AND (last_name_th IS NOT NULL));


--
-- Name: person_names_contributor_search_trgm_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX person_names_contributor_search_trgm_idx ON private.person_names USING gin (lower(((first_name_th || ' '::text) || last_name_th)) extensions.gin_trgm_ops) WHERE ((first_name_th IS NOT NULL) AND (last_name_th IS NOT NULL));


--
-- Name: person_names_public_catalog_browse_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX person_names_public_catalog_browse_idx ON private.person_names USING btree (lower(regexp_replace(NORMALIZE(btrim(((first_name_th || ' '::text) || last_name_th)), NFKC), '[[:space:]]+'::text, ' '::text, 'g'::text)), person_id) WHERE ((first_name_th IS NOT NULL) AND (last_name_th IS NOT NULL));


--
-- Name: person_names_public_catalog_search_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX person_names_public_catalog_search_idx ON private.person_names USING gin (lower(regexp_replace(NORMALIZE(btrim(((first_name_th || ' '::text) || last_name_th)), NFKC), '[[:space:]]+'::text, ' '::text, 'g'::text)) extensions.gin_trgm_ops) WHERE ((first_name_th IS NOT NULL) AND (last_name_th IS NOT NULL));


--
-- Name: profile_operations_actor_account_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX profile_operations_actor_account_idx ON private.profile_operations USING btree (actor_account_id);


--
-- Name: profile_operations_person_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX profile_operations_person_time_idx ON private.profile_operations USING btree (person_id, occurred_at DESC);


--
-- Name: profile_photo_assets_expiry_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX profile_photo_assets_expiry_idx ON private.profile_photo_assets USING btree (expires_at) WHERE (status = ANY (ARRAY['pending_upload'::text, 'processing'::text]));


--
-- Name: profile_photo_assets_person_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX profile_photo_assets_person_time_idx ON private.profile_photo_assets USING btree (person_id, created_at DESC);


--
-- Name: public_work_catalog_academic_period_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX public_work_catalog_academic_period_idx ON private.public_work_catalog USING btree (academic_year DESC, semester_order DESC, published_at DESC, work_public_id DESC);


--
-- Name: public_work_catalog_category_recent_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX public_work_catalog_category_recent_idx ON private.public_work_catalog USING btree (category, published_at DESC, work_public_id DESC);


--
-- Name: public_work_catalog_period_recent_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX public_work_catalog_period_recent_idx ON private.public_work_catalog USING btree (academic_year, semester, published_at DESC, work_public_id DESC);


--
-- Name: public_work_catalog_recent_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX public_work_catalog_recent_idx ON private.public_work_catalog USING btree (published_at DESC, work_public_id DESC);


--
-- Name: public_work_catalog_search_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX public_work_catalog_search_idx ON private.public_work_catalog USING gin (normalized_search extensions.gin_trgm_ops);


--
-- Name: public_work_catalog_title_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX public_work_catalog_title_idx ON private.public_work_catalog USING btree (normalized_title, work_public_id);


--
-- Name: published_revision_tags_tag_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX published_revision_tags_tag_idx ON private.published_revision_tags USING btree (tag_id, revision_id);


--
-- Name: removal_request_operations_request_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX removal_request_operations_request_time_idx ON private.removal_request_operations USING btree (request_id, occurred_at DESC);


--
-- Name: removal_requests_admin_queue_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX removal_requests_admin_queue_idx ON private.removal_requests USING btree (created_at, id) WHERE (state = 'pending'::text);


--
-- Name: removal_requests_pending_revision_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX removal_requests_pending_revision_idx ON private.removal_requests USING btree (revision_id) WHERE (state = 'pending'::text);


--
-- Name: removal_requests_submitter_history_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX removal_requests_submitter_history_idx ON private.removal_requests USING btree (submitter_account_id, created_at DESC, id DESC);


--
-- Name: removal_requests_work_history_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX removal_requests_work_history_idx ON private.removal_requests USING btree (work_id, created_at DESC, id DESC);


--
-- Name: reviews_actor_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX reviews_actor_time_idx ON private.reviews USING btree (actor_account_id, reviewed_at DESC, id);


--
-- Name: reviews_revision_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX reviews_revision_time_idx ON private.reviews USING btree (revision_id, reviewed_at DESC, id);


--
-- Name: roster_audit_events_batch_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX roster_audit_events_batch_time_idx ON private.roster_audit_events USING btree (batch_id, occurred_at);


--
-- Name: roster_batches_completed_at_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX roster_batches_completed_at_idx ON private.roster_batches USING btree (completed_at, id) WHERE (completed_at IS NOT NULL);


--
-- Name: roster_batches_uploader_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX roster_batches_uploader_time_idx ON private.roster_batches USING btree (uploader_account_id, uploaded_at DESC);


--
-- Name: roster_conflict_audit_batch_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX roster_conflict_audit_batch_time_idx ON private.roster_conflict_resolution_audit_events USING btree (batch_id, occurred_at, id);


--
-- Name: roster_conflicts_batch_row_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX roster_conflicts_batch_row_idx ON private.roster_conflicts USING btree (batch_id, source_row_number, id);


--
-- Name: roster_conflicts_pending_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX roster_conflicts_pending_idx ON private.roster_conflicts USING btree (batch_id, source_row_number, id) WHERE (status = 'pending'::text);


--
-- Name: roster_rows_batch_student_hash_valid_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX roster_rows_batch_student_hash_valid_idx ON private.roster_rows USING btree (batch_id, student_id_hash) WHERE (student_id_hash IS NOT NULL);


--
-- Name: roster_rows_claim_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX roster_rows_claim_idx ON private.roster_rows USING btree (next_attempt_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: student_access_extension_target_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX student_access_extension_target_time_idx ON private.student_access_extension_audit_events USING btree (student_account_id, occurred_at DESC);


--
-- Name: student_id_search_prefixes_lookup_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX student_id_search_prefixes_lookup_idx ON private.student_id_search_prefixes USING btree (prefix_hash, prefix_length, account_id);


--
-- Name: student_password_reset_one_pending_per_account_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX student_password_reset_one_pending_per_account_idx ON private.student_password_reset_operations USING btree (student_account_id) WHERE (status = 'pending'::text);


--
-- Name: student_password_reset_target_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX student_password_reset_target_time_idx ON private.student_password_reset_operations USING btree (student_account_id, started_at DESC);


--
-- Name: work_contributor_candidates_expiry_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_contributor_candidates_expiry_idx ON private.work_contributor_candidates USING btree (expires_at, reference);


--
-- Name: work_draft_contributor_operations_work_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_draft_contributor_operations_work_time_idx ON private.work_draft_contributor_operations USING btree (work_id, occurred_at DESC, idempotency_key);


--
-- Name: work_draft_contributors_account_person_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX work_draft_contributors_account_person_idx ON private.work_draft_contributors USING btree (work_id, person_id) WHERE ((kind = 'account'::text) AND (removed_at IS NULL));


--
-- Name: work_draft_contributors_active_position_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX work_draft_contributors_active_position_idx ON private.work_draft_contributors USING btree (work_id, "position") WHERE (removed_at IS NULL);


--
-- Name: work_draft_contributors_person_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_draft_contributors_person_idx ON private.work_draft_contributors USING btree (person_id) WHERE (removed_at IS NULL);


--
-- Name: work_drafts_active_updated_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_drafts_active_updated_idx ON private.work_drafts USING btree (updated_at DESC, work_id) WHERE (lifecycle_state = 'active'::text);


--
-- Name: work_drafts_base_published_revision_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_drafts_base_published_revision_idx ON private.work_drafts USING btree (base_published_revision_id) WHERE (base_published_revision_id IS NOT NULL);


--
-- Name: work_media_assets_authorize_idempotency_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX work_media_assets_authorize_idempotency_idx ON private.work_media_assets USING btree (work_id, authorize_idempotency_key);


--
-- Name: work_media_assets_expiry_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_media_assets_expiry_idx ON private.work_media_assets USING btree (expires_at, id) WHERE (cleanup_started_at IS NULL);


--
-- Name: work_media_assets_processing_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_media_assets_processing_idx ON private.work_media_assets USING btree (created_at, id) WHERE (status = ANY (ARRAY['uploaded'::text, 'processing'::text]));


--
-- Name: work_media_assets_work_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_media_assets_work_time_idx ON private.work_media_assets USING btree (work_id, created_at DESC);


--
-- Name: work_operations_actor_account_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_operations_actor_account_idx ON private.work_operations USING btree (actor_account_id);


--
-- Name: work_operations_work_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_operations_work_time_idx ON private.work_operations USING btree (work_id, occurred_at DESC);


--
-- Name: work_recovery_audits_actor_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_recovery_audits_actor_time_idx ON private.work_recovery_audits USING btree (actor_account_id, occurred_at DESC, id DESC);


--
-- Name: work_recovery_audits_work_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_recovery_audits_work_time_idx ON private.work_recovery_audits USING btree (work_id, occurred_at DESC, id DESC);


--
-- Name: work_revision_attributions_person_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_revision_attributions_person_idx ON private.work_revision_attributions USING btree (person_id);


--
-- Name: work_revision_attributions_public_target_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_revision_attributions_public_target_idx ON private.work_revision_attributions USING btree (revision_id, attribution_public_id);


--
-- Name: work_revision_media_asset_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_revision_media_asset_idx ON private.work_revision_media USING btree (asset_id);


--
-- Name: work_revision_operations_actor_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_revision_operations_actor_idx ON private.work_revision_operations USING btree (actor_account_id);


--
-- Name: work_revision_operations_revision_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_revision_operations_revision_idx ON private.work_revision_operations USING btree (revision_id);


--
-- Name: work_revision_operations_work_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_revision_operations_work_time_idx ON private.work_revision_operations USING btree (work_id, occurred_at DESC);


--
-- Name: work_revisions_base_revision_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_revisions_base_revision_idx ON private.work_revisions USING btree (base_published_revision_id) WHERE (base_published_revision_id IS NOT NULL);


--
-- Name: work_revisions_one_pending_per_work_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX work_revisions_one_pending_per_work_idx ON private.work_revisions USING btree (work_id) WHERE (status = 'pending_review'::text);


--
-- Name: work_revisions_review_queue_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_revisions_review_queue_idx ON private.work_revisions USING btree (submitted_at, id) WHERE (status = 'pending_review'::text);


--
-- Name: work_saved_draft_operations_work_time_idx; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX work_saved_draft_operations_work_time_idx ON private.work_saved_draft_operations USING btree (work_id, occurred_at DESC, idempotency_key);


--
-- Name: profile_consents_active_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profile_consents_active_person_idx ON public.profile_consents USING btree (person_id) WHERE (withdrawn_at IS NULL);


--
-- Name: profile_consents_person_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_consents_person_time_idx ON public.profile_consents USING btree (person_id, granted_at DESC);


--
-- Name: public_profiles_display_name_browse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_profiles_display_name_browse_idx ON public.public_profiles USING btree (normalized_display_name, public_id);


--
-- Name: public_profiles_display_name_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_profiles_display_name_search_idx ON public.public_profiles USING gin (normalized_display_name extensions.gin_trgm_ops);


--
-- Name: public_profiles_photo_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_profiles_photo_id_idx ON public.public_profiles USING btree (photo_id) WHERE (photo_id IS NOT NULL);


--
-- Name: students_entry_year_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_entry_year_person_idx ON public.students USING btree (entry_year, person_id);


--
-- Name: tags_active_normalized_identity_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tags_active_normalized_identity_trgm_idx ON public.tags USING gin (normalized_identity extensions.gin_trgm_ops) WHERE (active_work_count > 0);


--
-- Name: tags_popularity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tags_popularity_idx ON public.tags USING btree (active_work_count DESC, public_id) WHERE (active_work_count > 0);


--
-- Name: tags_public_popularity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tags_public_popularity_idx ON public.tags USING btree (active_work_count DESC, lower(display_label), public_id) WHERE (active_work_count > 0);


--
-- Name: works_published_revision_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX works_published_revision_idx ON public.works USING btree (published_revision_id) WHERE (published_revision_id IS NOT NULL);


--
-- Name: works_submitter_current_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX works_submitter_current_page_idx ON public.works USING btree (submitter_person_id, updated_at DESC, public_id DESC) WHERE (activity_state = 'active'::text);


--
-- Name: works_submitter_saved_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX works_submitter_saved_page_idx ON public.works USING btree (submitter_person_id, updated_at DESC, public_id DESC) WHERE ((activity_state = 'archived'::text) AND (publication_state = 'never_published'::text) AND (archive_source = 'submitter'::text));


--
-- Name: works_submitter_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX works_submitter_updated_idx ON public.works USING btree (submitter_person_id, updated_at DESC);


--
-- Name: works_submitter_workspace_summary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX works_submitter_workspace_summary_idx ON public.works USING btree (submitter_person_id, activity_state, publication_state);


--
-- Name: admin_correction_audits admin_correction_audits_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER admin_correction_audits_immutable BEFORE DELETE OR UPDATE ON private.admin_correction_audits FOR EACH ROW EXECUTE FUNCTION private.prevent_admin_correction_audit_mutation();


--
-- Name: attribution_invitation_operations attribution_invitation_operations_read_only; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER attribution_invitation_operations_read_only BEFORE INSERT OR DELETE OR UPDATE ON private.attribution_invitation_operations FOR EACH ROW EXECUTE FUNCTION private.prevent_legacy_attribution_invitation_mutation();


--
-- Name: attribution_invitation_sessions attribution_invitation_sessions_read_only; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER attribution_invitation_sessions_read_only BEFORE INSERT OR DELETE OR UPDATE ON private.attribution_invitation_sessions FOR EACH ROW EXECUTE FUNCTION private.prevent_legacy_attribution_invitation_mutation();


--
-- Name: attribution_invitations attribution_invitations_read_only; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER attribution_invitations_read_only BEFORE INSERT OR DELETE OR UPDATE ON private.attribution_invitations FOR EACH ROW EXECUTE FUNCTION private.prevent_legacy_attribution_invitation_mutation();


--
-- Name: attribution_removal_operations attribution_removal_operations_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER attribution_removal_operations_immutable BEFORE DELETE OR UPDATE ON private.attribution_removal_operations FOR EACH ROW EXECUTE FUNCTION private.prevent_work_recovery_history_mutation();


--
-- Name: outbox_events outbox_enqueue_public_cache_invalidation; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER outbox_enqueue_public_cache_invalidation AFTER INSERT ON private.outbox_events FOR EACH ROW EXECUTE FUNCTION private.enqueue_public_cache_invalidation();


--
-- Name: removal_request_operations removal_request_operations_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER removal_request_operations_immutable BEFORE DELETE OR UPDATE ON private.removal_request_operations FOR EACH ROW EXECUTE FUNCTION private.prevent_work_recovery_history_mutation();


--
-- Name: reviews reviews_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER reviews_immutable BEFORE DELETE OR UPDATE ON private.reviews FOR EACH ROW EXECUTE FUNCTION private.prevent_review_mutation();


--
-- Name: person_names sync_legacy_profile_name_from_roster; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER sync_legacy_profile_name_from_roster AFTER UPDATE OF first_name_th, last_name_th ON private.person_names FOR EACH ROW WHEN (((old.first_name_th IS DISTINCT FROM new.first_name_th) OR (old.last_name_th IS DISTINCT FROM new.last_name_th))) EXECUTE FUNCTION private.sync_legacy_profile_name_from_roster();


--
-- Name: work_draft_contributors work_draft_contributors_identity_valid; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER work_draft_contributors_identity_valid BEFORE INSERT OR UPDATE OF kind, person_id ON private.work_draft_contributors FOR EACH ROW EXECUTE FUNCTION private.validate_work_draft_contributor_identity();


--
-- Name: work_drafts work_drafts_base_revision_membership; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER work_drafts_base_revision_membership BEFORE INSERT OR UPDATE OF base_published_revision_id ON private.work_drafts FOR EACH ROW EXECUTE FUNCTION private.enforce_work_revision_membership();


--
-- Name: work_recovery_audits work_recovery_audits_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER work_recovery_audits_immutable BEFORE DELETE OR UPDATE ON private.work_recovery_audits FOR EACH ROW EXECUTE FUNCTION private.prevent_work_recovery_history_mutation();


--
-- Name: work_revision_attributions work_revision_attributions_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER work_revision_attributions_immutable BEFORE DELETE OR UPDATE ON private.work_revision_attributions FOR EACH ROW EXECUTE FUNCTION private.prevent_work_revision_snapshot_mutation();


--
-- Name: work_revisions work_revision_content_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER work_revision_content_immutable BEFORE UPDATE ON private.work_revisions FOR EACH ROW EXECUTE FUNCTION private.enforce_immutable_work_revision_content();


--
-- Name: work_revision_links work_revision_links_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER work_revision_links_immutable BEFORE DELETE OR UPDATE ON private.work_revision_links FOR EACH ROW EXECUTE FUNCTION private.prevent_work_revision_snapshot_mutation();


--
-- Name: work_revision_media work_revision_media_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER work_revision_media_immutable BEFORE DELETE OR UPDATE ON private.work_revision_media FOR EACH ROW EXECUTE FUNCTION private.prevent_work_revision_snapshot_mutation();


--
-- Name: work_revision_tags work_revision_tags_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER work_revision_tags_immutable BEFORE DELETE OR UPDATE ON private.work_revision_tags FOR EACH ROW EXECUTE FUNCTION private.prevent_work_revision_snapshot_mutation();


--
-- Name: work_revision_video_links work_revision_video_links_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER work_revision_video_links_immutable BEFORE DELETE OR UPDATE ON private.work_revision_video_links FOR EACH ROW EXECUTE FUNCTION private.prevent_work_revision_snapshot_mutation();


--
-- Name: work_revisions work_revisions_base_revision_membership; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER work_revisions_base_revision_membership BEFORE INSERT OR UPDATE OF base_published_revision_id ON private.work_revisions FOR EACH ROW EXECUTE FUNCTION private.enforce_work_revision_membership();


--
-- Name: public_profiles legacy_profile_name_from_roster; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER legacy_profile_name_from_roster BEFORE INSERT ON public.public_profiles FOR EACH ROW EXECUTE FUNCTION private.fill_legacy_profile_name_from_roster();


--
-- Name: public_profiles public_profiles_normalized_display_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER public_profiles_normalized_display_name BEFORE INSERT OR UPDATE OF display_name, normalized_display_name ON public.public_profiles FOR EACH ROW EXECUTE FUNCTION private.default_normalized_display_name();


--
-- Name: works works_published_revision_membership; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER works_published_revision_membership BEFORE INSERT OR UPDATE OF published_revision_id ON public.works FOR EACH ROW EXECUTE FUNCTION private.enforce_published_revision_membership();


--
-- Name: works works_submitter_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER works_submitter_immutable BEFORE UPDATE OF submitter_person_id ON public.works FOR EACH ROW EXECUTE FUNCTION private.enforce_immutable_work_submitter();


--
-- Name: academic_year_change_audit_events academic_year_change_audit_events_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.academic_year_change_audit_events
    ADD CONSTRAINT academic_year_change_audit_events_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);


--
-- Name: admin_auth_identities admin_auth_identities_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_auth_identities
    ADD CONSTRAINT admin_auth_identities_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: admin_correction_audits admin_correction_audits_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_correction_audits
    ADD CONSTRAINT admin_correction_audits_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: admin_correction_audits admin_correction_audits_base_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_correction_audits
    ADD CONSTRAINT admin_correction_audits_base_revision_id_fkey FOREIGN KEY (base_revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: admin_correction_audits admin_correction_audits_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_correction_audits
    ADD CONSTRAINT admin_correction_audits_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: admin_correction_audits admin_correction_audits_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_correction_audits
    ADD CONSTRAINT admin_correction_audits_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;


--
-- Name: attribution_account_lookup_rate_limits attribution_account_lookup_rate_limits_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_account_lookup_rate_limits
    ADD CONSTRAINT attribution_account_lookup_rate_limits_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: attribution_invitation_operations attribution_invitation_operations_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitation_operations
    ADD CONSTRAINT attribution_invitation_operations_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);


--
-- Name: attribution_invitation_operations attribution_invitation_operations_invitation_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitation_operations
    ADD CONSTRAINT attribution_invitation_operations_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES private.attribution_invitations(id) ON DELETE RESTRICT;


--
-- Name: attribution_invitation_sessions attribution_invitation_sessions_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitation_sessions
    ADD CONSTRAINT attribution_invitation_sessions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: attribution_invitation_sessions attribution_invitation_sessions_invitation_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitation_sessions
    ADD CONSTRAINT attribution_invitation_sessions_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES private.attribution_invitations(id) ON DELETE CASCADE;


--
-- Name: attribution_invitations attribution_invitations_accepted_person_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitations
    ADD CONSTRAINT attribution_invitations_accepted_person_id_fkey FOREIGN KEY (accepted_person_id) REFERENCES public.people(id);


--
-- Name: attribution_invitations attribution_invitations_invitee_person_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitations
    ADD CONSTRAINT attribution_invitations_invitee_person_id_fkey FOREIGN KEY (invitee_person_id) REFERENCES public.people(id);


--
-- Name: attribution_invitations attribution_invitations_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_invitations
    ADD CONSTRAINT attribution_invitations_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;


--
-- Name: attribution_removal_operations attribution_removal_operations_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_operations
    ADD CONSTRAINT attribution_removal_operations_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: attribution_removal_operations attribution_removal_operations_request_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_operations
    ADD CONSTRAINT attribution_removal_operations_request_id_fkey FOREIGN KEY (request_id) REFERENCES private.attribution_removal_requests(id) ON DELETE RESTRICT;


--
-- Name: attribution_removal_requests attribution_removal_requests_attribution_public_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_requests
    ADD CONSTRAINT attribution_removal_requests_attribution_public_id_fkey FOREIGN KEY (attribution_public_id) REFERENCES private.work_revision_attributions(attribution_public_id) ON DELETE RESTRICT;


--
-- Name: attribution_removal_requests attribution_removal_requests_correction_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_requests
    ADD CONSTRAINT attribution_removal_requests_correction_revision_id_fkey FOREIGN KEY (correction_revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: attribution_removal_requests attribution_removal_requests_decided_by_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_requests
    ADD CONSTRAINT attribution_removal_requests_decided_by_account_id_fkey FOREIGN KEY (decided_by_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: attribution_removal_requests attribution_removal_requests_invitation_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_requests
    ADD CONSTRAINT attribution_removal_requests_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES private.attribution_invitations(id) ON DELETE RESTRICT;


--
-- Name: attribution_removal_requests attribution_removal_requests_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_requests
    ADD CONSTRAINT attribution_removal_requests_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: attribution_removal_requests attribution_removal_requests_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.attribution_removal_requests
    ADD CONSTRAINT attribution_removal_requests_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;


--
-- Name: authentication_audit_events authentication_audit_events_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.authentication_audit_events
    ADD CONSTRAINT authentication_audit_events_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: authentication_sessions authentication_sessions_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.authentication_sessions
    ADD CONSTRAINT authentication_sessions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: cache_invalidation_deliveries cache_invalidation_deliveries_event_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.cache_invalidation_deliveries
    ADD CONSTRAINT cache_invalidation_deliveries_event_id_fkey FOREIGN KEY (event_id) REFERENCES private.outbox_events(id) ON DELETE CASCADE;


--
-- Name: person_name_correction_audit_events person_name_correction_audit_events_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.person_name_correction_audit_events
    ADD CONSTRAINT person_name_correction_audit_events_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);


--
-- Name: person_name_correction_audit_events person_name_correction_audit_events_student_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.person_name_correction_audit_events
    ADD CONSTRAINT person_name_correction_audit_events_student_account_id_fkey FOREIGN KEY (student_account_id) REFERENCES public.accounts(id);


--
-- Name: person_names person_names_person_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.person_names
    ADD CONSTRAINT person_names_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id);


--
-- Name: profile_operations profile_operations_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_operations
    ADD CONSTRAINT profile_operations_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);


--
-- Name: profile_operations profile_operations_person_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_operations
    ADD CONSTRAINT profile_operations_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id);


--
-- Name: profile_photo_assets profile_photo_assets_person_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_photo_assets
    ADD CONSTRAINT profile_photo_assets_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id);


--
-- Name: public_work_catalog public_work_catalog_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.public_work_catalog
    ADD CONSTRAINT public_work_catalog_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: public_work_catalog public_work_catalog_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.public_work_catalog
    ADD CONSTRAINT public_work_catalog_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;


--
-- Name: published_revision_tags published_revision_tags_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.published_revision_tags
    ADD CONSTRAINT published_revision_tags_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: published_revision_tags published_revision_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.published_revision_tags
    ADD CONSTRAINT published_revision_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE RESTRICT;


--
-- Name: removal_request_operations removal_request_operations_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.removal_request_operations
    ADD CONSTRAINT removal_request_operations_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: removal_request_operations removal_request_operations_request_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.removal_request_operations
    ADD CONSTRAINT removal_request_operations_request_id_fkey FOREIGN KEY (request_id) REFERENCES private.removal_requests(id) ON DELETE RESTRICT;


--
-- Name: removal_requests removal_requests_decided_by_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.removal_requests
    ADD CONSTRAINT removal_requests_decided_by_account_id_fkey FOREIGN KEY (decided_by_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: removal_requests removal_requests_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.removal_requests
    ADD CONSTRAINT removal_requests_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: removal_requests removal_requests_submitter_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.removal_requests
    ADD CONSTRAINT removal_requests_submitter_account_id_fkey FOREIGN KEY (submitter_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: removal_requests removal_requests_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.removal_requests
    ADD CONSTRAINT removal_requests_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;


--
-- Name: reviews reviews_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.reviews
    ADD CONSTRAINT reviews_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: reviews reviews_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.reviews
    ADD CONSTRAINT reviews_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: roster_audit_events roster_audit_events_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_audit_events
    ADD CONSTRAINT roster_audit_events_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);


--
-- Name: roster_audit_events roster_audit_events_batch_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_audit_events
    ADD CONSTRAINT roster_audit_events_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES private.roster_batches(id);


--
-- Name: roster_batches roster_batches_uploader_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_batches
    ADD CONSTRAINT roster_batches_uploader_account_id_fkey FOREIGN KEY (uploader_account_id) REFERENCES public.accounts(id);


--
-- Name: roster_conflict_resolution_audit_events roster_conflict_resolution_audit_events_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflict_resolution_audit_events
    ADD CONSTRAINT roster_conflict_resolution_audit_events_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);


--
-- Name: roster_conflict_resolution_audit_events roster_conflict_resolution_audit_events_batch_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflict_resolution_audit_events
    ADD CONSTRAINT roster_conflict_resolution_audit_events_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES private.roster_batches(id);


--
-- Name: roster_conflict_resolution_audit_events roster_conflict_resolution_audit_events_conflict_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflict_resolution_audit_events
    ADD CONSTRAINT roster_conflict_resolution_audit_events_conflict_id_fkey FOREIGN KEY (conflict_id) REFERENCES private.roster_conflicts(id);


--
-- Name: roster_conflicts roster_conflicts_batch_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflicts
    ADD CONSTRAINT roster_conflicts_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES private.roster_batches(id);


--
-- Name: roster_conflicts roster_conflicts_person_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflicts
    ADD CONSTRAINT roster_conflicts_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id);


--
-- Name: roster_conflicts roster_conflicts_resolved_by_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_conflicts
    ADD CONSTRAINT roster_conflicts_resolved_by_account_id_fkey FOREIGN KEY (resolved_by_account_id) REFERENCES public.accounts(id);


--
-- Name: roster_rows roster_rows_batch_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.roster_rows
    ADD CONSTRAINT roster_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES private.roster_batches(id) ON DELETE CASCADE;


--
-- Name: student_access_extension_audit_events student_access_extension_audit_events_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_access_extension_audit_events
    ADD CONSTRAINT student_access_extension_audit_events_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);


--
-- Name: student_access_extension_audit_events student_access_extension_audit_events_student_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_access_extension_audit_events
    ADD CONSTRAINT student_access_extension_audit_events_student_account_id_fkey FOREIGN KEY (student_account_id) REFERENCES public.accounts(id);


--
-- Name: student_auth_identities student_auth_identities_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_auth_identities
    ADD CONSTRAINT student_auth_identities_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: student_id_search_prefixes student_id_search_prefixes_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_id_search_prefixes
    ADD CONSTRAINT student_id_search_prefixes_account_id_fkey FOREIGN KEY (account_id) REFERENCES private.student_auth_identities(account_id) ON DELETE CASCADE;


--
-- Name: student_password_reset_operations student_password_reset_operations_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_password_reset_operations
    ADD CONSTRAINT student_password_reset_operations_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);


--
-- Name: student_password_reset_operations student_password_reset_operations_student_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.student_password_reset_operations
    ADD CONSTRAINT student_password_reset_operations_student_account_id_fkey FOREIGN KEY (student_account_id) REFERENCES public.accounts(id);


--
-- Name: work_contributor_candidates work_contributor_candidates_person_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_contributor_candidates
    ADD CONSTRAINT work_contributor_candidates_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;


--
-- Name: work_contributor_candidates work_contributor_candidates_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_contributor_candidates
    ADD CONSTRAINT work_contributor_candidates_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;


--
-- Name: work_draft_contributor_backfill_items work_draft_contributor_backfill_items_invitation_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributor_backfill_items
    ADD CONSTRAINT work_draft_contributor_backfill_items_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES private.attribution_invitations(id) ON DELETE RESTRICT;


--
-- Name: work_draft_contributor_operations work_draft_contributor_operations_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributor_operations
    ADD CONSTRAINT work_draft_contributor_operations_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: work_draft_contributor_operations work_draft_contributor_operations_contributor_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributor_operations
    ADD CONSTRAINT work_draft_contributor_operations_contributor_id_fkey FOREIGN KEY (contributor_id) REFERENCES private.work_draft_contributors(id) ON DELETE RESTRICT;


--
-- Name: work_draft_contributor_operations work_draft_contributor_operations_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributor_operations
    ADD CONSTRAINT work_draft_contributor_operations_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;


--
-- Name: work_draft_contributors work_draft_contributors_legacy_invitation_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributors
    ADD CONSTRAINT work_draft_contributors_legacy_invitation_id_fkey FOREIGN KEY (legacy_invitation_id) REFERENCES private.attribution_invitations(id) ON DELETE RESTRICT;


--
-- Name: work_draft_contributors work_draft_contributors_person_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributors
    ADD CONSTRAINT work_draft_contributors_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE RESTRICT;


--
-- Name: work_draft_contributors work_draft_contributors_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_contributors
    ADD CONSTRAINT work_draft_contributors_work_id_fkey FOREIGN KEY (work_id) REFERENCES private.work_drafts(work_id) ON DELETE CASCADE;


--
-- Name: work_draft_links work_draft_links_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_links
    ADD CONSTRAINT work_draft_links_work_id_fkey FOREIGN KEY (work_id) REFERENCES private.work_drafts(work_id) ON DELETE CASCADE;


--
-- Name: work_draft_media work_draft_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_media
    ADD CONSTRAINT work_draft_media_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES private.work_media_assets(id) ON DELETE RESTRICT;


--
-- Name: work_draft_media work_draft_media_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_media
    ADD CONSTRAINT work_draft_media_work_id_fkey FOREIGN KEY (work_id) REFERENCES private.work_drafts(work_id) ON DELETE CASCADE;


--
-- Name: work_draft_tags work_draft_tags_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_tags
    ADD CONSTRAINT work_draft_tags_work_id_fkey FOREIGN KEY (work_id) REFERENCES private.work_drafts(work_id) ON DELETE CASCADE;


--
-- Name: work_draft_video_links work_draft_video_links_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_draft_video_links
    ADD CONSTRAINT work_draft_video_links_work_id_fkey FOREIGN KEY (work_id) REFERENCES private.work_drafts(work_id) ON DELETE CASCADE;


--
-- Name: work_drafts work_drafts_base_published_revision_fk; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_drafts
    ADD CONSTRAINT work_drafts_base_published_revision_fk FOREIGN KEY (base_published_revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: work_drafts work_drafts_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_drafts
    ADD CONSTRAINT work_drafts_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;


--
-- Name: work_media_assets work_media_assets_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_media_assets
    ADD CONSTRAINT work_media_assets_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;


--
-- Name: work_media_variants work_media_variants_asset_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_media_variants
    ADD CONSTRAINT work_media_variants_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES private.work_media_assets(id) ON DELETE RESTRICT;


--
-- Name: work_operations work_operations_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_operations
    ADD CONSTRAINT work_operations_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);


--
-- Name: work_operations work_operations_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_operations
    ADD CONSTRAINT work_operations_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id);


--
-- Name: work_recovery_audits work_recovery_audits_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_recovery_audits
    ADD CONSTRAINT work_recovery_audits_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: work_recovery_audits work_recovery_audits_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_recovery_audits
    ADD CONSTRAINT work_recovery_audits_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;


--
-- Name: work_revision_attributions work_revision_attributions_person_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_attributions
    ADD CONSTRAINT work_revision_attributions_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE RESTRICT;


--
-- Name: work_revision_attributions work_revision_attributions_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_attributions
    ADD CONSTRAINT work_revision_attributions_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: work_revision_links work_revision_links_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_links
    ADD CONSTRAINT work_revision_links_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: work_revision_media work_revision_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_media
    ADD CONSTRAINT work_revision_media_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES private.work_media_assets(id) ON DELETE RESTRICT;


--
-- Name: work_revision_media work_revision_media_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_media
    ADD CONSTRAINT work_revision_media_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: work_revision_operations work_revision_operations_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_operations
    ADD CONSTRAINT work_revision_operations_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: work_revision_operations work_revision_operations_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_operations
    ADD CONSTRAINT work_revision_operations_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: work_revision_operations work_revision_operations_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_operations
    ADD CONSTRAINT work_revision_operations_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;


--
-- Name: work_revision_tags work_revision_tags_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_tags
    ADD CONSTRAINT work_revision_tags_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: work_revision_video_links work_revision_video_links_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revision_video_links
    ADD CONSTRAINT work_revision_video_links_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: work_revisions work_revisions_base_published_revision_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revisions
    ADD CONSTRAINT work_revisions_base_published_revision_id_fkey FOREIGN KEY (base_published_revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: work_revisions work_revisions_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_revisions
    ADD CONSTRAINT work_revisions_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;


--
-- Name: work_saved_draft_operations work_saved_draft_operations_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_saved_draft_operations
    ADD CONSTRAINT work_saved_draft_operations_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: work_saved_draft_operations work_saved_draft_operations_work_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.work_saved_draft_operations
    ADD CONSTRAINT work_saved_draft_operations_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;


--
-- Name: academic_settings academic_settings_updated_by_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_settings
    ADD CONSTRAINT academic_settings_updated_by_account_id_fkey FOREIGN KEY (updated_by_account_id) REFERENCES public.accounts(id);


--
-- Name: account_roles account_roles_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_roles
    ADD CONSTRAINT account_roles_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: accounts accounts_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id);


--
-- Name: profile_consents profile_consents_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_consents
    ADD CONSTRAINT profile_consents_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.public_profiles(person_id);


--
-- Name: public_profile_links public_profile_links_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_profile_links
    ADD CONSTRAINT public_profile_links_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.public_profiles(person_id) ON DELETE CASCADE;


--
-- Name: public_profiles public_profiles_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_profiles
    ADD CONSTRAINT public_profiles_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id);


--
-- Name: public_profiles public_profiles_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_profiles
    ADD CONSTRAINT public_profiles_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES private.profile_photo_assets(id);


--
-- Name: students students_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id);


--
-- Name: works works_published_revision_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.works
    ADD CONSTRAINT works_published_revision_fk FOREIGN KEY (published_revision_id) REFERENCES private.work_revisions(id) ON DELETE RESTRICT;


--
-- Name: works works_submitter_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.works
    ADD CONSTRAINT works_submitter_person_id_fkey FOREIGN KEY (submitter_person_id) REFERENCES public.people(id);


--
-- Name: admin_correction_audits; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.admin_correction_audits ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_account_lookup_rate_limits; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.attribution_account_lookup_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_invitation_operations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.attribution_invitation_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_invitation_sessions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.attribution_invitation_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_invitations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.attribution_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_removal_operations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.attribution_removal_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_removal_rate_limits; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.attribution_removal_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_removal_requests; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.attribution_removal_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_source_lookup_rate_limits; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.attribution_source_lookup_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: cache_invalidation_deliveries; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.cache_invalidation_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: issue_56_contributor_cutover_state; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.issue_56_contributor_cutover_state ENABLE ROW LEVEL SECURITY;

--
-- Name: person_name_correction_audit_events; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.person_name_correction_audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: public_cache_version; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.public_cache_version ENABLE ROW LEVEL SECURITY;

--
-- Name: public_work_catalog; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.public_work_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: published_revision_tags; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.published_revision_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: removal_request_operations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.removal_request_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: removal_requests; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.removal_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: work_contributor_candidates; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_contributor_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: work_draft_contributor_backfill_items; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_draft_contributor_backfill_items ENABLE ROW LEVEL SECURITY;

--
-- Name: work_draft_contributor_backfill_runs; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_draft_contributor_backfill_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: work_draft_contributor_operations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_draft_contributor_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: work_draft_contributors; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_draft_contributors ENABLE ROW LEVEL SECURITY;

--
-- Name: work_draft_media; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_draft_media ENABLE ROW LEVEL SECURITY;

--
-- Name: work_draft_video_links; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_draft_video_links ENABLE ROW LEVEL SECURITY;

--
-- Name: work_media_assets; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_media_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: work_media_variants; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_media_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: work_recovery_audits; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_recovery_audits ENABLE ROW LEVEL SECURITY;

--
-- Name: work_revision_attributions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_revision_attributions ENABLE ROW LEVEL SECURITY;

--
-- Name: work_revision_links; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_revision_links ENABLE ROW LEVEL SECURITY;

--
-- Name: work_revision_media; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_revision_media ENABLE ROW LEVEL SECURITY;

--
-- Name: work_revision_operations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_revision_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: work_revision_tags; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_revision_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: work_revision_video_links; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_revision_video_links ENABLE ROW LEVEL SECURITY;

--
-- Name: work_revisions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: work_saved_draft_operations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.work_saved_draft_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: public_profile_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.public_profile_links ENABLE ROW LEVEL SECURITY;

--
-- Name: public_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: works; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


CREATE TABLE private."user" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id uuid NOT NULL REFERENCES private."user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_id_idx ON private.session(user_id);
CREATE INDEX session_expires_at_idx ON private.session(expires_at);
CREATE TABLE private.account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES private."user"(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  issuer text NOT NULL DEFAULT '',
  UNIQUE(provider_id, account_id),
  UNIQUE(issuer, account_id)
);
CREATE INDEX account_user_id_idx ON private.account(user_id);
CREATE TABLE private.verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON private.verification(identifier);

SET search_path TO public;
