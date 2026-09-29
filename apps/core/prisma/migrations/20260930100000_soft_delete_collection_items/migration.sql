-- A Collection Deletion removes a round, group, or form and everything beneath
-- it as one audited, recoverable action (ADR 0023). An item is deleted exactly
-- when its deletion_id is set; restoring a deletion clears the ids it set and
-- nothing else, so an earlier, separate deletion of a descendant survives.
-- Expand only: previous Core ignores deletion_id, and existing rows are live.
CREATE TABLE private.collection_deletions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_kind text NOT NULL,
    -- The target and its ancestors. Rows are never removed, so the keys hold.
    round_id uuid NOT NULL,
    group_id uuid,
    form_id uuid,
    -- What the deletion removed, captured when it happened.
    group_count integer NOT NULL,
    form_count integer NOT NULL,
    assigned_student_count integer NOT NULL,
    submitted_student_count integer NOT NULL,
    deleted_by_account_id uuid NOT NULL,
    deleted_at timestamptz NOT NULL,
    restored_by_account_id uuid,
    restored_at timestamptz,
    restore_reason text,
    CONSTRAINT collection_deletions_round_fkey
        FOREIGN KEY (round_id) REFERENCES public.collection_rounds (id),
    CONSTRAINT collection_deletions_group_fkey
        FOREIGN KEY (group_id) REFERENCES public.collection_groups (id),
    CONSTRAINT collection_deletions_form_fkey
        FOREIGN KEY (form_id) REFERENCES public.collection_forms (id),
    CONSTRAINT collection_deletions_deleted_by_fkey
        FOREIGN KEY (deleted_by_account_id) REFERENCES public.accounts (id),
    CONSTRAINT collection_deletions_restored_by_fkey
        FOREIGN KEY (restored_by_account_id) REFERENCES public.accounts (id),
    CONSTRAINT collection_deletions_target_check CHECK (
        (target_kind = 'round' AND group_id IS NULL AND form_id IS NULL)
        OR (target_kind = 'group' AND group_id IS NOT NULL AND form_id IS NULL)
        OR (target_kind = 'form' AND group_id IS NOT NULL AND form_id IS NOT NULL)
    ),
    CONSTRAINT collection_deletions_counts_check CHECK (
        group_count >= 0
        AND form_count >= 0
        AND submitted_student_count >= 0
        AND submitted_student_count <= assigned_student_count
    ),
    CONSTRAINT collection_deletions_restore_check CHECK (
        (restored_by_account_id IS NULL AND restored_at IS NULL AND restore_reason IS NULL)
        OR (
            restored_by_account_id IS NOT NULL
            AND restored_at IS NOT NULL
            AND restored_at >= deleted_at
            AND char_length(restore_reason) BETWEEN 1 AND 2000
        )
    )
);

CREATE INDEX collection_deletions_time_idx
    ON private.collection_deletions (deleted_at DESC, id DESC);

ALTER TABLE public.collection_rounds
    ADD COLUMN deletion_id uuid,
    ADD CONSTRAINT collection_rounds_deletion_fkey
        FOREIGN KEY (deletion_id) REFERENCES private.collection_deletions (id);

ALTER TABLE public.collection_groups
    ADD COLUMN deletion_id uuid,
    ADD CONSTRAINT collection_groups_deletion_fkey
        FOREIGN KEY (deletion_id) REFERENCES private.collection_deletions (id);

ALTER TABLE public.collection_forms
    ADD COLUMN deletion_id uuid,
    ADD CONSTRAINT collection_forms_deletion_fkey
        FOREIGN KEY (deletion_id) REFERENCES private.collection_deletions (id);

-- Restore finds exactly the rows one deletion stamped.
CREATE INDEX collection_rounds_deletion_idx
    ON public.collection_rounds (deletion_id) WHERE deletion_id IS NOT NULL;
CREATE INDEX collection_groups_deletion_idx
    ON public.collection_groups (deletion_id) WHERE deletion_id IS NOT NULL;
CREATE INDEX collection_forms_deletion_idx
    ON public.collection_forms (deletion_id) WHERE deletion_id IS NOT NULL;

-- Every normal read lists live rows only, so the listing indexes cover them alone.
DROP INDEX public.collection_rounds_created_at_idx;
CREATE INDEX collection_rounds_created_at_idx
    ON public.collection_rounds (created_at DESC) WHERE deletion_id IS NULL;

DROP INDEX public.collection_groups_round_id_idx;
CREATE INDEX collection_groups_round_id_idx
    ON public.collection_groups (round_id, created_at DESC) WHERE deletion_id IS NULL;

DROP INDEX public.collection_forms_group_status_idx;
CREATE INDEX collection_forms_group_status_idx
    ON public.collection_forms (group_id, status, created_at DESC) WHERE deletion_id IS NULL;
