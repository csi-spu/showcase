create index tags_active_normalized_identity_trgm_idx
on public.tags using gin (normalized_identity extensions.gin_trgm_ops)
where active_work_count > 0;
