-- PostgreSQL does not index foreign keys automatically. Account lifecycle and
-- audit lookups must not scan the full structural event history.
CREATE INDEX collection_form_structure_events_actor_idx
    ON private.collection_form_structure_events (actor_account_id);
