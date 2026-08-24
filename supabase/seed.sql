-- Keep development seed data deterministic and non-sensitive.
insert into public.academic_settings (singleton, current_academic_year)
values (true, 2569)
on conflict (singleton) do update
set current_academic_year = excluded.current_academic_year,
    updated_at = now();
