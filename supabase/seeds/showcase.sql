-- Deterministic public showcase data for development environments.
-- Published Works intentionally omit Poster media so this seed remains Supabase-only.
begin;

set local statement_timeout = '30s';

create temporary table seed_showcase_people (
  person_id uuid primary key,
  profile_public_id uuid not null unique,
  first_name_th text not null,
  last_name_th text not null,
  bio text not null,
  entry_year smallint not null,
  study_year smallint not null
) on commit drop;

insert into seed_showcase_people values
  ('d1000000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001',
    'ณิชา', 'วัฒนากุล', 'สนใจการออกแบบประสบการณ์ผู้ใช้และการพัฒนาเว็บที่ทุกคนเข้าถึงได้', 2566, 4),
  ('d1000000-0000-4000-8000-000000000002', 'd1100000-0000-4000-8000-000000000002',
    'ภูริณัฐ', 'ศรีสวัสดิ์', 'พัฒนาระบบ IoT และซอฟต์แวร์ที่เชื่อมข้อมูลจากโลกจริงมาใช้แก้ปัญหา', 2567, 3),
  ('d1000000-0000-4000-8000-000000000003', 'd1100000-0000-4000-8000-000000000003',
    'ชนัญชิดา', 'แสงทอง', 'ศึกษาแมชชีนเลิร์นนิง การวิเคราะห์ข้อมูล และการประยุกต์ใช้ภาษาไทย', 2568, 2),
  ('d1000000-0000-4000-8000-000000000004', 'd1100000-0000-4000-8000-000000000004',
    'กิตติพงศ์', 'อินทร์แก้ว', 'สนใจซอฟต์แวร์เพื่อชุมชน ระบบแผนที่ และการทำต้นแบบกับผู้ใช้จริง', 2569, 1);

insert into public.people (id, created_at)
select person_id, '2026-08-26T08:00:00.000Z'::timestamptz from seed_showcase_people
union all
select 'd1000000-0000-4000-8000-000000000099'::uuid,
  '2026-08-26T08:00:00.000Z'::timestamptz
on conflict (id) do nothing;

insert into public.students (person_id, entry_year, access_ends_academic_year, created_at)
select person_id, entry_year, entry_year + 7, '2026-08-26T08:00:00.000Z'::timestamptz
from seed_showcase_people
on conflict (person_id) do nothing;

insert into private.person_names (person_id, first_name_th, last_name_th, created_at, updated_at)
select person_id, first_name_th, last_name_th,
  '2026-08-26T08:00:00.000Z'::timestamptz,
  '2026-08-26T08:00:00.000Z'::timestamptz
from seed_showcase_people
on conflict (person_id) do nothing;

insert into public.accounts (
  id, person_id, provider_user_id, status, credential_state, created_at, updated_at
) values (
  'd1200000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000099',
  'd1210000-0000-4000-8000-000000000001',
  'active', 'set', '2026-08-26T08:00:00.000Z', '2026-08-26T08:00:00.000Z'
)
on conflict (id) do nothing;

insert into public.account_roles (account_id, role, created_at)
values ('d1200000-0000-4000-8000-000000000001', 'admin', '2026-08-26T08:00:00.000Z')
on conflict (account_id, role) do nothing;

insert into public.public_profiles (
  person_id, public_id, bio, version, created_at, updated_at
)
select person_id, profile_public_id, bio, 2,
  '2026-08-26T08:00:00.000Z'::timestamptz,
  '2026-08-26T08:00:00.000Z'::timestamptz
from seed_showcase_people
on conflict (person_id) do nothing;

insert into public.profile_consents (person_id, consent_text_version, granted_at)
select person_id, 'phase-1', '2026-08-26T08:05:00.000Z'::timestamptz
from seed_showcase_people
on conflict do nothing;

create temporary table seed_showcase_works (
  work_id uuid primary key,
  work_public_id uuid not null unique,
  revision_id uuid not null unique,
  revision_public_id uuid not null unique,
  review_id uuid not null unique,
  review_public_id uuid not null unique,
  review_idempotency_key uuid not null unique,
  submitter_person_id uuid not null,
  attribution_name text not null,
  study_year smallint not null,
  title text not null,
  summary text not null,
  description text not null,
  category text not null,
  academic_year smallint not null,
  semester text not null,
  published_at timestamptz not null
) on commit drop;

insert into seed_showcase_works values
  ('d2000000-0000-4000-8000-000000000001', 'd2100000-0000-4000-8000-000000000001',
    'd2200000-0000-4000-8000-000000000001', 'd2300000-0000-4000-8000-000000000001',
    'd2400000-0000-4000-8000-000000000001', 'd2500000-0000-4000-8000-000000000001',
    'd2600000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
    'ณิชา วัฒนากุล', 4, 'ระบบเช็กชื่อเข้าเรียนด้วยคิวอาร์โค้ด',
    'เว็บแอปช่วยให้อาจารย์เปิดรอบเช็กชื่อและติดตามการเข้าเรียนได้จากหน้าจอเดียว',
    'ผลงานรายวิชาที่ออกแบบกระบวนการเช็กชื่อใหม่ ลดเวลาบันทึกข้อมูล และสรุปผลให้ตรวจสอบย้อนหลังได้',
    'course_work', 2569, '1', '2026-08-26T09:01:00.000Z'),
  ('d2000000-0000-4000-8000-000000000002', 'd2100000-0000-4000-8000-000000000002',
    'd2200000-0000-4000-8000-000000000002', 'd2300000-0000-4000-8000-000000000002',
    'd2400000-0000-4000-8000-000000000002', 'd2500000-0000-4000-8000-000000000002',
    'd2600000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002',
    'ภูริณัฐ ศรีสวัสดิ์', 3, 'แอปจัดตารางอ่านหนังสือแบบร่วมมือ',
    'เครื่องมือวางแผนอ่านหนังสือที่ช่วยให้เพื่อนแบ่งหัวข้อและติดตามความคืบหน้าร่วมกัน',
    'ทีมพัฒนาแอปจากโจทย์การทำงานกลุ่ม โดยทดสอบลำดับงาน การแจ้งเตือน และมุมมองความคืบหน้า',
    'course_work', 2569, '1', '2026-08-26T09:02:00.000Z'),
  ('d2000000-0000-4000-8000-000000000003', 'd2100000-0000-4000-8000-000000000003',
    'd2200000-0000-4000-8000-000000000003', 'd2300000-0000-4000-8000-000000000003',
    'd2400000-0000-4000-8000-000000000003', 'd2500000-0000-4000-8000-000000000003',
    'd2600000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003',
    'ชนัญชิดา แสงทอง', 2, 'แดชบอร์ดติดตามการใช้พลังงานในห้องเรียน',
    'แดชบอร์ดรวบรวมข้อมูลจากเซนเซอร์และแสดงช่วงเวลาที่ห้องเรียนใช้พลังงานสูง',
    'ผลงานเชื่อมข้อมูล IoT เข้ากับเว็บแดชบอร์ด เพื่อฝึกออกแบบ data pipeline และสื่อสารข้อมูล',
    'course_work', 2569, '1', '2026-08-26T09:03:00.000Z'),
  ('d2000000-0000-4000-8000-000000000004', 'd2100000-0000-4000-8000-000000000004',
    'd2200000-0000-4000-8000-000000000004', 'd2300000-0000-4000-8000-000000000004',
    'd2400000-0000-4000-8000-000000000004', 'd2500000-0000-4000-8000-000000000004',
    'd2600000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000004',
    'กิตติพงศ์ อินทร์แก้ว', 1, 'SafeRoute แผนที่เส้นทางปลอดภัย',
    'แผนที่ชุมชนที่ช่วยเลือกเส้นทางและรายงานจุดเสี่ยงระหว่างการเดินทางช่วงกลางคืน',
    'ต้นแบบการแข่งขันด้านนวัตกรรมเมือง ใช้ข้อมูลจากผู้ใช้และเกณฑ์สภาพพื้นที่เพื่อแนะนำเส้นทาง',
    'competition_entry', 2569, '2', '2026-08-26T09:04:00.000Z'),
  ('d2000000-0000-4000-8000-000000000005', 'd2100000-0000-4000-8000-000000000005',
    'd2200000-0000-4000-8000-000000000005', 'd2300000-0000-4000-8000-000000000005',
    'd2400000-0000-4000-8000-000000000005', 'd2500000-0000-4000-8000-000000000005',
    'd2600000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000002',
    'ภูริณัฐ ศรีสวัสดิ์', 3, 'FarmSense ระบบดูแลแปลงผักอัจฉริยะ',
    'ระบบวัดความชื้นและอุณหภูมิที่แจ้งเตือนเกษตรกรเมื่อแปลงผักต้องการการดูแล',
    'ผลงานแข่งขันที่ผสานไมโครคอนโทรลเลอร์ เซนเซอร์ และแอปมือถือเพื่อช่วยลดการใช้น้ำ',
    'competition_entry', 2569, '2', '2026-08-26T09:05:00.000Z'),
  ('d2000000-0000-4000-8000-000000000006', 'd2100000-0000-4000-8000-000000000006',
    'd2200000-0000-4000-8000-000000000006', 'd2300000-0000-4000-8000-000000000006',
    'd2400000-0000-4000-8000-000000000006', 'd2500000-0000-4000-8000-000000000006',
    'd2600000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000001',
    'ณิชา วัฒนากุล', 4, 'SignBridge ผู้ช่วยเรียนรู้ภาษามือเบื้องต้น',
    'เว็บต้นแบบที่ใช้กล้องช่วยตรวจท่าทางและแนะนำแบบฝึกภาษามือทีละขั้น',
    'ทีมออกแบบต้นแบบเพื่อการแข่งขันด้านเทคโนโลยีเพื่อสังคม โดยเน้นคำแนะนำที่เข้าใจง่าย',
    'competition_entry', 2569, '2', '2026-08-26T09:06:00.000Z'),
  ('d2000000-0000-4000-8000-000000000007', 'd2100000-0000-4000-8000-000000000007',
    'd2200000-0000-4000-8000-000000000007', 'd2300000-0000-4000-8000-000000000007',
    'd2400000-0000-4000-8000-000000000007', 'd2500000-0000-4000-8000-000000000007',
    'd2600000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000003',
    'ชนัญชิดา แสงทอง', 2, 'การตรวจจับข่าวปลอมภาษาไทยด้วยแบบจำลองภาษา',
    'การทดลองเปรียบเทียบวิธีจำแนกข้อความภาษาไทยและวิเคราะห์สาเหตุการตัดสินใจผิดพลาด',
    'บทความนำเสนอการเตรียมข้อมูล การทดลอง และข้อจำกัดของแบบจำลองสำหรับข้อความภาษาไทย',
    'academic_article', 2569, 'summer', '2026-08-26T09:07:00.000Z'),
  ('d2000000-0000-4000-8000-000000000008', 'd2100000-0000-4000-8000-000000000008',
    'd2200000-0000-4000-8000-000000000008', 'd2300000-0000-4000-8000-000000000008',
    'd2400000-0000-4000-8000-000000000008', 'd2500000-0000-4000-8000-000000000008',
    'd2600000-0000-4000-8000-000000000008', 'd1000000-0000-4000-8000-000000000001',
    'ณิชา วัฒนากุล', 4, 'การประเมินประสบการณ์ผู้ใช้ระบบบริการนักศึกษา',
    'การศึกษาปัญหาการใช้งานและเสนอแนวทางปรับโครงสร้างข้อมูลของระบบบริการนักศึกษา',
    'บทความรวบรวมผลทดสอบกับผู้ใช้ วิเคราะห์เส้นทางงาน และจัดลำดับข้อเสนอแนะตามผลกระทบ',
    'academic_article', 2569, 'summer', '2026-08-26T09:08:00.000Z'),
  ('d2000000-0000-4000-8000-000000000009', 'd2100000-0000-4000-8000-000000000009',
    'd2200000-0000-4000-8000-000000000009', 'd2300000-0000-4000-8000-000000000009',
    'd2400000-0000-4000-8000-000000000009', 'd2500000-0000-4000-8000-000000000009',
    'd2600000-0000-4000-8000-000000000009', 'd1000000-0000-4000-8000-000000000002',
    'ภูริณัฐ ศรีสวัสดิ์', 3, 'การวิเคราะห์คุณภาพอากาศด้วยข้อมูลเซนเซอร์ต้นทุนต่ำ',
    'การวิเคราะห์ความแม่นยำและความต่อเนื่องของข้อมูลจากเครือข่ายเซนเซอร์ภายในมหาวิทยาลัย',
    'บทความศึกษาการสอบเทียบเซนเซอร์ การจัดการข้อมูลที่ขาดหาย และการสื่อสารค่าคุณภาพอากาศ',
    'academic_article', 2569, 'summer', '2026-08-26T09:09:00.000Z');

insert into public.works (
  id, public_id, submitter_person_id, activity_state, publication_state, created_at, updated_at
)
select work_id, work_public_id, submitter_person_id, 'active', 'never_published',
  published_at - interval '7 days', published_at - interval '7 days'
from seed_showcase_works
on conflict (id) do nothing;

insert into private.work_revisions (
  id, public_id, work_id, revision_number, status, draft_version, title, summary,
  description, category, academic_year, semester, submitted_at, version
)
select revision_id, revision_public_id, work_id, 1, 'approved', 1, title, summary,
  description, category, academic_year, semester, published_at - interval '1 day', 2
from seed_showcase_works
on conflict (id) do nothing;

insert into private.work_revision_attributions (
  revision_id, position, kind, person_id, attribution_name, study_year
)
select revision_id, 1, 'submitter', submitter_person_id, attribution_name, study_year
from seed_showcase_works
on conflict (revision_id, position) do nothing;

create temporary table seed_showcase_revision_tags (
  revision_id uuid not null,
  position smallint not null,
  normalized_identity text not null,
  display_label text not null,
  primary key (revision_id, position)
) on commit drop;

insert into seed_showcase_revision_tags values
  ('d2200000-0000-4000-8000-000000000001', 1, 'web-application', 'Web Application'),
  ('d2200000-0000-4000-8000-000000000001', 2, 'education', 'Education'),
  ('d2200000-0000-4000-8000-000000000002', 1, 'web-application', 'Web Application'),
  ('d2200000-0000-4000-8000-000000000002', 2, 'collaboration', 'Collaboration'),
  ('d2200000-0000-4000-8000-000000000003', 1, 'iot', 'IoT'),
  ('d2200000-0000-4000-8000-000000000003', 2, 'data-visualization', 'Data Visualization'),
  ('d2200000-0000-4000-8000-000000000004', 1, 'maps', 'Maps'),
  ('d2200000-0000-4000-8000-000000000004', 2, 'community', 'Community'),
  ('d2200000-0000-4000-8000-000000000005', 1, 'iot', 'IoT'),
  ('d2200000-0000-4000-8000-000000000005', 2, 'agriculture', 'Agriculture'),
  ('d2200000-0000-4000-8000-000000000006', 1, 'accessibility', 'Accessibility'),
  ('d2200000-0000-4000-8000-000000000006', 2, 'computer-vision', 'Computer Vision'),
  ('d2200000-0000-4000-8000-000000000007', 1, 'machine-learning', 'Machine Learning'),
  ('d2200000-0000-4000-8000-000000000007', 2, 'thai-language', 'Thai Language'),
  ('d2200000-0000-4000-8000-000000000008', 1, 'user-experience', 'User Experience'),
  ('d2200000-0000-4000-8000-000000000008', 2, 'research', 'Research'),
  ('d2200000-0000-4000-8000-000000000009', 1, 'iot', 'IoT'),
  ('d2200000-0000-4000-8000-000000000009', 2, 'data-analysis', 'Data Analysis');

insert into private.work_revision_tags (
  revision_id, position, display_label, normalized_identity
)
select revision_id, position, display_label, normalized_identity
from seed_showcase_revision_tags
on conflict (revision_id, position) do nothing;

insert into public.tags (normalized_identity, display_label, activated_at, active_work_count)
select normalized_identity, min(display_label), '2026-08-26T08:00:00.000Z'::timestamptz, 0
from seed_showcase_revision_tags
group by normalized_identity
on conflict (normalized_identity) do nothing;

insert into private.published_revision_tags (revision_id, tag_id, position)
select seed_tag.revision_id, tag.id, seed_tag.position
from seed_showcase_revision_tags as seed_tag
join public.tags as tag on tag.normalized_identity = seed_tag.normalized_identity
on conflict (revision_id, position) do nothing;

insert into private.reviews (
  id, public_id, revision_id, actor_account_id, decision, reason, feedback,
  expected_revision_version, resulting_revision_version, idempotency_key,
  request_payload, reviewed_at
)
select review_id, review_public_id, revision_id,
  'd1200000-0000-4000-8000-000000000001'::uuid, 'approved', null, null,
  1, 2, review_idempotency_key, jsonb_build_object('source', 'development_seed'), published_at
from seed_showcase_works
on conflict (id) do nothing;

update public.works as work
set published_revision_id = seed_work.revision_id,
  publication_state = 'published', activity_state = 'active', version = 2,
  updated_at = seed_work.published_at
from seed_showcase_works as seed_work
where work.id = seed_work.work_id;

insert into private.public_work_catalog (
  work_id, revision_id, work_public_id, title, summary, description, category,
  academic_year, semester, semester_order, published_at, normalized_title,
  normalized_summary, normalized_tags, normalized_attributions,
  normalized_description, normalized_search
)
select work.id, revision.id, work.public_id, revision.title, revision.summary,
  revision.description, revision.category, revision.academic_year, revision.semester,
  case revision.semester when '1' then 1 when '2' then 2 else 3 end,
  seed_work.published_at, normalized.title, normalized.summary, normalized.tags,
  normalized.attributions, normalized.description,
  concat_ws(' ', normalized.title, normalized.summary, normalized.tags,
    normalized.attributions, normalized.description)
from seed_showcase_works as seed_work
join public.works as work on work.id = seed_work.work_id
join private.work_revisions as revision on revision.id = seed_work.revision_id
cross join lateral (
  select
    lower(regexp_replace(normalize(btrim(revision.title), NFKC), '[[:space:]]+', ' ', 'g')) as title,
    lower(regexp_replace(normalize(btrim(revision.summary), NFKC), '[[:space:]]+', ' ', 'g')) as summary,
    lower(regexp_replace(normalize(btrim(coalesce((
      select string_agg(tag.normalized_identity, ' ' order by tag.position)
      from private.work_revision_tags as tag where tag.revision_id = revision.id
    ), '')), NFKC), '[[:space:]]+', ' ', 'g')) as tags,
    lower(regexp_replace(normalize(btrim(coalesce((
      select string_agg(attribution.attribution_name, ' ' order by attribution.position)
      from private.work_revision_attributions as attribution
      where attribution.revision_id = revision.id
    ), '')), NFKC), '[[:space:]]+', ' ', 'g')) as attributions,
    lower(regexp_replace(normalize(btrim(revision.description), NFKC), '[[:space:]]+', ' ', 'g')) as description
) as normalized
on conflict (work_id) do update set
  revision_id = excluded.revision_id, work_public_id = excluded.work_public_id,
  title = excluded.title, summary = excluded.summary, description = excluded.description,
  category = excluded.category, academic_year = excluded.academic_year,
  semester = excluded.semester, semester_order = excluded.semester_order,
  published_at = excluded.published_at, normalized_title = excluded.normalized_title,
  normalized_summary = excluded.normalized_summary, normalized_tags = excluded.normalized_tags,
  normalized_attributions = excluded.normalized_attributions,
  normalized_description = excluded.normalized_description,
  normalized_search = excluded.normalized_search;

insert into private.outbox_events (
  aggregate_type, aggregate_id, event_type, payload, occurred_at
)
select 'public_profile', profile_public_id, 'public_profile_visible',
  jsonb_build_object('publicId', profile_public_id),
  '2026-08-26T08:05:00.000Z'::timestamptz
from seed_showcase_people
on conflict (aggregate_type, aggregate_id, event_type) do nothing;

insert into private.outbox_events (
  aggregate_type, aggregate_id, event_type, payload, occurred_at
)
select 'work_revision', seed_work.revision_public_id, 'work_revision_published',
  jsonb_build_object(
    'audience', 'student',
    'cacheTargets', jsonb_build_object(
      'mediaAssetIds', '[]'::jsonb,
      'tagPublicIds', coalesce((
        select jsonb_agg(tag.public_id order by published_tag.position)
        from private.published_revision_tags as published_tag
        join public.tags as tag on tag.id = published_tag.tag_id
        where published_tag.revision_id = seed_work.revision_id
      ), '[]'::jsonb),
      'workPublicId', seed_work.work_public_id
    ),
    'parameters', jsonb_build_object('revisionNumber', 1, 'title', seed_work.title),
    'recipientAccountIds', '[]'::jsonb,
    'revisionPublicId', seed_work.revision_public_id,
    'target', jsonb_build_object('kind', 'work', 'workPublicId', seed_work.work_public_id),
    'type', 'work_published'
  ), seed_work.published_at
from seed_showcase_works as seed_work
on conflict (aggregate_type, aggregate_id, event_type) do nothing;

select private.reconcile_tag_popularity();

commit;
