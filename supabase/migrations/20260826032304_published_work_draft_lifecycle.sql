alter table private.work_operations
  drop constraint work_operations_operation_check,
  add constraint work_operations_operation_check check (
    operation in (
      'work_created',
      'work_draft_updated',
      'published_work_draft_seeded',
      'work_draft_rebased'
    )
  );

alter table private.work_drafts
  add constraint work_drafts_base_published_revision_fk
  foreign key (base_published_revision_id)
  references private.work_revisions (id)
  on delete restrict;

create index work_drafts_base_published_revision_idx
  on private.work_drafts (base_published_revision_id)
  where base_published_revision_id is not null;

create function private.enforce_work_revision_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
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

create trigger work_drafts_base_revision_membership
before insert or update of base_published_revision_id on private.work_drafts
for each row execute function private.enforce_work_revision_membership();

create trigger work_revisions_base_revision_membership
before insert or update of base_published_revision_id on private.work_revisions
for each row execute function private.enforce_work_revision_membership();

create function private.enforce_published_revision_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
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

create trigger works_published_revision_membership
before insert or update of published_revision_id on public.works
for each row execute function private.enforce_published_revision_membership();

revoke all on function private.enforce_work_revision_membership()
  from public, anon, authenticated;
revoke all on function private.enforce_published_revision_membership()
  from public, anon, authenticated;
