-- Milestone 3 lifecycle: closing and reopening first submissions, and closing
-- and reopening a collection round. Both are audited acts with a required
-- reason. Expand only: no existing column or constraint is removed.

-- Closing and reopening a form are lifecycle changes, not metadata edits, but
-- they belong on the same form timeline the Instructor already reads.
ALTER TABLE private.collection_form_metadata_events
    DROP CONSTRAINT collection_form_metadata_events_change_kind_check;

ALTER TABLE private.collection_form_metadata_events
    ADD CONSTRAINT collection_form_metadata_events_change_kind_check
    CHECK (change_kind IN ('title', 'description', 'deadline', 'closed', 'reopened'));

-- A reopen assigns obligations to members who joined while the form was closed.
-- The count is previewed before confirmation and recorded here afterwards, so
-- the audit answers "how many people did this put to work".
ALTER TABLE private.collection_form_metadata_events
    ADD COLUMN reason text,
    ADD COLUMN assigned_count integer;

ALTER TABLE private.collection_form_metadata_events
    ADD CONSTRAINT collection_form_metadata_events_reason_check
    CHECK (reason IS NULL OR (reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 2000));

-- Closing and reopening a form both require a reason; metadata edits do not.
ALTER TABLE private.collection_form_metadata_events
    ADD CONSTRAINT collection_form_metadata_events_lifecycle_reason_check
    CHECK (change_kind NOT IN ('closed', 'reopened') OR reason IS NOT NULL);

ALTER TABLE private.collection_form_metadata_events
    ADD CONSTRAINT collection_form_metadata_events_assigned_count_check
    CHECK (assigned_count IS NULL OR assigned_count >= 0);

CREATE TABLE private.collection_round_lifecycle_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    round_id uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    -- Outstanding work at the moment of the decision. Retained because the
    -- counts an Instructor confirmed against are not recoverable later.
    pending_not_submitted integer NOT NULL,
    pending_awaiting_checking integer NOT NULL,
    pending_changes_required integer NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT collection_round_lifecycle_events_pkey PRIMARY KEY (id),
    CONSTRAINT collection_round_lifecycle_events_action_check CHECK (action IN ('closed', 'reopened')),
    CONSTRAINT collection_round_lifecycle_events_reason_check CHECK (reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 2000),
    CONSTRAINT collection_round_lifecycle_events_pending_check CHECK (
        pending_not_submitted >= 0 AND pending_awaiting_checking >= 0 AND pending_changes_required >= 0
    ),
    CONSTRAINT collection_round_lifecycle_events_round_fkey FOREIGN KEY (round_id) REFERENCES public.collection_rounds(id),
    CONSTRAINT collection_round_lifecycle_events_actor_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id)
);

CREATE INDEX collection_round_lifecycle_events_round_time_idx
    ON private.collection_round_lifecycle_events (round_id, occurred_at DESC);

-- Reading one obligation's history means walking its submissions newest first.
CREATE INDEX collection_submissions_obligation_version_idx
    ON private.collection_submissions (form_id, student_account_id, version DESC);

-- Closing a round counts every obligation under it by status. The existing
-- index is keyed by student, so it cannot serve this rollup; this one lets the
-- counts come from the index rather than the obligation rows.
CREATE INDEX collection_obligations_form_status_idx
    ON public.collection_obligations (form_id, status);
