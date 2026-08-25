create table private.work_media_assets (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete restrict,
  media_kind text not null check (media_kind in ('poster', 'gallery')),
  status text not null check (status in ('pending_upload', 'uploaded', 'processing', 'ready', 'rejected')),
  quarantine_object_key text not null unique,
  authorize_idempotency_key uuid not null,
  master_object_key text unique,
  declared_content_type text not null check (declared_content_type in ('image/jpeg', 'image/png', 'image/webp')),
  declared_extension text not null check (declared_extension in ('jpeg', 'jpg', 'png', 'webp')),
  declared_byte_size integer not null check (declared_byte_size > 0 and declared_byte_size <= 5242880),
  inspected_byte_size integer check (inspected_byte_size > 0),
  width integer check (width between 1 and 2560),
  height integer check (height between 1 and 2560),
  content_hash bytea,
  dominant_color text check (dominant_color is null or dominant_color ~ '^#[0-9A-F]{6}$'),
  rejection_code text check (rejection_code in ('expired', 'invalid_media', 'processing_failed')),
  warnings text[] not null default '{}' check (warnings <@ array['poster_width_below_recommended']::text[]),
  processing_attempts smallint not null default 0 check (processing_attempts between 0 and 3),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  expires_at timestamptz not null,
  processing_started_at timestamptz,
  cleanup_started_at timestamptz,
  constraint work_media_assets_declared_type_matches_extension check (
    (declared_content_type = 'image/jpeg' and declared_extension in ('jpeg', 'jpg'))
    or (declared_content_type = 'image/png' and declared_extension = 'png')
    or (declared_content_type = 'image/webp' and declared_extension = 'webp')
  ),
  constraint work_media_assets_ready_complete check (
    status <> 'ready' or (
      master_object_key is not null and inspected_byte_size is not null
      and width is not null and height is not null and content_hash is not null
      and dominant_color is not null and rejection_code is null
    )
  ),
  constraint work_media_assets_rejection_complete check (
    (status = 'rejected' and rejection_code is not null)
    or (status <> 'rejected' and rejection_code is null)
  )
);

create unique index work_media_assets_authorize_idempotency_idx
  on private.work_media_assets (work_id, authorize_idempotency_key);

create index work_media_assets_work_time_idx
  on private.work_media_assets (work_id, created_at desc);

create index work_media_assets_processing_idx
  on private.work_media_assets (created_at, id)
  where status in ('uploaded', 'processing');

create index work_media_assets_expiry_idx
  on private.work_media_assets (expires_at, id)
  where cleanup_started_at is null;

create table private.work_media_variants (
  asset_id uuid not null references private.work_media_assets (id) on delete restrict,
  width integer not null check (width > 0 and width <= 2560),
  height integer not null check (height > 0 and height <= 2560),
  byte_size integer not null check (byte_size > 0),
  content_hash bytea not null,
  object_key text not null unique,
  primary key (asset_id, width)
);

create table private.work_draft_media (
  work_id uuid not null references private.work_drafts (work_id) on delete cascade,
  media_kind text not null check (media_kind in ('poster', 'gallery')),
  position smallint not null check (position between 1 and 3),
  asset_id uuid not null unique references private.work_media_assets (id) on delete restrict,
  created_at timestamptz not null,
  primary key (work_id, media_kind, position),
  constraint work_draft_media_poster_position check (media_kind <> 'poster' or position = 1)
);

create table private.work_draft_video_links (
  work_id uuid not null references private.work_drafts (work_id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  provider text not null check (provider in ('youtube', 'tiktok')),
  provider_video_id text not null check (char_length(provider_video_id) between 1 and 255),
  url text not null check (url ~ '^https://'),
  primary key (work_id, position),
  unique (work_id, provider, provider_video_id)
);

alter table private.work_media_assets enable row level security;
alter table private.work_media_variants enable row level security;
alter table private.work_draft_media enable row level security;
alter table private.work_draft_video_links enable row level security;
revoke all on table private.work_media_assets from public, anon, authenticated;
revoke all on table private.work_media_variants from public, anon, authenticated;
revoke all on table private.work_draft_media from public, anon, authenticated;
revoke all on table private.work_draft_video_links from public, anon, authenticated;
