alter table private.work_revisions
  alter column draft_version drop not null,
  add column author_kind text not null default 'student_submission'
    check (author_kind in ('student_submission', 'admin_correction')),
  add constraint work_revisions_author_source_valid check (
    (author_kind = 'student_submission' and draft_version is not null)
    or (author_kind = 'admin_correction' and draft_version is null)
  );

create table private.admin_correction_audits (
  id bigint generated always as identity primary key,
  idempotency_key uuid not null unique,
  actor_account_id uuid not null references public.accounts (id) on delete restrict,
  work_id uuid not null references public.works (id) on delete restrict,
  base_revision_id uuid not null references private.work_revisions (id) on delete restrict,
  revision_id uuid not null unique references private.work_revisions (id) on delete restrict,
  action text not null default 'admin_correction_created'
    check (action = 'admin_correction_created'),
  reason text not null check (
    reason = btrim(reason) and char_length(reason) between 10 and 1000
  ),
  diff_metadata jsonb not null check (
    jsonb_typeof(diff_metadata) = 'object'
    and jsonb_typeof(diff_metadata -> 'fields') = 'array'
    and jsonb_array_length(diff_metadata -> 'fields') > 0
    and jsonb_typeof(diff_metadata -> 'categories') = 'array'
    and jsonb_array_length(diff_metadata -> 'categories') > 0
  ),
  request_fingerprint char(64) not null
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null
);

create index admin_correction_audits_work_time_idx
  on private.admin_correction_audits (work_id, occurred_at desc, id desc);

create index admin_correction_audits_actor_time_idx
  on private.admin_correction_audits (actor_account_id, occurred_at desc, id desc);

create index admin_correction_audits_base_revision_idx
  on private.admin_correction_audits (base_revision_id);

alter table private.admin_correction_audits enable row level security;
revoke all on table private.admin_correction_audits from public, anon, authenticated;

create function private.prevent_admin_correction_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ADMIN_CORRECTION_AUDIT_IMMUTABLE' using errcode = '23514';
end;
$$;

create trigger admin_correction_audits_immutable
before update or delete on private.admin_correction_audits
for each row execute function private.prevent_admin_correction_audit_mutation();

create or replace function private.enforce_immutable_work_revision_content()
returns trigger
language plpgsql
set search_path = ''
as $$
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

revoke all on function private.prevent_admin_correction_audit_mutation()
  from public, anon, authenticated;
