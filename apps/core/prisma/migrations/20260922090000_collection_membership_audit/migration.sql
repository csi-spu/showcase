CREATE TABLE private.collection_membership_audit_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    student_account_id uuid NOT NULL,
    actor_account_id uuid NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT collection_membership_audit_events_pkey PRIMARY KEY (id),
    CONSTRAINT collection_membership_audit_events_action_check CHECK (action IN ('withdrawn', 'reinstated')),
    CONSTRAINT collection_membership_audit_events_reason_check CHECK (reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 2000),
    CONSTRAINT collection_membership_audit_events_group_fkey FOREIGN KEY (group_id) REFERENCES public.collection_groups(id),
    CONSTRAINT collection_membership_audit_events_student_fkey FOREIGN KEY (student_account_id) REFERENCES public.accounts(id),
    CONSTRAINT collection_membership_audit_events_actor_fkey FOREIGN KEY (actor_account_id) REFERENCES public.accounts(id)
);

CREATE INDEX collection_membership_audit_events_target_time_idx
    ON private.collection_membership_audit_events (group_id, student_account_id, occurred_at DESC);

INSERT INTO private.collection_membership_audit_events (
    group_id, student_account_id, actor_account_id, action, reason, occurred_at
)
SELECT group_id, student_account_id, withdrawn_by_account_id, 'withdrawn', withdrawal_reason, withdrawn_at
FROM public.collection_group_memberships
WHERE status = 'withdrawn';
