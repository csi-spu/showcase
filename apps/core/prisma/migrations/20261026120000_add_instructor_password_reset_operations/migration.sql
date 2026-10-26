-- Admin password resets for Instructor-only Accounts need their own leased,
-- idempotency-keyed operation log, mirroring
-- private.student_password_reset_operations. Accounts that also hold the Admin
-- role are not reset through this flow, so the table only references the
-- Instructor target and the acting Admin.

CREATE TABLE private.instructor_password_reset_operations (
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    instructor_account_id uuid NOT NULL,
    expected_version integer NOT NULL,
    resulting_version integer NOT NULL,
    status text NOT NULL,
    error_code text,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone,
    lease_until timestamp with time zone,
    attempt_number integer DEFAULT 1 NOT NULL,
    CONSTRAINT instructor_password_reset_operation_lease_valid CHECK ((((status = 'pending'::text) AND (lease_until IS NOT NULL)) OR ((status = ANY (ARRAY['provider_failed'::text, 'completed'::text])) AND (lease_until IS NULL)))),
    CONSTRAINT instructor_password_reset_operation_state_valid CHECK ((((status = 'pending'::text) AND (error_code IS NULL) AND (finished_at IS NULL)) OR ((status = 'provider_failed'::text) AND (error_code IS NOT NULL) AND (finished_at IS NOT NULL)) OR ((status = 'completed'::text) AND (error_code IS NULL) AND (finished_at IS NOT NULL)))),
    CONSTRAINT instructor_password_reset_operations_attempt_number_check CHECK ((attempt_number > 0)),
    CONSTRAINT instructor_password_reset_operations_check CHECK ((resulting_version > expected_version)),
    CONSTRAINT instructor_password_reset_operations_error_code_check CHECK (((error_code IS NULL) OR (error_code = 'provider_unavailable'::text))),
    CONSTRAINT instructor_password_reset_operations_expected_version_check CHECK ((expected_version > 0)),
    CONSTRAINT instructor_password_reset_operations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'provider_failed'::text, 'completed'::text])))
);

ALTER TABLE ONLY private.instructor_password_reset_operations
    ADD CONSTRAINT instructor_password_reset_operations_pkey PRIMARY KEY (idempotency_key);

CREATE UNIQUE INDEX instructor_password_reset_one_pending_per_account_idx ON private.instructor_password_reset_operations USING btree (instructor_account_id) WHERE (status = 'pending'::text);

CREATE INDEX instructor_password_reset_target_time_idx ON private.instructor_password_reset_operations USING btree (instructor_account_id, started_at DESC);

ALTER TABLE ONLY private.instructor_password_reset_operations
    ADD CONSTRAINT instructor_password_reset_operations_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY private.instructor_password_reset_operations
    ADD CONSTRAINT instructor_password_reset_operations_instructor_account_id_fkey FOREIGN KEY (instructor_account_id) REFERENCES public.accounts(id);
