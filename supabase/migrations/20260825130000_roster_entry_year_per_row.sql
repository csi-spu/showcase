alter table private.roster_rows
  add column entry_year smallint;

alter table private.roster_batches
  add column entry_years smallint[];

update private.roster_rows as roster_row
set entry_year = roster_batch.entry_year
from private.roster_batches as roster_batch
where roster_batch.id = roster_row.batch_id;

update private.roster_batches
set entry_years = array[entry_year];

create function private.are_valid_roster_entry_years(candidate smallint[])
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select
    candidate = (
      select array_agg(distinct value order by value)
      from unnest(candidate) as entry_year(value)
    )
    and cardinality(candidate) between 1 and 100
    and array_position(candidate, null) is null
    and candidate[1] between 2400 and 2700
    and candidate[cardinality(candidate)] between 2400 and 2700
$$;

alter table private.roster_rows
  alter column entry_year set not null,
  add constraint roster_row_entry_year_valid check (entry_year between 2400 and 2700);

alter table private.roster_batches
  alter column entry_years set not null,
  add constraint roster_batch_entry_years_count_valid
    check (private.are_valid_roster_entry_years(entry_years)),
  drop column entry_year;

revoke execute on function private.are_valid_roster_entry_years(smallint[])
  from public, anon, authenticated;

comment on column private.roster_batches.entry_years is
  'Sorted distinct Buddhist Era entry years represented by this Batch.';

comment on column private.roster_rows.entry_year is
  'Buddhist Era entry year derived from the first two digits of the Student ID.';
