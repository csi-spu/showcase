-- Milestone 4 notifications: in-website only, no email and no LINE.
-- Expand only: no existing column, constraint, or index is removed.

-- One delivered notification for one Student about one obligation.
--
-- Private schema because a row names a Student and the work they owe. The
-- Student ID is never part of this table: an obligation is addressed by
-- account id and form id, both opaque.
CREATE TABLE private.collection_notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    form_id uuid NOT NULL,
    student_account_id uuid NOT NULL,
    kind text NOT NULL,
    -- What the notification refers to, so a reminder is identified by its lead
    -- time and an event by the submission it concerns. Together with kind this
    -- is what makes a retry idempotent rather than a duplicate.
    subject_key text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    read_at timestamp with time zone,
    CONSTRAINT collection_notifications_pkey PRIMARY KEY (id),
    CONSTRAINT collection_notifications_kind_check CHECK (
        kind IN ('obligation_assigned', 'changes_requested', 'submission_passed', 'deadline_reminder')
    ),
    CONSTRAINT collection_notifications_subject_key_check CHECK (
        subject_key = btrim(subject_key) AND char_length(subject_key) BETWEEN 1 AND 100
    ),
    CONSTRAINT collection_notifications_read_after_created_check CHECK (
        read_at IS NULL OR read_at >= created_at
    ),
    CONSTRAINT collection_notifications_form_fkey FOREIGN KEY (form_id) REFERENCES public.collection_forms(id),
    CONSTRAINT collection_notifications_student_fkey FOREIGN KEY (student_account_id) REFERENCES public.accounts(id)
);

-- The durable intent the specification asks for. A retried dispatch collides
-- here and does nothing, so the same reminder or event never reaches a Student
-- twice, whatever the worker does on its second attempt.
CREATE UNIQUE INDEX collection_notifications_idempotency_idx
    ON private.collection_notifications (form_id, student_account_id, kind, subject_key);

-- A Student reads their own notifications newest first, unread ones first.
CREATE INDEX collection_notifications_student_time_idx
    ON private.collection_notifications (student_account_id, created_at DESC);

-- Finding obligations whose reminders are now due means scanning by deadline
-- within open forms, not by student. Partial: a form with no deadline can
-- never produce a reminder, so those rows stay out of the index entirely.
CREATE INDEX collection_forms_deadline_due_idx
    ON public.collection_forms (deadline_at)
    WHERE deadline_at IS NOT NULL AND status = 'open';
