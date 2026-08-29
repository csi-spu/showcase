create index person_names_contributor_search_trgm_idx
on private.person_names using gin (
  (lower(first_name_th || ' ' || last_name_th)) extensions.gin_trgm_ops
)
where first_name_th is not null and last_name_th is not null;

create index person_names_contributor_first_name_prefix_idx
on private.person_names (lower(first_name_th) text_pattern_ops, person_id)
where first_name_th is not null and last_name_th is not null;

create index person_names_contributor_last_name_prefix_idx
on private.person_names (lower(last_name_th) text_pattern_ops, person_id)
where first_name_th is not null and last_name_th is not null;
