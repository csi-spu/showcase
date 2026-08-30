alter table private.roster_rows
add column student_id_prefix_hashes char(64)[],
add constraint roster_rows_student_id_prefix_hashes_valid check (
  student_id_prefix_hashes is null
  or (
    cardinality(student_id_prefix_hashes) = 7
    and array_to_string(student_id_prefix_hashes, '') ~ '^(?:[0-9a-f]{64}){7}$'
  )
);

create table private.student_id_search_prefixes (
  account_id uuid not null
    references private.student_auth_identities (account_id) on delete cascade,
  prefix_length smallint not null check (prefix_length between 1 and 7),
  prefix_hash char(64) not null check (prefix_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null,
  primary key (account_id, prefix_length)
);

create index student_id_search_prefixes_lookup_idx
on private.student_id_search_prefixes (prefix_hash, prefix_length, account_id);

revoke all on table private.student_id_search_prefixes from public, anon, authenticated;
