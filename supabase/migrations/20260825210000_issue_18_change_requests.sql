create table private.reviews (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  revision_id uuid not null unique references private.work_revisions (id) on delete restrict,
  actor_account_id uuid not null references public.accounts (id) on delete restrict,
  decision text not null check (decision = 'changes_requested'),
  reason text not null check (
    reason in ('content', 'attribution', 'media', 'links_tags', 'policy', 'other')
  ),
  feedback text not null check (
    feedback = btrim(feedback) and char_length(feedback) between 10 and 2000
  ),
  expected_revision_version bigint not null check (expected_revision_version > 0),
  resulting_revision_version bigint not null check (resulting_revision_version > 0),
  idempotency_key uuid not null unique,
  request_payload jsonb not null,
  reviewed_at timestamptz not null
);

create index reviews_actor_time_idx
  on private.reviews (actor_account_id, reviewed_at desc, id);

create index reviews_revision_time_idx
  on private.reviews (revision_id, reviewed_at desc, id);

create function private.prevent_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'REVIEW_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger reviews_immutable
before update or delete on private.reviews
for each row execute function private.prevent_review_mutation();

alter table private.reviews enable row level security;

revoke all on table private.reviews from public, anon, authenticated;
revoke all on function private.prevent_review_mutation() from public, anon, authenticated;
