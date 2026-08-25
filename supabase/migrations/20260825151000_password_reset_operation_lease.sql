alter table private.student_password_reset_operations
  add column lease_until timestamptz;

update private.student_password_reset_operations
set lease_until = started_at + interval '90 seconds'
where status = 'pending';

alter table private.student_password_reset_operations
  add constraint student_password_reset_operation_lease_valid check (
    (status = 'pending' and lease_until is not null)
    or (status in ('provider_failed', 'completed') and lease_until is null)
  );
