alter table private.reviews
  drop constraint reviews_decision_check,
  drop constraint reviews_reason_check,
  drop constraint reviews_feedback_check;

alter table private.reviews
  alter column reason drop not null,
  alter column feedback drop not null,
  add constraint reviews_decision_check
    check (decision in ('approved', 'changes_requested')),
  add constraint reviews_decision_detail_valid check (
    (
      decision = 'approved'
      and reason is null
      and feedback is null
    )
    or (
      decision = 'changes_requested'
      and reason is not null
      and feedback is not null
      and reason in ('content', 'attribution', 'media', 'links_tags', 'policy', 'other')
      and feedback = btrim(feedback)
      and char_length(feedback) between 10 and 2000
    )
  );

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  normalized_identity text not null unique check (
    normalized_identity = btrim(normalized_identity)
    and char_length(normalized_identity) between 1 and 255
  ),
  display_label text not null check (
    display_label = btrim(display_label)
    and char_length(display_label) between 1 and 50
  ),
  activated_at timestamptz not null,
  active_work_count bigint not null default 0 check (active_work_count >= 0)
);

create index tags_popularity_idx
  on public.tags (active_work_count desc, public_id)
  where active_work_count > 0;

create table private.published_revision_tags (
  revision_id uuid not null references private.work_revisions (id) on delete restrict,
  tag_id uuid not null references public.tags (id) on delete restrict,
  position smallint not null check (position between 1 and 5),
  primary key (revision_id, position),
  unique (revision_id, tag_id)
);

create index published_revision_tags_tag_idx
  on private.published_revision_tags (tag_id, revision_id);

alter table public.tags enable row level security;
alter table private.published_revision_tags enable row level security;

revoke all on table public.tags from public, anon, authenticated;
revoke all on table private.published_revision_tags from public, anon, authenticated;
