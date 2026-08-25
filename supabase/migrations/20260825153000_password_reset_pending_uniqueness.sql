create unique index student_password_reset_one_pending_per_account_idx
  on private.student_password_reset_operations (student_account_id)
  where status = 'pending';
