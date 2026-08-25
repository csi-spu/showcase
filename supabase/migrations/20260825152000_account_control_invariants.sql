alter table public.students
  add constraint students_access_period_minimum
    check (access_ends_academic_year >= entry_year + 7) not valid;

update public.students
set access_ends_academic_year = entry_year + 7
where access_ends_academic_year < entry_year + 7;

alter table public.students
  validate constraint students_access_period_minimum;

alter table private.student_password_reset_operations
  add column attempt_number integer not null default 1 check (attempt_number > 0);
