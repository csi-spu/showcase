-- Opening a form is audited on the same timeline as its edits, closing, and
-- reopening, so an Instructor's edit history starts where the form went live.
-- Expand only: previous Core never writes 'opened', and forms opened before
-- this change are not backfilled.
ALTER TABLE private.collection_form_metadata_events
    DROP CONSTRAINT collection_form_metadata_events_change_kind_check;

ALTER TABLE private.collection_form_metadata_events
    ADD CONSTRAINT collection_form_metadata_events_change_kind_check
    CHECK (change_kind IN ('title', 'description', 'deadline', 'opened', 'closed', 'reopened'));
