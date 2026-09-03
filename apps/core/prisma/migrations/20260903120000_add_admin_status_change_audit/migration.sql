-- Admin Account status changes (suspend/reactivate) need their own idempotency-keyed
-- audit trail, mirroring private.student_access_extension_audit_events. The
-- accounts.status column already supports 'active'/'suspended' for every Account;
-- this migration only adds the audit table for the Admin-facing mutation.

CREATE TABLE private.admin_status_change_audit_events (
    id bigint NOT NULL,
    idempotency_key uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    admin_account_id uuid NOT NULL,
    previous_status text NOT NULL,
    status text NOT NULL,
    reason text NOT NULL,
    expected_version integer NOT NULL,
    resulting_version integer NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT admin_status_change_audit_events_check CHECK ((resulting_version > expected_version)),
    CONSTRAINT admin_status_change_audit_events_expected_version_check CHECK ((expected_version > 0)),
    CONSTRAINT admin_status_change_audit_events_previous_status_check CHECK ((previous_status = ANY (ARRAY['active'::text, 'suspended'::text]))),
    CONSTRAINT admin_status_change_audit_events_reason_check CHECK (((reason = btrim(reason)) AND ((char_length(reason) >= 1) AND (char_length(reason) <= 2000)))),
    CONSTRAINT admin_status_change_audit_events_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text]))),
    CONSTRAINT admin_status_change_audit_events_transition_check CHECK ((previous_status <> status))
);

ALTER TABLE private.admin_status_change_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.admin_status_change_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY private.admin_status_change_audit_events
    ADD CONSTRAINT admin_status_change_audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY private.admin_status_change_audit_events
    ADD CONSTRAINT admin_status_change_audit_events_idempotency_key_key UNIQUE (idempotency_key);

CREATE INDEX admin_status_change_target_time_idx ON private.admin_status_change_audit_events USING btree (admin_account_id, occurred_at DESC);

ALTER TABLE ONLY private.admin_status_change_audit_events
    ADD CONSTRAINT admin_status_change_audit_events_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY private.admin_status_change_audit_events
    ADD CONSTRAINT admin_status_change_audit_events_admin_account_id_fkey FOREIGN KEY (admin_account_id) REFERENCES public.accounts(id);
