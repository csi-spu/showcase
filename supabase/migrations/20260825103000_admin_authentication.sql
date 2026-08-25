create table private.admin_auth_identities (
  account_id uuid primary key references public.accounts (id),
  admin_login_hash char(64) not null unique
    check (admin_login_hash ~ '^[0-9a-f]{64}$'),
  synthetic_identity text not null unique
    check (synthetic_identity ~ '^[0-9a-f]{64}@admin[.]auth[.]invalid$'),
  created_at timestamptz not null default now()
);

revoke all on table private.admin_auth_identities from public, anon, authenticated;
