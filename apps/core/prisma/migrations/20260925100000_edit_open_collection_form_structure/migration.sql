-- Preserve the exact question schema used by every submitted version while
-- allowing the live form definition to continue evolving.
ALTER TABLE private.collection_submissions
    ADD COLUMN form_version integer,
    ADD COLUMN form_fields jsonb;

-- Keep the previous application version write-compatible while deploys roll.
-- New Core supplies both values explicitly; the trigger fills only omitted
-- values from the form row visible in the same transaction.
CREATE FUNCTION private.fill_collection_submission_form_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.form_version IS NULL OR NEW.form_fields IS NULL THEN
        SELECT version, fields
        INTO NEW.form_version, NEW.form_fields
        FROM public.collection_forms
        WHERE id = NEW.form_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER collection_submissions_fill_form_snapshot
BEFORE INSERT ON private.collection_submissions
FOR EACH ROW
EXECUTE FUNCTION private.fill_collection_submission_form_snapshot();

UPDATE private.collection_submissions AS submission
SET form_version = form.version,
    form_fields = form.fields
FROM public.collection_forms AS form
WHERE form.id = submission.form_id;

ALTER TABLE private.collection_submissions
    ALTER COLUMN form_version SET NOT NULL,
    ALTER COLUMN form_fields SET NOT NULL,
    ADD CONSTRAINT collection_submissions_form_version_check CHECK (form_version > 0),
    ADD CONSTRAINT collection_submissions_form_fields_check CHECK (jsonb_typeof(form_fields) = 'array');

-- Structural changes are auditable independently from title/deadline events.
-- Snapshots make the event self-contained even after later edits.
CREATE TABLE private.collection_form_structure_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id uuid NOT NULL REFERENCES public.collection_forms(id),
    actor_account_id uuid NOT NULL REFERENCES public.accounts(id),
    previous_version integer NOT NULL CHECK (previous_version > 0),
    next_version integer NOT NULL CHECK (next_version = previous_version + 1),
    previous_fields jsonb NOT NULL CHECK (jsonb_typeof(previous_fields) = 'array'),
    next_fields jsonb NOT NULL CHECK (jsonb_typeof(next_fields) = 'array'),
    occurred_at timestamptz NOT NULL
);

CREATE INDEX collection_form_structure_events_form_time_idx
    ON private.collection_form_structure_events (form_id, occurred_at DESC);

-- An export may contain latest submissions created against different form
-- versions. Freeze each submitted schema with its export entry so removed
-- questions remain represented when the worker builds the workbook later.
ALTER TABLE private.collection_export_entries
    ADD COLUMN submission_fields jsonb;

CREATE FUNCTION private.fill_collection_export_entry_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.submission_id IS NOT NULL AND NEW.submission_fields IS NULL THEN
        SELECT form_fields
        INTO NEW.submission_fields
        FROM private.collection_submissions
        WHERE id = NEW.submission_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER collection_export_entries_fill_submission_fields
BEFORE INSERT ON private.collection_export_entries
FOR EACH ROW
EXECUTE FUNCTION private.fill_collection_export_entry_fields();

UPDATE private.collection_export_entries AS entry
SET submission_fields = submission.form_fields
FROM private.collection_submissions AS submission
WHERE submission.id = entry.submission_id;

ALTER TABLE private.collection_export_entries
    ADD CONSTRAINT collection_export_entries_submission_fields_check CHECK (
        (submission_id IS NULL AND submission_fields IS NULL)
        OR (submission_id IS NOT NULL AND jsonb_typeof(submission_fields) = 'array')
    );
