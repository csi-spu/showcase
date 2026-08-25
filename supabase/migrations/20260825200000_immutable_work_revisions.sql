create table private.work_revisions (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete restrict,
  revision_number bigint not null check (revision_number > 0),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'changes_requested', 'approved', 'withdrawn')),
  base_published_revision_id uuid references private.work_revisions (id) on delete restrict,
  draft_version bigint not null check (draft_version > 0),
  title text not null check (
    title = btrim(title) and char_length(title) between 1 and 150
  ),
  summary text not null check (
    summary = btrim(summary) and char_length(summary) between 1 and 300
  ),
  description text not null check (
    description = btrim(description) and char_length(description) between 1 and 10000
  ),
  category text not null check (
    category in ('course_work', 'competition_entry', 'academic_article')
  ),
  academic_year smallint not null check (academic_year between 2400 and 2700),
  semester text not null check (semester in ('1', '2', 'summer')),
  submitted_at timestamptz not null,
  withdrawn_at timestamptz,
  version bigint not null default 1 check (version > 0),
  unique (work_id, revision_number),
  constraint work_revisions_withdrawal_state_valid check (
    (status = 'withdrawn' and withdrawn_at is not null)
    or (status <> 'withdrawn' and withdrawn_at is null)
  )
);

create unique index work_revisions_one_pending_per_work_idx
  on private.work_revisions (work_id)
  where status = 'pending_review';

create index work_revisions_review_queue_idx
  on private.work_revisions (submitted_at, id)
  where status = 'pending_review';

create index work_revisions_base_revision_idx
  on private.work_revisions (base_published_revision_id)
  where base_published_revision_id is not null;

alter table public.works
  add constraint works_published_revision_fk
  foreign key (published_revision_id) references private.work_revisions (id) on delete restrict;

create index works_published_revision_idx
  on public.works (published_revision_id)
  where published_revision_id is not null;

create table private.work_revision_links (
  revision_id uuid not null references private.work_revisions (id) on delete restrict,
  position smallint not null check (position between 1 and 5),
  label text not null check (
    label = btrim(label) and char_length(label) between 1 and 50
  ),
  url text not null check (char_length(url) <= 2048 and url ~ '^https://'),
  primary key (revision_id, position),
  unique (revision_id, url)
);

create table private.work_revision_tags (
  revision_id uuid not null references private.work_revisions (id) on delete restrict,
  position smallint not null check (position between 1 and 5),
  display_label text not null check (
    display_label = btrim(display_label) and char_length(display_label) between 1 and 50
  ),
  normalized_identity text not null check (
    normalized_identity = btrim(normalized_identity)
    and char_length(normalized_identity) between 1 and 255
  ),
  primary key (revision_id, position),
  unique (revision_id, normalized_identity)
);

create table private.work_revision_video_links (
  revision_id uuid not null references private.work_revisions (id) on delete restrict,
  position smallint not null check (position between 1 and 3),
  provider text not null check (provider in ('youtube', 'tiktok')),
  provider_video_id text not null check (char_length(provider_video_id) between 1 and 255),
  url text not null check (char_length(url) <= 2048 and url ~ '^https://'),
  primary key (revision_id, position),
  unique (revision_id, provider, provider_video_id)
);

create table private.work_revision_media (
  revision_id uuid not null references private.work_revisions (id) on delete restrict,
  media_kind text not null check (media_kind in ('poster', 'gallery')),
  position smallint not null check (position between 1 and 3),
  asset_id uuid not null references private.work_media_assets (id) on delete restrict,
  primary key (revision_id, media_kind, position),
  unique (revision_id, asset_id),
  constraint work_revision_media_poster_position check (
    media_kind <> 'poster' or position = 1
  )
);

create index work_revision_media_asset_idx on private.work_revision_media (asset_id);

create table private.work_revision_attributions (
  revision_id uuid not null references private.work_revisions (id) on delete restrict,
  position smallint not null check (position between 1 and 21),
  kind text not null check (kind in ('submitter', 'account', 'external')),
  person_id uuid references public.people (id) on delete restrict,
  attribution_name text not null check (
    attribution_name = btrim(attribution_name)
    and char_length(attribution_name) between 1 and 100
  ),
  study_year smallint check (study_year between 1 and 8),
  contribution_role text check (
    contribution_role is null
    or (
      contribution_role = btrim(contribution_role)
      and char_length(contribution_role) between 1 and 100
    )
  ),
  affiliation text check (
    affiliation is null
    or (affiliation = btrim(affiliation) and char_length(affiliation) between 1 and 150)
  ),
  primary key (revision_id, position),
  unique (revision_id, person_id),
  constraint work_revision_attribution_kind_valid check (
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
  ),
  constraint work_revision_submitter_position_valid check (
    (position = 1 and kind = 'submitter') or (position > 1 and kind <> 'submitter')
  )
);

create index work_revision_attributions_person_idx
  on private.work_revision_attributions (person_id);

create table private.work_revision_operations (
  idempotency_key uuid primary key,
  actor_account_id uuid not null references public.accounts (id) on delete restrict,
  work_id uuid not null references public.works (id) on delete restrict,
  revision_id uuid not null references private.work_revisions (id) on delete restrict,
  operation text not null check (operation in ('revision_submitted', 'revision_withdrawn')),
  request_payload jsonb not null,
  resulting_status text not null
    check (resulting_status in ('pending_review', 'withdrawn')),
  resulting_version bigint not null check (resulting_version > 0),
  occurred_at timestamptz not null
);

create index work_revision_operations_work_time_idx
  on private.work_revision_operations (work_id, occurred_at desc);

create index work_revision_operations_actor_idx
  on private.work_revision_operations (actor_account_id);

create index work_revision_operations_revision_idx
  on private.work_revision_operations (revision_id);

create function private.enforce_immutable_work_revision_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.work_id is distinct from old.work_id
    or new.revision_number is distinct from old.revision_number
    or new.base_published_revision_id is distinct from old.base_published_revision_id
    or new.draft_version is distinct from old.draft_version
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

create trigger work_revision_content_immutable
before update on private.work_revisions
for each row execute function private.enforce_immutable_work_revision_content();

create function private.prevent_work_revision_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'WORK_REVISION_SNAPSHOT_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger work_revision_links_immutable
before update or delete on private.work_revision_links
for each row execute function private.prevent_work_revision_snapshot_mutation();

create trigger work_revision_tags_immutable
before update or delete on private.work_revision_tags
for each row execute function private.prevent_work_revision_snapshot_mutation();

create trigger work_revision_video_links_immutable
before update or delete on private.work_revision_video_links
for each row execute function private.prevent_work_revision_snapshot_mutation();

create trigger work_revision_media_immutable
before update or delete on private.work_revision_media
for each row execute function private.prevent_work_revision_snapshot_mutation();

create trigger work_revision_attributions_immutable
before update or delete on private.work_revision_attributions
for each row execute function private.prevent_work_revision_snapshot_mutation();

alter table private.work_revisions enable row level security;
alter table private.work_revision_links enable row level security;
alter table private.work_revision_tags enable row level security;
alter table private.work_revision_video_links enable row level security;
alter table private.work_revision_media enable row level security;
alter table private.work_revision_attributions enable row level security;
alter table private.work_revision_operations enable row level security;

revoke all on table private.work_revisions from public, anon, authenticated;
revoke all on table private.work_revision_links from public, anon, authenticated;
revoke all on table private.work_revision_tags from public, anon, authenticated;
revoke all on table private.work_revision_video_links from public, anon, authenticated;
revoke all on table private.work_revision_media from public, anon, authenticated;
revoke all on table private.work_revision_attributions from public, anon, authenticated;
revoke all on table private.work_revision_operations from public, anon, authenticated;
revoke all on function private.enforce_immutable_work_revision_content()
  from public, anon, authenticated;
revoke all on function private.prevent_work_revision_snapshot_mutation()
  from public, anon, authenticated;
