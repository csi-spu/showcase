-- Repair deterministic showcase profiles created by the legacy seed before
-- Roster Name storage existed. Match only stable public profile identifiers;
-- never infer or split names from legacy free-text profile data.
with showcase_roster_names (profile_public_id, first_name_th, last_name_th) as (
  values
    ('d1100000-0000-4000-8000-000000000001'::uuid, 'ณิชา', 'วัฒนากุล'),
    ('d1100000-0000-4000-8000-000000000002'::uuid, 'ภูริณัฐ', 'ศรีสวัสดิ์'),
    ('d1100000-0000-4000-8000-000000000003'::uuid, 'ชนัญชิดา', 'แสงทอง'),
    ('d1100000-0000-4000-8000-000000000004'::uuid, 'กิตติพงศ์', 'อินทร์แก้ว')
)
insert into private.person_names (
  person_id,
  first_name_th,
  last_name_th,
  created_at,
  updated_at
)
select
  profile.person_id,
  source.first_name_th,
  source.last_name_th,
  now(),
  now()
from showcase_roster_names as source
join public.public_profiles as profile
  on profile.public_id = source.profile_public_id
on conflict (person_id) do nothing;
