ALTER TABLE public.collection_obligations ADD COLUMN status_before_withdrawal text;
ALTER TABLE public.collection_obligations ADD CONSTRAINT collection_obligations_prior_status_check
  CHECK (status_before_withdrawal IS NULL OR status_before_withdrawal IN ('not_submitted', 'awaiting_checking', 'changes_required', 'passed'));
