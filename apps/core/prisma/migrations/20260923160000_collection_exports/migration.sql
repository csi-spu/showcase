-- Milestone 4 exports: Excel tracking/answers and ZIP documents, both built
-- from one snapshot frozen when Core accepts the creation request.
-- Expand only: no existing column, constraint, or index is removed.

-- One export request. The job row carries the lifecycle; the snapshot rows
-- below carry the frozen scope. Private schema because a job names an
-- Instructor and the Students whose work it will contain.
CREATE TABLE private.collection_exports (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    -- 'excel' is the tracking and answers workbook, 'zip' the documents
    -- arranged per Student. Both read the same snapshot rows.
    kind text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    requested_by_account_id uuid NOT NULL,
    requested_at timestamp with time zone NOT NULL,
    -- Set when the artifact becomes downloadable, which is also when the
    -- 24-hour clock starts. Expiry is stored rather than derived so a display
    -- and a download decision can never disagree about the same instant.
    ready_at timestamp with time zone,
    expires_at timestamp with time zone,
    storage_key text,
    byte_size bigint,
    -- A stable code the Instructor is shown so a failure exposes retry rather
    -- than a successful partial archive.
    error_code text,
    attempt_count integer NOT NULL DEFAULT 0,
    -- Leased the same way file inspection is: a worker that dies mid-archive
    -- releases its claim by letting the lease lapse, and the retry rebuilds
    -- from the same frozen snapshot.
    lease_id uuid,
    lease_expires_at timestamp with time zone,
    cleanup_attempted_at timestamp with time zone,
    CONSTRAINT collection_exports_pkey PRIMARY KEY (id),
    CONSTRAINT collection_exports_kind_check CHECK (kind IN ('excel', 'zip')),
    CONSTRAINT collection_exports_status_check CHECK (
        status IN ('pending', 'building', 'ready', 'failed', 'expired')
    ),
    CONSTRAINT collection_exports_attempt_count_check CHECK (attempt_count >= 0),
    -- A ready export is exactly the states that make a download possible; any
    -- other combination is rejected here rather than guarded in application
    -- code that a later caller could forget.
    CONSTRAINT collection_exports_ready_check CHECK (
        status <> 'ready'
        OR (
            ready_at IS NOT NULL
            AND expires_at IS NOT NULL
            AND expires_at > ready_at
            AND storage_key IS NOT NULL
            AND byte_size IS NOT NULL
            AND byte_size >= 0
        )
    ),
    CONSTRAINT collection_exports_failed_check CHECK (status <> 'failed' OR error_code IS NOT NULL),
    CONSTRAINT collection_exports_storage_key_check CHECK (
        storage_key IS NULL OR storage_key ~ '^collection-exports/[0-9a-f-]{36}\.(xlsx|zip)$'
    ),
    CONSTRAINT collection_exports_group_fkey FOREIGN KEY (group_id) REFERENCES public.collection_groups(id),
    CONSTRAINT collection_exports_requester_fkey FOREIGN KEY (requested_by_account_id) REFERENCES public.accounts(id)
);

-- The worker claims the oldest unfinished job, so the scan is by status and age.
CREATE INDEX collection_exports_claim_idx
    ON private.collection_exports (status, requested_at)
    WHERE status IN ('pending', 'building');

-- Cleanup sweeps ready artifacts whose expiry has passed.
CREATE INDEX collection_exports_expiry_idx
    ON private.collection_exports (expires_at)
    WHERE status = 'ready';

-- An Instructor lists a group's recent exports newest first.
CREATE INDEX collection_exports_group_time_idx
    ON private.collection_exports (group_id, requested_at DESC);

-- The frozen form scope. Written in the same transaction as the job, so the
-- selected forms cannot drift even if the group gains a form a second later.
CREATE TABLE private.collection_export_forms (
    export_id uuid NOT NULL,
    form_id uuid NOT NULL,
    position integer NOT NULL,
    -- Titles are copied, not joined, so a renamed form does not rewrite a
    -- finished workbook's column headings.
    title text NOT NULL,
    fields jsonb NOT NULL,
    CONSTRAINT collection_export_forms_pkey PRIMARY KEY (export_id, form_id),
    CONSTRAINT collection_export_forms_position_check CHECK (position >= 0),
    CONSTRAINT collection_export_forms_fields_check CHECK (jsonb_typeof(fields) = 'array'),
    CONSTRAINT collection_export_forms_export_fkey FOREIGN KEY (export_id) REFERENCES private.collection_exports(id) ON DELETE CASCADE,
    CONSTRAINT collection_export_forms_form_fkey FOREIGN KEY (form_id) REFERENCES public.collection_forms(id),
    CONSTRAINT collection_export_forms_order_unique UNIQUE (export_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

-- One frozen cell: what one Student had submitted for one form at creation
-- time. submission_id names an immutable row, which is what makes "later
-- submissions cannot change it" true without copying answers here.
--
-- A row exists for every obligation in scope, including those with nothing
-- submitted, because the tracking sheet has to show the gaps.
CREATE TABLE private.collection_export_entries (
    export_id uuid NOT NULL,
    form_id uuid NOT NULL,
    student_account_id uuid NOT NULL,
    -- Display name copied at creation: a later name change does not rewrite a
    -- finished archive, and the Student ID is deliberately absent.
    student_display_name text NOT NULL,
    -- Ordering key for stable rows and for building collision-free folder
    -- names without a Student ID.
    position integer NOT NULL,
    obligation_status text NOT NULL,
    -- Null when the Student has submitted nothing. Never a draft: drafts have
    -- no submission row at all.
    submission_id uuid,
    submitted_at timestamp with time zone,
    is_late boolean NOT NULL DEFAULT false,
    CONSTRAINT collection_export_entries_pkey PRIMARY KEY (export_id, form_id, student_account_id),
    CONSTRAINT collection_export_entries_position_check CHECK (position >= 0),
    CONSTRAINT collection_export_entries_name_check CHECK (
        char_length(student_display_name) BETWEEN 1 AND 200
    ),
    CONSTRAINT collection_export_entries_submitted_check CHECK (
        (submission_id IS NULL) = (submitted_at IS NULL)
    ),
    CONSTRAINT collection_export_entries_export_fkey FOREIGN KEY (export_id) REFERENCES private.collection_exports(id) ON DELETE CASCADE,
    CONSTRAINT collection_export_entries_form_fkey FOREIGN KEY (export_id, form_id) REFERENCES private.collection_export_forms(export_id, form_id) ON DELETE CASCADE,
    CONSTRAINT collection_export_entries_student_fkey FOREIGN KEY (student_account_id) REFERENCES public.accounts(id),
    CONSTRAINT collection_export_entries_submission_fkey FOREIGN KEY (submission_id) REFERENCES private.collection_submissions(id)
);

-- The worker walks one export's entries in a stable order, one Student at a
-- time, so it never has to sort or buffer the whole set.
CREATE INDEX collection_export_entries_walk_idx
    ON private.collection_export_entries (export_id, position, form_id);
