import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresReviewsRepository } from '../src/modules/works/infrastructure/postgres-reviews.repository';

const STUDENT_PERSON_ID = '76000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT_ID = '76000000-0000-4000-8000-000000000002';
const STUDENT_PROVIDER_ID = '76000000-0000-4000-8000-000000000003';
const ADMIN_PERSON_ID = '76000000-0000-4000-8000-000000000004';
const ADMIN_ACCOUNT_ID = '76000000-0000-4000-8000-000000000005';
const ADMIN_PROVIDER_ID = '76000000-0000-4000-8000-000000000006';
const WORK_ID = '76000000-0000-4000-8000-000000000007';
const WORK_PUBLIC_ID = '76000000-0000-4000-8000-000000000008';
const REVISION_ID = '76000000-0000-4000-8000-000000000009';
const REVISION_PUBLIC_ID = '76000000-0000-4000-8000-000000000010';
const IDEMPOTENCY_KEY = '76000000-0000-4000-8000-000000000011';
const OTHER_KEY = '76000000-0000-4000-8000-000000000012';
const POSTER_ID = '76000000-0000-4000-8000-000000000013';
const NOW = new Date('2026-08-25T16:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresReviewsRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresReviewsRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`
        insert into public.people (id) values (${STUDENT_PERSON_ID}), (${ADMIN_PERSON_ID})
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${STUDENT_PERSON_ID}, 2566, 2573)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state) values
          (${STUDENT_ACCOUNT_ID}, ${STUDENT_PERSON_ID}, ${STUDENT_PROVIDER_ID}, 'set'),
          (${ADMIN_ACCOUNT_ID}, ${ADMIN_PERSON_ID}, ${ADMIN_PROVIDER_ID}, 'set')
      `;
      await transaction`
        insert into public.account_roles (account_id, role)
        values (${STUDENT_ACCOUNT_ID}, 'student'), (${ADMIN_ACCOUNT_ID}, 'admin')
      `;
      await transaction`
        insert into public.works (
          id, public_id, submitter_person_id, activity_state, publication_state, created_at, updated_at
        ) values (
          ${WORK_ID}, ${WORK_PUBLIC_ID}, ${STUDENT_PERSON_ID}, 'active', 'never_published',
          ${NOW}, ${NOW}
        )
      `;
      await transaction`
        insert into private.work_revisions (
          id, public_id, work_id, revision_number, status, draft_version, title, summary,
          description, category, academic_year, semester, submitted_at, version
        ) values (
          ${REVISION_ID}, ${REVISION_PUBLIC_ID}, ${WORK_ID}, 1, 'pending_review', 3,
          'ระบบแนะนำผลงาน', 'สรุปผลงาน', 'รายละเอียดผลงาน', 'course_work', 2569, '1',
          ${NOW}, 1
        )
      `;
      await transaction`
        insert into private.work_revision_attributions (
          revision_id, position, kind, person_id, attribution_name, study_year
        ) values (${REVISION_ID}, 1, 'submitter', ${STUDENT_PERSON_ID}, 'ชื่อผู้ส่ง', 2)
      `;
      await transaction`
        insert into private.work_media_assets (
          id, work_id, media_kind, status, quarantine_object_key, authorize_idempotency_key,
          master_object_key, declared_content_type, declared_extension, declared_byte_size,
          inspected_byte_size, width, height, content_hash, dominant_color,
          created_at, updated_at, expires_at
        ) values (
          ${POSTER_ID}, ${WORK_ID}, 'poster', 'ready', ${`quarantine/${POSTER_ID}`},
          ${POSTER_ID}, ${`media/${POSTER_ID}/master.webp`}, 'image/jpeg', 'jpg', 1024,
          512, 1200, 1800, ${Buffer.alloc(32, 1)}, '#285078', ${NOW}, ${NOW},
          ${new Date('2026-09-01T16:00:00.000Z')}
        )
      `;
      await transaction`
        insert into private.work_revision_media (revision_id, media_kind, position, asset_id)
        values (${REVISION_ID}, 'poster', 1, ${POSTER_ID})
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('makes the first optimistic decision win and replays equivalent retries atomically', async () => {
    await expect(
      repository.findRevisionMediaObject(REVISION_PUBLIC_ID, POSTER_ID),
    ).resolves.toEqual({ assetId: POSTER_ID, masterObjectKey: `media/${POSTER_ID}/master.webp` });
    await expect(repository.requestChanges(input({ expectedRevisionVersion: 2 }))).resolves.toEqual(
      { outcome: 'revision_version_conflict' },
    );

    const firstInput = input();
    const secondInput = input({ idempotencyKey: OTHER_KEY });
    const competing = await Promise.all([
      repository.requestChanges(firstInput),
      repository.requestChanges(secondInput),
    ]);
    expect(competing.map((result) => result.outcome).sort()).toEqual([
      'changed_requested',
      'revision_state_conflict',
    ]);
    const created = competing.find((result) => 'review' in result);
    const winningInput = competing[0]?.outcome === 'changed_requested' ? firstInput : secondInput;
    expect(created).toMatchObject({
      review: {
        decision: 'changes_requested',
        feedback: 'กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน',
        reason: 'content',
        revisionPublicId: REVISION_PUBLIC_ID,
        workPublicId: WORK_PUBLIC_ID,
      },
    });

    await expect(
      repository.requestChanges({
        ...winningInput,
        feedback: 'กรุณาแก้ไขหัวข้อให้ชัดเจนยิ่งขึ้น',
      }),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });
    await expect(repository.requestChanges(winningInput)).resolves.toMatchObject({
      outcome: 'replayed',
    });

    await expect(
      repository.findLatestChangeRequestForSubmitter(STUDENT_ACCOUNT_ID, WORK_PUBLIC_ID),
    ).resolves.toMatchObject({ feedback: 'กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน' });
    await expect(
      repository.findLatestChangeRequestForSubmitter(ADMIN_ACCOUNT_ID, WORK_PUBLIC_ID),
    ).resolves.toBeNull();

    const state = await database.sql<
      Array<{
        draft_count: number;
        event_count: number;
        event_payload: Record<string, unknown>;
        published_revision_id: string | null;
        review_count: number;
        revision_status: string;
        revision_version: string;
      }>
    >`
      select work.published_revision_id, revision.status as revision_status,
        revision.version as revision_version,
        (select count(*)::integer from private.work_drafts where work_id = work.id) as draft_count,
        (select count(*)::integer from private.reviews where revision_id = revision.id) as review_count,
        (select count(*)::integer from private.outbox_events
          where aggregate_type = 'work_revision' and aggregate_id = revision.public_id
            and event_type = 'work_revision_changes_requested') as event_count,
        (select payload from private.outbox_events
          where aggregate_type = 'work_revision' and aggregate_id = revision.public_id
            and event_type = 'work_revision_changes_requested') as event_payload
      from public.works as work
      join private.work_revisions as revision on revision.work_id = work.id
      where work.id = ${WORK_ID}
    `;
    expect(state).toMatchObject([
      {
        draft_count: 1,
        event_count: 1,
        published_revision_id: null,
        review_count: 1,
        revision_status: 'changes_requested',
        revision_version: '2',
      },
    ]);
    expect(JSON.stringify(state[0]?.event_payload)).not.toContain(
      'กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน',
    );
    await expect(
      repository.findRevisionMediaObject(REVISION_PUBLIC_ID, POSTER_ID),
    ).resolves.toBeNull();

    await expect(
      database.sql`update private.reviews set feedback = 'แก้ประวัติการตรวจสอบ' where revision_id = ${REVISION_ID}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`set local session_replication_role = replica`;
      await transaction`delete from private.outbox_events where aggregate_type = 'work_revision' and aggregate_id = ${REVISION_PUBLIC_ID}`;
      await transaction`delete from private.reviews where revision_id = ${REVISION_ID}`;
      await transaction`delete from private.work_draft_media where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_video_links where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_tags where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_links where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_drafts where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_revision_attributions where revision_id = ${REVISION_ID}`;
      await transaction`delete from private.work_revision_media where revision_id = ${REVISION_ID}`;
      await transaction`delete from private.work_revisions where id = ${REVISION_ID}`;
      await transaction`delete from private.work_media_assets where id = ${POSTER_ID}`;
      await transaction`delete from public.works where id = ${WORK_ID}`;
      await transaction`delete from public.account_roles where account_id in (${STUDENT_ACCOUNT_ID}, ${ADMIN_ACCOUNT_ID})`;
      await transaction`delete from public.accounts where id in (${STUDENT_ACCOUNT_ID}, ${ADMIN_ACCOUNT_ID})`;
      await transaction`delete from public.students where person_id = ${STUDENT_PERSON_ID}`;
      await transaction`delete from public.people where id in (${STUDENT_PERSON_ID}, ${ADMIN_PERSON_ID})`;
    });
  }
});

function input(
  overrides: Partial<Parameters<PostgresReviewsRepository['requestChanges']>[0]> = {},
) {
  return {
    actorAccountId: ADMIN_ACCOUNT_ID,
    expectedRevisionVersion: 1,
    feedback: 'กรุณาเพิ่มแหล่งอ้างอิงในรายละเอียดผลงาน',
    idempotencyKey: IDEMPOTENCY_KEY,
    now: new Date(NOW.getTime() + 1_000),
    reason: 'content' as const,
    revisionPublicId: REVISION_PUBLIC_ID,
    ...overrides,
  };
}
