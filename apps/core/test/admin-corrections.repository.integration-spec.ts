import { ConfigService } from '@nestjs/config';
import type postgres from 'postgres';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresPublicationRepository } from '../src/modules/works/infrastructure/postgres-publication.repository';
import { PostgresWorkRevisionsRepository } from '../src/modules/works/infrastructure/postgres-work-revisions.repository';

const STUDENT_PERSON_ID = id(1);
const STUDENT_ACCOUNT_ID = id(2);
const STUDENT_PROVIDER_ID = id(3);
const ADMIN_PERSON_ID = id(4);
const ADMIN_ACCOUNT_ID = id(5);
const ADMIN_PROVIDER_ID = id(6);
const WORK_ID = id(7);
const WORK_PUBLIC_ID = id(8);
const BASE_REVISION_ID = id(9);
const BASE_REVISION_PUBLIC_ID = id(10);
const POSTER_ID = id(11);
const BASE_REVIEW_ID = id(12);
const BASE_REVIEW_KEY = id(13);
const CORRECTION_KEY = id(14);
const APPROVAL_KEY = id(15);
const NOW = new Date('2026-08-26T08:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('Postgres Admin corrections integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const revisions = new PostgresWorkRevisionsRepository(database);
  const publication = new PostgresPublicationRepository(database);

  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  afterEach(cleanup);
  afterAll(() => database.onApplicationShutdown());

  it('creates one immutable audited pending Revision without changing publication or a private Draft', async () => {
    await expect(revisions.findCorrectionContext(WORK_PUBLIC_ID)).resolves.toMatchObject({
      academicRange: { currentAcademicYear: 2569, entryYear: 2566 },
      publishedRevision: {
        authorKind: 'student_submission',
        publicId: BASE_REVISION_PUBLIC_ID,
        status: 'approved',
        version: 2,
      },
    });

    const created = await revisions.createCorrection(correctionInput());
    expect(created).toMatchObject({
      outcome: 'created',
      revision: {
        authorKind: 'admin_correction',
        content: { summary: 'สรุปที่ผู้ดูแลแก้ไข' },
        media: [{ assetId: POSTER_ID, kind: 'poster' }],
        number: 2,
        status: 'pending_review',
        version: 1,
      },
    });
    if (!('revision' in created)) throw new Error('CORRECTION_NOT_CREATED');

    const [state, audit, event] = await Promise.all([
      database.sql<
        Array<{
          draft_base_id: string;
          draft_title: string;
          published_revision_id: string;
        }>
      >`
        select work.published_revision_id, draft.base_published_revision_id as draft_base_id,
          draft.title as draft_title
        from public.works as work
        join private.work_drafts as draft on draft.work_id = work.id
        where work.id = ${WORK_ID}
      `,
      database.sql<
        Array<{
          action: string;
          diff_metadata: { categories: string[]; fields: string[] };
          fingerprint_length: number;
          reason: string;
        }>
      >`
        select action, reason, diff_metadata,
          char_length(request_fingerprint)::integer as fingerprint_length
        from private.admin_correction_audits where idempotency_key = ${CORRECTION_KEY}
      `,
      database.sql<Array<{ count: number; payload: Record<string, unknown> }>>`
        select count(*) over()::integer as count, payload
        from private.outbox_events
        where aggregate_id = ${created.revision.publicId}
          and event_type = 'admin_correction_created'
      `,
    ]);
    expect(state).toEqual([
      {
        draft_base_id: BASE_REVISION_ID,
        draft_title: 'ร่างส่วนตัวที่ต้องเก็บไว้',
        published_revision_id: BASE_REVISION_ID,
      },
    ]);
    expect(audit).toEqual([
      {
        action: 'admin_correction_created',
        diff_metadata: { categories: ['content'], fields: ['summary'] },
        fingerprint_length: 64,
        reason: 'แก้ไขข้อความสรุปที่คลาดเคลื่อน',
      },
    ]);
    expect(event[0]).toMatchObject({
      count: 1,
      payload: {
        audience: 'student',
        recipientAccountIds: [STUDENT_ACCOUNT_ID],
        type: 'admin_correction_created',
      },
    });
    expect(JSON.stringify({ audit, event })).not.toMatch(/studentId|token|credential/i);

    await expect(revisions.createCorrection(correctionInput())).resolves.toMatchObject({
      outcome: 'replayed',
      revision: { publicId: created.revision.publicId },
    });
    await expect(
      database.sql`update private.work_revisions set title = 'แก้ย้อนหลัง'
        where public_id = ${created.revision.publicId}`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.sql`update private.admin_correction_audits set reason = 'แก้ย้อนหลังไม่ได้'
        where idempotency_key = ${CORRECTION_KEY}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('serializes equivalent concurrent retries into one audit and one event', async () => {
    const results = await Promise.all([
      revisions.createCorrection(correctionInput()),
      revisions.createCorrection(correctionInput()),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual(['created', 'replayed']);
    const counts = await database.sql<Array<{ audits: number; events: number }>>`
      select
        (select count(*)::integer from private.admin_correction_audits
          where work_id = ${WORK_ID}) as audits,
        (select count(*)::integer from private.outbox_events
          where event_type = 'admin_correction_created'
            and aggregate_id in (
              select public_id from private.work_revisions where work_id = ${WORK_ID}
            )) as events
    `;
    expect(counts).toEqual([{ audits: 1, events: 1 }]);
  });

  it('rejects stale, conflicting, archived, and already-pending correction commands', async () => {
    await expect(
      revisions.createCorrection(
        correctionInput({ expectedPublishedRevisionId: id(20), idempotencyKey: id(21) }),
      ),
    ).resolves.toEqual({ outcome: 'base_revision_conflict' });
    await expect(
      revisions.createCorrection(
        correctionInput({ expectedRevisionVersion: 1, idempotencyKey: id(22) }),
      ),
    ).resolves.toEqual({ outcome: 'revision_version_conflict' });

    await revisions.createCorrection(correctionInput());
    await expect(
      revisions.createCorrection(correctionInput({ idempotencyKey: id(23) })),
    ).resolves.toEqual({ outcome: 'pending_revision_exists' });
    await expect(
      revisions.createCorrection(
        correctionInput({ idempotencyKey: CORRECTION_KEY, reason: 'เหตุผลอื่นที่ไม่ตรงคำขอเดิม' }),
      ),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });

    await database.sql.begin(async (transaction) => {
      await transaction`set local session_replication_role = replica`;
      await transaction`delete from private.admin_correction_audits where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_revision_attributions
        where revision_id in (select id from private.work_revisions where work_id = ${WORK_ID} and revision_number = 2)`;
      await transaction`delete from private.work_revision_media
        where revision_id in (select id from private.work_revisions where work_id = ${WORK_ID} and revision_number = 2)`;
      await transaction`delete from private.work_revisions where work_id = ${WORK_ID} and revision_number = 2`;
      await transaction`update public.works set activity_state = 'archived' where id = ${WORK_ID}`;
    });
    await expect(
      revisions.createCorrection(correctionInput({ idempotencyKey: id(24) })),
    ).resolves.toEqual({ outcome: 'work_state_conflict' });
  });

  it('requires a later explicit approval and leaves the Student Draft stale after publication', async () => {
    const before = await publication.findPublicWork(WORK_PUBLIC_ID);
    const created = await revisions.createCorrection(correctionInput());
    if (!('revision' in created)) throw new Error('CORRECTION_NOT_CREATED');
    await expect(publication.findPublicWork(WORK_PUBLIC_ID)).resolves.toEqual(before);

    await expect(
      publication.approveAndPublish({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedRevisionVersion: 1,
        idempotencyKey: APPROVAL_KEY,
        now: new Date(NOW.getTime() + 2_000),
        revisionPublicId: created.revision.publicId,
      }),
    ).resolves.toMatchObject({ outcome: 'published' });
    await expect(publication.findPublicWork(WORK_PUBLIC_ID)).resolves.toMatchObject({
      revisionNumber: 2,
      summary: 'สรุปที่ผู้ดูแลแก้ไข',
    });
    const draft = await database.sql<Array<{ base_published_revision_id: string }>>`
      select base_published_revision_id from private.work_drafts where work_id = ${WORK_ID}
    `;
    expect(draft).toEqual([{ base_published_revision_id: BASE_REVISION_ID }]);
  });

  async function seed(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values (${STUDENT_PERSON_ID}), (${ADMIN_PERSON_ID})`;
      await transaction`insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${STUDENT_PERSON_ID}, 2566, 2573)`;
      await transaction`insert into public.accounts (
        id, person_id, provider_user_id, credential_state
      ) values
        (${STUDENT_ACCOUNT_ID}, ${STUDENT_PERSON_ID}, ${STUDENT_PROVIDER_ID}, 'set'),
        (${ADMIN_ACCOUNT_ID}, ${ADMIN_PERSON_ID}, ${ADMIN_PROVIDER_ID}, 'set')`;
      await transaction`insert into public.account_roles (account_id, role) values
        (${STUDENT_ACCOUNT_ID}, 'student'), (${ADMIN_ACCOUNT_ID}, 'admin')`;
      await transaction`update public.academic_settings
        set current_academic_year = 2569, updated_at = ${NOW} where singleton = true`;
      await transaction`insert into public.works (
        id, public_id, submitter_person_id, activity_state, publication_state, created_at, updated_at
      ) values (${WORK_ID}, ${WORK_PUBLIC_ID}, ${STUDENT_PERSON_ID}, 'active', 'published', ${NOW}, ${NOW})`;
      await transaction`insert into private.work_revisions (
        id, public_id, work_id, revision_number, status, draft_version, title, summary,
        description, category, academic_year, semester, submitted_at, version
      ) values (
        ${BASE_REVISION_ID}, ${BASE_REVISION_PUBLIC_ID}, ${WORK_ID}, 1, 'approved', 1,
        'ชื่อผลงานเดิม', 'สรุปเดิม', 'รายละเอียดเดิม', 'course_work', 2569, '1', ${NOW}, 2
      )`;
      await transaction`update public.works set published_revision_id = ${BASE_REVISION_ID}
        where id = ${WORK_ID}`;
      await transaction`insert into private.work_revision_attributions (
        revision_id, position, kind, person_id, attribution_name, study_year
      ) values (${BASE_REVISION_ID}, 1, 'submitter', ${STUDENT_PERSON_ID}, 'ชื่อผู้ส่ง', 2)`;
      await seedPoster(transaction);
      await transaction`insert into private.reviews (
        id, revision_id, actor_account_id, decision, reason, feedback,
        expected_revision_version, resulting_revision_version, idempotency_key,
        request_payload, reviewed_at
      ) values (
        ${BASE_REVIEW_ID}, ${BASE_REVISION_ID}, ${ADMIN_ACCOUNT_ID}, 'approved', null, null,
        1, 2, ${BASE_REVIEW_KEY}, '{}'::jsonb, ${NOW}
      )`;
      await transaction`insert into private.work_drafts (
        work_id, base_published_revision_id, title, summary, description, category,
        academic_year, semester, version, created_at, updated_at
      ) values (
        ${WORK_ID}, ${BASE_REVISION_ID}, 'ร่างส่วนตัวที่ต้องเก็บไว้', 'สรุปร่าง',
        'รายละเอียดร่าง', 'course_work', 2569, '1', 1, ${NOW}, ${NOW}
      )`;
    });
  }

  async function seedPoster(transaction: postgres.TransactionSql): Promise<void> {
    await transaction`insert into private.work_media_assets (
      id, work_id, media_kind, status, quarantine_object_key, authorize_idempotency_key,
      master_object_key, declared_content_type, declared_extension, declared_byte_size,
      inspected_byte_size, width, height, content_hash, dominant_color,
      created_at, updated_at, expires_at
    ) values (
      ${POSTER_ID}, ${WORK_ID}, 'poster', 'ready', ${`quarantine/${POSTER_ID}`}, ${POSTER_ID},
      ${`media/${POSTER_ID}/master.webp`}, 'image/jpeg', 'jpg', 1024, 512, 1200, 1800,
      ${Buffer.alloc(32, 1)}, '#285078', ${NOW}, ${NOW}, ${new Date('2026-09-01T00:00:00Z')}
    )`;
    await transaction`insert into private.work_revision_media (
      revision_id, media_kind, position, asset_id
    ) values (${BASE_REVISION_ID}, 'poster', 1, ${POSTER_ID})`;
  }

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`set local session_replication_role = replica`;
      await transaction`delete from private.outbox_events where aggregate_type = 'work_revision'
        and aggregate_id in (
          select public_id from private.work_revisions where work_id = ${WORK_ID}
        )`;
      await transaction`delete from private.admin_correction_audits where work_id = ${WORK_ID}`;
      await transaction`delete from private.published_revision_tags where revision_id in (
        select id from private.work_revisions where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.reviews where revision_id in (
        select id from private.work_revisions where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.work_revision_attributions where revision_id in (
        select id from private.work_revisions where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.work_revision_media where revision_id in (
        select id from private.work_revisions where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.work_revision_video_links where revision_id in (
        select id from private.work_revisions where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.work_revision_tags where revision_id in (
        select id from private.work_revisions where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.work_revision_links where revision_id in (
        select id from private.work_revisions where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.work_draft_media where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_video_links where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_tags where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_links where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_drafts where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_revisions where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_media_variants where asset_id = ${POSTER_ID}`;
      await transaction`delete from private.work_media_assets where id = ${POSTER_ID}`;
      await transaction`delete from public.works where id = ${WORK_ID}`;
      await transaction`delete from public.account_roles where account_id in (${STUDENT_ACCOUNT_ID}, ${ADMIN_ACCOUNT_ID})`;
      await transaction`delete from public.accounts where id in (${STUDENT_ACCOUNT_ID}, ${ADMIN_ACCOUNT_ID})`;
      await transaction`delete from public.students where person_id = ${STUDENT_PERSON_ID}`;
      await transaction`delete from public.people where id in (${STUDENT_PERSON_ID}, ${ADMIN_PERSON_ID})`;
    });
  }
});

function correctionInput(
  overrides: Partial<Parameters<PostgresWorkRevisionsRepository['createCorrection']>[0]> = {},
) {
  return {
    actorAccountId: ADMIN_ACCOUNT_ID,
    candidate: {
      academicPeriod: { semester: '1' as const, year: 2569 },
      category: 'course_work' as const,
      description: 'รายละเอียดเดิม',
      links: [],
      summary: 'สรุปที่ผู้ดูแลแก้ไข',
      tags: [],
      title: 'ชื่อผลงานเดิม',
      videoLinks: [],
    },
    diff: { categories: ['content' as const], fields: ['summary'] },
    expectedPublishedRevisionId: BASE_REVISION_PUBLIC_ID,
    expectedRevisionVersion: 2,
    idempotencyKey: CORRECTION_KEY,
    now: new Date(NOW.getTime() + 1_000),
    reason: 'แก้ไขข้อความสรุปที่คลาดเคลื่อน',
    workPublicId: WORK_PUBLIC_ID,
    ...overrides,
  };
}

function id(value: number): string {
  return `91000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}
