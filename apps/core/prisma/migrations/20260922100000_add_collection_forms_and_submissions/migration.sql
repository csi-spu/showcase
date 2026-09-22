CREATE TABLE public.collection_forms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL REFERENCES public.collection_groups(id),
    title text NOT NULL CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 200),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
    fields jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields) = 'array'),
    deadline_at timestamptz,
    created_by_account_id uuid NOT NULL REFERENCES public.accounts(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    opened_at timestamptz,
    closed_at timestamptz,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE INDEX collection_forms_group_status_idx ON public.collection_forms (group_id, status, created_at DESC);

CREATE TABLE public.collection_obligations (
    form_id uuid NOT NULL REFERENCES public.collection_forms(id),
    student_account_id uuid NOT NULL REFERENCES public.accounts(id),
    status text NOT NULL DEFAULT 'not_submitted' CHECK (status IN ('not_submitted', 'awaiting_checking', 'changes_required', 'passed', 'withdrawn')),
    assigned_at timestamptz NOT NULL,
    first_submitted_at timestamptz,
    latest_submission_id uuid,
    UNIQUE (latest_submission_id),
    PRIMARY KEY (form_id, student_account_id)
);

CREATE INDEX collection_obligations_student_status_idx ON public.collection_obligations (student_account_id, status, assigned_at DESC);

CREATE TABLE private.collection_response_drafts (
    form_id uuid NOT NULL REFERENCES public.collection_forms(id),
    student_account_id uuid NOT NULL REFERENCES public.accounts(id),
    answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (form_id, student_account_id)
);

CREATE TABLE private.collection_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id uuid NOT NULL,
    student_account_id uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
    submitted_at timestamptz NOT NULL,
    UNIQUE (form_id, student_account_id, version),
    UNIQUE (form_id, student_account_id, idempotency_key),
    FOREIGN KEY (form_id, student_account_id) REFERENCES public.collection_obligations(form_id, student_account_id)
);

ALTER TABLE public.collection_obligations
    ADD CONSTRAINT collection_obligations_latest_submission_fkey
    FOREIGN KEY (latest_submission_id) REFERENCES private.collection_submissions(id);

CREATE INDEX collection_submissions_student_form_idx ON private.collection_submissions (student_account_id, form_id, submitted_at DESC);

CREATE TABLE private.collection_checking_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES private.collection_submissions(id),
    instructor_account_id uuid NOT NULL REFERENCES public.accounts(id),
    decision text NOT NULL CHECK (decision IN ('passed', 'changes_required')),
    reason text,
    occurred_at timestamptz NOT NULL,
    CHECK ((decision = 'passed' AND reason IS NULL) OR (decision = 'changes_required' AND reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 2000))
);

CREATE INDEX collection_checking_events_submission_time_idx ON private.collection_checking_events (submission_id, occurred_at DESC);
