create table private.profile_photo_assets (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id),
  status text not null check (
    status in ('pending_upload', 'processing', 'ready', 'rejected')
  ),
  quarantine_object_key text not null unique,
  sanitized_object_key text unique,
  declared_content_type text not null check (
    declared_content_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  declared_byte_size integer not null check (
    declared_byte_size > 0 and declared_byte_size <= 2097152
  ),
  inspected_content_type text check (
    inspected_content_type is null
    or inspected_content_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  inspected_byte_size integer check (
    inspected_byte_size is null
    or inspected_byte_size > 0
  ),
  width integer check (width is null or width between 512 and 4096),
  height integer check (height is null or height between 512 and 4096),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  expires_at timestamptz not null,
  rejection_code text,
  constraint profile_photo_assets_ready_complete check (
    status <> 'ready'
    or (
      sanitized_object_key is not null
      and inspected_content_type is not null
      and inspected_byte_size is not null
      and width is not null
      and height is not null
      and width = height
      and rejection_code is null
    )
  ),
  constraint profile_photo_assets_rejection_complete check (
    (status = 'rejected' and rejection_code is not null)
    or (status <> 'rejected' and rejection_code is null)
  )
);

create index profile_photo_assets_person_time_idx
  on private.profile_photo_assets (person_id, created_at desc);

create index profile_photo_assets_expiry_idx
  on private.profile_photo_assets (expires_at)
  where status in ('pending_upload', 'processing');

create table public.public_profiles (
  person_id uuid primary key references public.people (id),
  public_id uuid not null unique default gen_random_uuid(),
  display_name text not null check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 100
  ),
  bio text check (
    bio is null
    or (bio = btrim(bio) and char_length(bio) between 1 and 500)
  ),
  photo_id uuid references private.profile_photo_assets (id),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index public_profiles_photo_id_idx
  on public.public_profiles (photo_id)
  where photo_id is not null;

create table public.public_profile_links (
  person_id uuid not null references public.public_profiles (person_id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  label text not null check (
    label = btrim(label) and char_length(label) between 1 and 50
  ),
  url text not null check (
    char_length(url) <= 2048
    and url ~ '^https://'
  ),
  primary key (person_id, position),
  unique (person_id, url)
);

create table public.profile_consents (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.public_profiles (person_id),
  consent_text_version text not null check (
    consent_text_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  granted_at timestamptz not null,
  withdrawn_at timestamptz,
  constraint profile_consents_time_order_valid check (
    withdrawn_at is null or withdrawn_at >= granted_at
  )
);

create unique index profile_consents_active_person_idx
  on public.profile_consents (person_id)
  where withdrawn_at is null;

create index profile_consents_person_time_idx
  on public.profile_consents (person_id, granted_at desc);

create table private.profile_operations (
  idempotency_key uuid primary key,
  person_id uuid not null references public.people (id),
  actor_account_id uuid not null references public.accounts (id),
  operation text not null check (
    operation in ('profile_updated', 'profile_consent_granted', 'profile_consent_withdrawn')
  ),
  expected_version bigint not null check (expected_version >= 0),
  resulting_version bigint not null check (resulting_version > 0),
  request_payload jsonb not null,
  occurred_at timestamptz not null
);

create index profile_operations_person_time_idx
  on private.profile_operations (person_id, occurred_at desc);

create index profile_operations_actor_account_idx
  on private.profile_operations (actor_account_id);

alter table public.public_profiles enable row level security;
alter table public.public_profile_links enable row level security;
alter table public.profile_consents enable row level security;

revoke all on table private.profile_photo_assets from public, anon, authenticated;
revoke all on table private.profile_operations from public, anon, authenticated;
revoke all on table public.public_profiles from anon, authenticated;
revoke all on table public.public_profile_links from anon, authenticated;
revoke all on table public.profile_consents from anon, authenticated;
