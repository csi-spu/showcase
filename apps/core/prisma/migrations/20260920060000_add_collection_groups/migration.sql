-- Issue #112 J2: Instructor-managed collection groups. A group belongs to a
-- round; Students are added to a group by existing Student ID, an Entry Year
-- snapshot, or individually. No new Accounts are ever created by this
-- feature -- only existing Student Accounts can become members. This
-- migration only adds group/membership structure; forms, obligations, and
-- submissions are separate, later migrations.

CREATE TABLE public.collection_rounds (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_by_account_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT collection_rounds_pkey PRIMARY KEY (id),
    CONSTRAINT collection_rounds_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text]))),
    CONSTRAINT collection_rounds_name_check CHECK (((name = btrim(name)) AND (char_length(name) >= 1) AND (char_length(name) <= 200)))
);

ALTER TABLE ONLY public.collection_rounds
    ADD CONSTRAINT collection_rounds_created_by_account_id_fkey FOREIGN KEY (created_by_account_id) REFERENCES public.accounts(id);

CREATE INDEX collection_rounds_created_at_idx ON public.collection_rounds USING btree (created_at DESC);

CREATE TABLE public.collection_groups (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    round_id uuid NOT NULL,
    name text NOT NULL,
    created_by_account_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT collection_groups_pkey PRIMARY KEY (id),
    CONSTRAINT collection_groups_name_check CHECK (((name = btrim(name)) AND (char_length(name) >= 1) AND (char_length(name) <= 200)))
);

ALTER TABLE ONLY public.collection_groups
    ADD CONSTRAINT collection_groups_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.collection_rounds(id);

ALTER TABLE ONLY public.collection_groups
    ADD CONSTRAINT collection_groups_created_by_account_id_fkey FOREIGN KEY (created_by_account_id) REFERENCES public.accounts(id);

CREATE INDEX collection_groups_round_id_idx ON public.collection_groups USING btree (round_id, created_at DESC);

CREATE TABLE public.collection_group_memberships (
    group_id uuid NOT NULL,
    student_account_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'current',
    membership_source text NOT NULL,
    added_by_account_id uuid NOT NULL,
    added_at timestamp with time zone NOT NULL DEFAULT now(),
    withdrawn_by_account_id uuid,
    withdrawn_at timestamp with time zone,
    withdrawal_reason text,
    CONSTRAINT collection_group_memberships_pkey PRIMARY KEY (group_id, student_account_id),
    CONSTRAINT collection_group_memberships_status_check CHECK ((status = ANY (ARRAY['current'::text, 'withdrawn'::text]))),
    CONSTRAINT collection_group_memberships_source_check CHECK ((membership_source = ANY (ARRAY['student_id_list'::text, 'entry_year'::text, 'individual'::text]))),
    CONSTRAINT collection_group_memberships_withdrawal_reason_check CHECK (((withdrawal_reason IS NULL) OR ((withdrawal_reason = btrim(withdrawal_reason)) AND (char_length(withdrawal_reason) >= 1) AND (char_length(withdrawal_reason) <= 2000)))),
    CONSTRAINT collection_group_memberships_withdrawal_complete CHECK ((((status = 'current'::text) AND (withdrawn_at IS NULL) AND (withdrawn_by_account_id IS NULL) AND (withdrawal_reason IS NULL)) OR ((status = 'withdrawn'::text) AND (withdrawn_at IS NOT NULL) AND (withdrawn_by_account_id IS NOT NULL) AND (withdrawal_reason IS NOT NULL))))
);

ALTER TABLE ONLY public.collection_group_memberships
    ADD CONSTRAINT collection_group_memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.collection_groups(id);

ALTER TABLE ONLY public.collection_group_memberships
    ADD CONSTRAINT collection_group_memberships_student_account_id_fkey FOREIGN KEY (student_account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY public.collection_group_memberships
    ADD CONSTRAINT collection_group_memberships_added_by_account_id_fkey FOREIGN KEY (added_by_account_id) REFERENCES public.accounts(id);

ALTER TABLE ONLY public.collection_group_memberships
    ADD CONSTRAINT collection_group_memberships_withdrawn_by_account_id_fkey FOREIGN KEY (withdrawn_by_account_id) REFERENCES public.accounts(id);

CREATE INDEX collection_group_memberships_student_idx ON public.collection_group_memberships USING btree (student_account_id);

CREATE INDEX collection_group_memberships_group_status_idx ON public.collection_group_memberships USING btree (group_id, status);
