alter table private.work_media_assets
  add column if not exists authorize_idempotency_key uuid,
  add column if not exists declared_extension text,
  add column if not exists warnings text[] not null default '{}',
  add column if not exists processing_attempts smallint not null default 0,
  add column if not exists cleanup_started_at timestamptz;

update private.work_media_assets
set authorize_idempotency_key = gen_random_uuid()
where authorize_idempotency_key is null;

update private.work_media_assets
set declared_extension = case declared_content_type
  when 'image/jpeg' then 'jpg'
  when 'image/png' then 'png'
  when 'image/webp' then 'webp'
end
where declared_extension is null;

alter table private.work_media_assets
  alter column authorize_idempotency_key set not null,
  alter column declared_extension set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'work_media_assets_declared_extension_check'
      and conrelid = 'private.work_media_assets'::regclass
  ) then
    alter table private.work_media_assets
      add constraint work_media_assets_declared_extension_check
      check (declared_extension in ('jpeg', 'jpg', 'png', 'webp'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'work_media_assets_warnings_check'
      and conrelid = 'private.work_media_assets'::regclass
  ) then
    alter table private.work_media_assets
      add constraint work_media_assets_warnings_check
      check (warnings <@ array['poster_width_below_recommended']::text[]);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'work_media_assets_processing_attempts_check'
      and conrelid = 'private.work_media_assets'::regclass
  ) then
    alter table private.work_media_assets
      add constraint work_media_assets_processing_attempts_check
      check (processing_attempts between 0 and 3);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'work_media_assets_declared_type_matches_extension'
      and conrelid = 'private.work_media_assets'::regclass
  ) then
    alter table private.work_media_assets
      add constraint work_media_assets_declared_type_matches_extension check (
        (declared_content_type = 'image/jpeg' and declared_extension in ('jpeg', 'jpg'))
        or (declared_content_type = 'image/png' and declared_extension = 'png')
        or (declared_content_type = 'image/webp' and declared_extension = 'webp')
      );
  end if;
end $$;

create unique index if not exists work_media_assets_authorize_idempotency_idx
  on private.work_media_assets (work_id, authorize_idempotency_key);
