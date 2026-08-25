create table public.works (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  submitter_person_id uuid not null references public.people (id),
  activity_state text not null default 'active'
    check (activity_state in ('active', 'archived')),
  publication_state text not null default 'never_published'
    check (publication_state in ('never_published', 'published', 'unpublished')),
  published_revision_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index works_submitter_updated_idx
  on public.works (submitter_person_id, updated_at desc);

create table private.work_drafts (
  work_id uuid primary key references public.works (id) on delete cascade,
  base_published_revision_id uuid,
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
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table private.work_draft_links (
  work_id uuid not null references private.work_drafts (work_id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  label text not null check (
    label = btrim(label) and char_length(label) between 1 and 50
  ),
  url text not null check (
    char_length(url) <= 2048 and url ~ '^https://'
  ),
  primary key (work_id, position),
  unique (work_id, url)
);

create table private.work_draft_tags (
  work_id uuid not null references private.work_drafts (work_id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  display_label text not null check (
    display_label = btrim(display_label)
    and char_length(display_label) between 1 and 50
  ),
  normalized_identity text not null check (
    normalized_identity = btrim(normalized_identity)
    and char_length(normalized_identity) >= 1
  ),
  primary key (work_id, position),
  unique (work_id, normalized_identity)
);

create table private.work_operations (
  idempotency_key uuid primary key,
  actor_account_id uuid not null references public.accounts (id),
  work_id uuid not null references public.works (id),
  operation text not null check (operation in ('work_created', 'work_draft_updated')),
  request_payload jsonb not null,
  resulting_version bigint not null check (resulting_version > 0),
  occurred_at timestamptz not null
);

create index work_operations_work_time_idx
  on private.work_operations (work_id, occurred_at desc);

create index work_operations_actor_account_idx
  on private.work_operations (actor_account_id);

create function private.enforce_immutable_work_submitter()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.submitter_person_id is distinct from old.submitter_person_id then
    raise exception 'WORK_SUBMITTER_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger works_submitter_immutable
before update of submitter_person_id on public.works
for each row execute function private.enforce_immutable_work_submitter();

alter table public.works enable row level security;

revoke all on table public.works from anon, authenticated;
revoke all on table private.work_drafts from public, anon, authenticated;
revoke all on table private.work_draft_links from public, anon, authenticated;
revoke all on table private.work_draft_tags from public, anon, authenticated;
revoke all on table private.work_operations from public, anon, authenticated;
revoke all on function private.enforce_immutable_work_submitter() from public, anon, authenticated;
