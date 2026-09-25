-- A registered slot is not inspectable until the browser confirms its PUT completed.
ALTER TABLE private.collection_files
    DROP CONSTRAINT collection_files_status_check,
    DROP CONSTRAINT collection_files_check;

ALTER TABLE private.collection_files
    ALTER COLUMN status SET DEFAULT 'pending_upload',
    ADD CONSTRAINT collection_files_status_check
        CHECK (status IN ('pending_upload', 'quarantined', 'inspecting', 'ready', 'failed')),
    ADD CONSTRAINT collection_files_lifecycle_valid CHECK (
        (status IN ('pending_upload', 'quarantined', 'inspecting')
            AND inspected_at IS NULL AND inspection_error_code IS NULL)
        OR (status = 'ready' AND inspected_at IS NOT NULL AND detected_content_type IS NOT NULL)
        OR (status = 'failed' AND inspected_at IS NOT NULL AND inspection_error_code IS NOT NULL)
    );
