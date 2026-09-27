-- Issue #133: Instructors create a group together with its members and add
-- members through one selection flow (roster table plus CSV import). Table and
-- CSV share one provenance value because CSV only populates the selection.
-- Historical 'student_id_list', 'entry_year', and 'individual' rows are kept
-- as written; older code never writes the new value, so a rollback may leave
-- the widened constraint in place.
ALTER TABLE public.collection_group_memberships
    DROP CONSTRAINT collection_group_memberships_source_check;
ALTER TABLE public.collection_group_memberships
    ADD CONSTRAINT collection_group_memberships_source_check CHECK ((membership_source = ANY (ARRAY['student_id_list'::text, 'entry_year'::text, 'individual'::text, 'instructor_selection'::text])));

-- A repeated create (double submit or retry) returns the original group rather
-- than a duplicate. The key is scoped to the creating Instructor; NULL keys
-- (groups created before this migration) never conflict.
ALTER TABLE public.collection_groups ADD COLUMN creation_idempotency_key uuid;
CREATE UNIQUE INDEX collection_groups_creation_idempotency_idx
    ON public.collection_groups USING btree (created_by_account_id, creation_idempotency_key);
