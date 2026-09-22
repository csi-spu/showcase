-- A worker may die after claiming a file but before recording the result. Give
-- every new claim a bounded lease so another worker can recover that queue row.
-- Existing `inspecting` rows predate leases and therefore return to the queue.
ALTER TABLE private.collection_files
    ADD COLUMN inspection_lease_id uuid,
    ADD COLUMN inspection_lease_expires_at timestamptz(6);

UPDATE private.collection_files
SET status = 'quarantined'
WHERE status = 'inspecting';

ALTER TABLE private.collection_files
    ADD CONSTRAINT collection_files_inspection_lease_pair_check CHECK (
        (inspection_lease_id IS NULL) = (inspection_lease_expires_at IS NULL)
    ),
    ADD CONSTRAINT collection_files_inspection_lease_status_check CHECK (
        (status = 'inspecting') = (inspection_lease_id IS NOT NULL)
    );

-- The active queue is a small subset of all uploaded files. This partial index
-- supports oldest-first claims without maintaining entries for terminal rows.
CREATE INDEX collection_files_inspection_queue_idx
    ON private.collection_files(created_at)
    WHERE status IN ('quarantined', 'inspecting');
