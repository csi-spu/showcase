-- Bootstraps the singleton public cache version row. Without it, every fresh
-- database (new environment, disaster recovery restore) starts with an empty
-- private.public_cache_version table: the only writer is an UPDATE-only
-- trigger (private.enqueue_public_cache_invalidation), so the Visitor
-- shared-cache lookup fails with PUBLIC_CACHE_VERSION_MISSING until this row
-- exists. Unlike academic_settings.current_academic_year, this value has no
-- business decision to defer, so migrations can seed it directly.
INSERT INTO private.public_cache_version (singleton, version, updated_at)
VALUES (true, 0, now())
ON CONFLICT (singleton) DO NOTHING;
