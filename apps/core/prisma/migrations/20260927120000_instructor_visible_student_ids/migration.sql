-- ADR 0020: Instructors see each Student's raw Student ID. Core keeps it next
-- to the keyed hash it already stores per Account. The column stays nullable
-- because Accounts whose Roster rows have expired have no raw value until an
-- Admin re-imports the Roster, which fills it in.
ALTER TABLE private.student_auth_identities ADD COLUMN student_id text;
ALTER TABLE private.student_auth_identities
    ADD CONSTRAINT student_auth_identities_student_id_check CHECK ((student_id ~ '^[0-9]{8}$'::text));
CREATE UNIQUE INDEX student_auth_identities_student_id_key
    ON private.student_auth_identities USING btree (student_id);

-- Backfill from Roster rows still retained (30 days after their batch ends).
-- A hash identifies exactly one raw value, so any matching row is correct.
UPDATE private.student_auth_identities AS identity
SET student_id = roster_row.student_id
FROM (
    SELECT DISTINCT ON (student_id_hash) student_id_hash, student_id
    FROM private.roster_rows
    WHERE student_id_hash IS NOT NULL AND student_id ~ '^[0-9]{8}$'
    ORDER BY student_id_hash, created_at DESC
) AS roster_row
WHERE roster_row.student_id_hash = identity.student_id_hash;

-- Export snapshots freeze the Student ID with the display name, so a finished
-- export rebuilds identically. Snapshots taken before this migration keep null
-- and fall back to position-only folder names.
ALTER TABLE private.collection_export_entries ADD COLUMN student_id text;
ALTER TABLE private.collection_export_entries
    ADD CONSTRAINT collection_export_entries_student_id_check CHECK ((student_id ~ '^[0-9]{8}$'::text));
