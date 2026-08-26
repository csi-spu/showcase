create extension if not exists pg_trgm with schema extensions;

create table private.public_work_catalog (
  work_id uuid primary key references public.works (id) on delete cascade,
  revision_id uuid not null unique references private.work_revisions (id) on delete restrict,
  work_public_id uuid not null unique,
  title text not null,
  summary text not null,
  description text not null,
  category text not null check (
    category in ('course_work', 'competition_entry', 'academic_article')
  ),
  academic_year smallint not null check (academic_year between 2400 and 2700),
  semester text not null check (semester in ('1', '2', 'summer')),
  semester_order smallint not null check (semester_order between 1 and 3),
  published_at timestamptz not null,
  normalized_title text not null,
  normalized_summary text not null,
  normalized_tags text not null,
  normalized_attributions text not null,
  normalized_description text not null,
  normalized_search text not null,
  constraint public_work_catalog_search_complete check (
    normalized_search = concat_ws(
      ' ', normalized_title, normalized_summary, normalized_tags,
      normalized_attributions, normalized_description
    )
  )
);

create index public_work_catalog_search_idx
  on private.public_work_catalog using gin (normalized_search extensions.gin_trgm_ops);

create index public_work_catalog_recent_idx
  on private.public_work_catalog (published_at desc, work_public_id desc);

create index public_work_catalog_academic_period_idx
  on private.public_work_catalog (
    academic_year desc, semester_order desc, published_at desc, work_public_id desc
  );

create index public_work_catalog_title_idx
  on private.public_work_catalog (normalized_title, work_public_id);

create index public_work_catalog_category_recent_idx
  on private.public_work_catalog (category, published_at desc, work_public_id desc);

create index public_work_catalog_period_recent_idx
  on private.public_work_catalog (
    academic_year, semester, published_at desc, work_public_id desc
  );

alter table public.public_profiles
  add column normalized_display_name text;

update public.public_profiles
set normalized_display_name = lower(regexp_replace(
  normalize(btrim(display_name), NFKC), '[[:space:]]+', ' ', 'g'
));

alter table public.public_profiles
  alter column normalized_display_name set not null;

create function private.default_normalized_display_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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

create trigger public_profiles_normalized_display_name
before insert or update of display_name, normalized_display_name on public.public_profiles
for each row execute function private.default_normalized_display_name();

create index public_profiles_display_name_search_idx
  on public.public_profiles using gin (normalized_display_name extensions.gin_trgm_ops);

create index public_profiles_display_name_browse_idx
  on public.public_profiles (normalized_display_name, public_id);

create index students_entry_year_person_idx
  on public.students (entry_year, person_id);

create index tags_public_popularity_idx
  on public.tags (active_work_count desc, lower(display_label), public_id)
  where active_work_count > 0;

insert into private.public_work_catalog (
  work_id, revision_id, work_public_id, title, summary, description, category,
  academic_year, semester, semester_order, published_at, normalized_title,
  normalized_summary, normalized_tags, normalized_attributions,
  normalized_description, normalized_search
)
select
  work.id,
  revision.id,
  work.public_id,
  revision.title,
  revision.summary,
  revision.description,
  revision.category,
  revision.academic_year,
  revision.semester,
  case revision.semester when '1' then 1 when '2' then 2 else 3 end,
  publication.published_at,
  normalized.title,
  normalized.summary,
  normalized.tags,
  normalized.attributions,
  normalized.description,
  concat_ws(
    ' ', normalized.title, normalized.summary, normalized.tags,
    normalized.attributions, normalized.description
  )
from public.works as work
join private.work_revisions as revision on revision.id = work.published_revision_id
join lateral (
  select max(review.reviewed_at) as published_at
  from private.reviews as review
  where review.revision_id = revision.id and review.decision = 'approved'
) as publication on publication.published_at is not null
cross join lateral (
  select
    lower(regexp_replace(
      normalize(btrim(revision.title), NFKC), '[[:space:]]+', ' ', 'g'
    )) as title,
    lower(regexp_replace(
      normalize(btrim(revision.summary), NFKC), '[[:space:]]+', ' ', 'g'
    )) as summary,
    lower(regexp_replace(normalize(btrim(coalesce((
      select string_agg(tag.normalized_identity, ' ' order by tag.position)
      from private.work_revision_tags as tag where tag.revision_id = revision.id
    ), '')), NFKC), '[[:space:]]+', ' ', 'g')) as tags,
    lower(regexp_replace(normalize(btrim(coalesce((
      select string_agg(attribution.attribution_name, ' ' order by attribution.position)
      from private.work_revision_attributions as attribution
      where attribution.revision_id = revision.id
    ), '')), NFKC), '[[:space:]]+', ' ', 'g')) as attributions,
    lower(regexp_replace(
      normalize(btrim(revision.description), NFKC), '[[:space:]]+', ' ', 'g'
    )) as description
) as normalized
where work.activity_state = 'active'
  and work.publication_state = 'published'
  and revision.status = 'approved';

create function private.reconcile_tag_popularity()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
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

create table private.cache_invalidation_deliveries (
  event_id bigint primary key references private.outbox_events (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz not null,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint cache_invalidation_delivery_state_valid check (
    (status = 'processing' and lease_expires_at is not null and completed_at is null)
    or (status = 'completed' and lease_expires_at is null and completed_at is not null)
    or (status in ('pending', 'failed') and lease_expires_at is null and completed_at is null)
  )
);

create index cache_invalidation_deliveries_claim_idx
  on private.cache_invalidation_deliveries (next_attempt_at, event_id)
  where status in ('pending', 'processing');

create table private.public_cache_version (
  singleton boolean primary key default true check (singleton),
  version bigint not null check (version >= 0),
  updated_at timestamptz not null
);

insert into private.public_cache_version (version, updated_at)
select coalesce(max(event.id), 0), coalesce(max(event.occurred_at), now())
from private.outbox_events as event
where event.payload ? 'cacheTargets'
  or event.event_type in ('public_profile_cache_invalidated', 'public_profile_visible');

create function private.enqueue_public_cache_invalidation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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

create trigger outbox_enqueue_public_cache_invalidation
after insert on private.outbox_events
for each row execute function private.enqueue_public_cache_invalidation();

insert into private.cache_invalidation_deliveries (
  event_id, next_attempt_at, created_at, updated_at
)
select event.id, event.occurred_at, event.occurred_at, event.occurred_at
from private.outbox_events as event
where event.payload ? 'cacheTargets'
  or event.event_type in ('public_profile_cache_invalidated', 'public_profile_visible')
on conflict (event_id) do nothing;

create function private.reconcile_public_cache_invalidations()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
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

alter table private.public_work_catalog enable row level security;
alter table private.cache_invalidation_deliveries enable row level security;
alter table private.public_cache_version enable row level security;

revoke all on table private.public_work_catalog from public, anon, authenticated;
revoke all on table private.cache_invalidation_deliveries from public, anon, authenticated;
revoke all on table private.public_cache_version from public, anon, authenticated;
revoke all on function private.reconcile_tag_popularity() from public, anon, authenticated;
revoke all on function private.reconcile_public_cache_invalidations() from public, anon, authenticated;
revoke all on function private.default_normalized_display_name() from public, anon, authenticated;
revoke all on function private.enqueue_public_cache_invalidation() from public, anon, authenticated;
