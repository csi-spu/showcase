-- Milestone 2: form templates, private file uploads, and reusable mapped values.
-- Expand-only. Existing rows keep working: `fields` already holds a jsonb array,
-- and the new field shape only adds optional keys that older Core ignores.

-- Templates are independent copies. A template owns its own field definitions and
-- never references a form, so editing one afterwards cannot reach an existing form.
CREATE TABLE public.collection_form_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 200),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
    fields jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array'),
    created_by_account_id uuid NOT NULL REFERENCES public.accounts(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

-- Templates are visible to every Instructor, so the listing orders by recency
-- across the whole table rather than by owner.
CREATE INDEX collection_form_templates_created_idx
    ON public.collection_form_templates (created_at DESC);

-- Records which template a form was copied from, for provenance only. The copy is
-- independent: this column never makes a template edit reach the form.
ALTER TABLE public.collection_forms
    ADD COLUMN created_from_template_id uuid REFERENCES public.collection_form_templates(id);

-- Metadata edits stay permitted after opening, so they need their own audit trail.
-- Structural edits are rejected by the application before reaching this table.
CREATE TABLE private.collection_form_metadata_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id uuid NOT NULL REFERENCES public.collection_forms(id),
    actor_account_id uuid NOT NULL REFERENCES public.accounts(id),
    change_kind text NOT NULL CHECK (change_kind IN ('title', 'description', 'deadline')),
    previous_value text,
    next_value text,
    occurred_at timestamptz NOT NULL
);

CREATE INDEX collection_form_metadata_events_form_time_idx
    ON private.collection_form_metadata_events (form_id, occurred_at DESC);

-- Uploaded bytes stay in a private namespace and are never publicly addressable.
-- `storage_key` is an opaque generated identifier: it must never contain a
-- Student ID, and nothing here is reachable from the public Work media namespace.
--
-- Lifecycle: quarantined -> inspecting -> ready | failed. Only `ready` may be
-- attached to a submission. There is no path that marks a file ready without a
-- recorded inspection result, so an absent scanner leaves files unattachable
-- rather than silently accepted.
CREATE TABLE private.collection_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id uuid NOT NULL REFERENCES public.collection_forms(id),
    field_id text NOT NULL CHECK (field_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
    student_account_id uuid NOT NULL REFERENCES public.accounts(id),
    storage_key text NOT NULL UNIQUE CHECK (storage_key ~ '^collection-files/[0-9a-f-]{36}$'),
    original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
    declared_content_type text NOT NULL,
    detected_content_type text,
    byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 10000000),
    status text NOT NULL DEFAULT 'quarantined'
        CHECK (status IN ('quarantined', 'inspecting', 'ready', 'failed')),
    inspection_error_code text,
    created_at timestamptz NOT NULL,
    inspected_at timestamptz,
    -- A file only reaches `ready` through a recorded inspection, and a `failed`
    -- file must say why. This keeps "safe" from ever being the default state.
    CHECK (
        (status IN ('quarantined', 'inspecting') AND inspected_at IS NULL AND inspection_error_code IS NULL)
        OR (status = 'ready' AND inspected_at IS NOT NULL AND detected_content_type IS NOT NULL)
        OR (status = 'failed' AND inspected_at IS NOT NULL AND inspection_error_code IS NOT NULL)
    )
);

-- Bounds the per-field file count query and the per-submission total-bytes sum.
CREATE INDEX collection_files_owner_field_idx
    ON private.collection_files (student_account_id, form_id, field_id, created_at DESC);

-- Attaching a file to a submitted version is what makes it an accepted document.
-- The row is immutable once written, so a later re-upload cannot alter history.
CREATE TABLE private.collection_submission_files (
    submission_id uuid NOT NULL REFERENCES private.collection_submissions(id),
    field_id text NOT NULL CHECK (field_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
    file_id uuid NOT NULL REFERENCES private.collection_files(id),
    position integer NOT NULL CHECK (position >= 0 AND position < 5),
    PRIMARY KEY (submission_id, field_id, position),
    UNIQUE (submission_id, file_id)
);

CREATE INDEX collection_submission_files_file_idx
    ON private.collection_submission_files (file_id);

-- Draft file selections are separate from submitted ones: an Instructor must not
-- see them, and replacing a draft selection must not touch submitted history.
CREATE TABLE private.collection_draft_files (
    form_id uuid NOT NULL,
    student_account_id uuid NOT NULL,
    field_id text NOT NULL CHECK (field_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
    file_id uuid NOT NULL REFERENCES private.collection_files(id),
    position integer NOT NULL CHECK (position >= 0 AND position < 5),
    PRIMARY KEY (form_id, student_account_id, field_id, position),
    UNIQUE (form_id, student_account_id, file_id),
    FOREIGN KEY (form_id, student_account_id)
        REFERENCES private.collection_response_drafts(form_id, student_account_id)
);

-- Resolving a reusable value means finding this Student's latest passed submission
-- in this group that carried the same mapping key. The lookup walks obligations for
-- one student across one group's forms and orders by submission time, so it needs
-- the group edge on the form and the passed-status edge on the obligation.
CREATE INDEX collection_obligations_passed_student_idx
    ON public.collection_obligations (student_account_id, status)
    WHERE status = 'passed';
