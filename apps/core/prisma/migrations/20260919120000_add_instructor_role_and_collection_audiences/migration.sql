-- Issue #112 milestone 1: introduce the Instructor role and two new BFF session
-- audiences (Instructor, Student-collection) for the private document-collection
-- product. This migration only extends the existing auth/role seam; no
-- collection domain tables are created here.

ALTER TABLE public.account_roles
    DROP CONSTRAINT account_roles_role_check;

ALTER TABLE public.account_roles
    ADD CONSTRAINT account_roles_role_check
    CHECK ((role = ANY (ARRAY['student'::text, 'admin'::text, 'instructor'::text])));

ALTER TABLE private.authentication_sessions
    DROP CONSTRAINT authentication_sessions_audience_check;

ALTER TABLE private.authentication_sessions
    ADD CONSTRAINT authentication_sessions_audience_check
    CHECK ((audience = ANY (ARRAY['student'::text, 'admin'::text, 'instructor'::text, 'student_collection'::text])));

-- Instructor role grants/revokes on an existing Account are attributable
-- mutations (mirrors private.admin_status_change_audit_events) even though
-- there is no versioned "status" being changed, just role membership.
CREATE TABLE private.instructor_role_change_audit_events (
    id bigint NOT NULL,
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    instructor_account_id uuid NOT NULL,
    action text NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT instructor_role_change_audit_events_action_check CHECK ((action = ANY (ARRAY['granted'::text, 'revoked'::text])))
);

ALTER TABLE private.instructor_role_change_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.instructor_role_change_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY private.instructor_role_change_audit_events
    ADD CONSTRAINT instructor_role_change_audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY private.instructor_role_change_audit_events
    ADD CONSTRAINT instructor_role_change_audit_events_idempotency_key_key UNIQUE (idempotency_key);

CREATE INDEX instructor_role_change_target_time_idx ON private.instructor_role_change_audit_events USING btree (instructor_account_id, occurred_at DESC);

ALTER TABLE ONLY private.instructor_role_change_audit_events
    ADD CONSTRAINT instructor_role_change_audit_events_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY private.instructor_role_change_audit_events
    ADD CONSTRAINT instructor_role_change_audit_events_instructor_account_id_fkey FOREIGN KEY (instructor_account_id) REFERENCES public.accounts(id);
