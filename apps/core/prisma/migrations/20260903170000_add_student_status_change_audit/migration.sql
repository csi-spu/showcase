-- Suspending a Student is an audited Account Controls operation, so every
-- transition records its actor, reason, and the versions it moved between.
-- Student status itself already lives on public.accounts.status, which student
-- login and session validation enforce; only the audit trail is new.

CREATE TABLE private.student_status_change_audit_events (
    id bigint NOT NULL,
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    student_account_id uuid NOT NULL,
    previous_status text NOT NULL,
    status text NOT NULL,
    reason text NOT NULL,
    expected_version integer NOT NULL,
    resulting_version integer NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT student_status_change_audit_events_check CHECK ((resulting_version > expected_version)),
    CONSTRAINT student_status_change_audit_events_expected_version_check CHECK ((expected_version > 0)),
    CONSTRAINT student_status_change_audit_events_previous_status_check CHECK ((previous_status = ANY (ARRAY['active'::text, 'suspended'::text]))),
    CONSTRAINT student_status_change_audit_events_reason_check CHECK (((reason = btrim(reason)) AND ((char_length(reason) >= 1) AND (char_length(reason) <= 2000)))),
    CONSTRAINT student_status_change_audit_events_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text]))),
    CONSTRAINT student_status_change_audit_events_transition_check CHECK ((previous_status <> status))
);

ALTER TABLE private.student_status_change_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.student_status_change_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY private.student_status_change_audit_events
    ADD CONSTRAINT student_status_change_audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY private.student_status_change_audit_events
    ADD CONSTRAINT student_status_change_audit_events_idempotency_key_key UNIQUE (idempotency_key);

CREATE INDEX student_status_change_target_time_idx ON private.student_status_change_audit_events USING btree (student_account_id, occurred_at DESC);

ALTER TABLE ONLY private.student_status_change_audit_events
    ADD CONSTRAINT student_status_change_audit_events_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY private.student_status_change_audit_events
    ADD CONSTRAINT student_status_change_audit_events_student_account_id_fkey FOREIGN KEY (student_account_id) REFERENCES public.accounts(id);
