import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresPublicationRepository } from '../src/modules/works/infrastructure/postgres-publication.repository';
import { PostgresReviewsRepository } from '../src/modules/works/infrastructure/postgres-reviews.repository';
import { PostgresWorkRevisionsRepository } from '../src/modules/works/infrastructure/postgres-work-revisions.repository';
import { PostgresWorksRepository } from '../src/modules/works/infrastructure/postgres-works.repository';

const PERSON = '74000000-0000-4000-8000-000000000001';
const ACCOUNT = '74000000-0000-4000-8000-000000000002';
const PROVIDER = '74000000-0000-4000-8000-000000000003';
const ADMIN_PERSON = '74000000-0000-4000-8000-000000000004';
const ADMIN = '74000000-0000-4000-8000-000000000005';
const ADMIN_PROVIDER = '74000000-0000-4000-8000-000000000006';
const WORK = '74000000-0000-4000-8000-000000000007';
const WORK_PUBLIC = '74000000-0000-4000-8000-000000000008';
const POSTER = '74000000-0000-4000-8000-000000000009';
const TAG_ALPHA = 'issue-73-74000000-alpha';
const TAG_BETA = 'issue-73-74000000-beta';
const TAG_GAMMA = 'issue-73-74000000-gamma';
const NOW = new Date('2026-08-25T20:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('real Postgres re-review chain', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const revisions = new PostgresWorkRevisionsRepository(database);
  const publication = new PostgresPublicationRepository(database);
  const reviews = new PostgresReviewsRepository(database);
  const works = new PostgresWorksRepository(database);
  let previousAcademicYear: number | null | undefined;

  beforeAll(async () => {
    await cleanup();
    const settings = await database.sql<Array<{ current_academic_year: number | null }>>`
      select current_academic_year from public.academic_settings where singleton = true
    `;
    previousAcademicYear = settings[0]?.current_academic_year;
    await database.sql.begin(async (tx) => {
      await tx`insert into public.people (id) values (${PERSON}), (${ADMIN_PERSON})`;
      await tx`insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${PERSON}, 2566, 2573)`;
      await tx`insert into public.accounts (id, person_id, provider_user_id, credential_state)
        values (${ACCOUNT}, ${PERSON}, ${PROVIDER}, 'set'),
          (${ADMIN}, ${ADMIN_PERSON}, ${ADMIN_PROVIDER}, 'set')`;
      await tx`insert into public.account_roles (account_id, role)
        values (${ACCOUNT}, 'student'), (${ADMIN}, 'admin')`;
      await tx`insert into private.person_names (person_id, first_name_th, last_name_th)
        values (${PERSON}, 'ผู้ส่ง', 'สายทดสอบ')`;
      await tx`insert into public.works (id, public_id, submitter_person_id, activity_state,
        publication_state, created_at, updated_at)
        values (${WORK}, ${WORK_PUBLIC}, ${PERSON}, 'active', 'never_published', ${NOW}, ${NOW})`;
      await tx`insert into private.work_drafts (work_id, title, summary, description, category,
        academic_year, semester, submitter_study_year, version, created_at, updated_at)
        values (${WORK}, 'ฉบับหนึ่ง', 'สรุปหนึ่ง', 'รายละเอียดหนึ่ง', 'course_work',
          2569, '1', 2, 1, ${NOW}, ${NOW})`;
      await tx`insert into private.work_draft_links (work_id, position, label, url)
        values (${WORK}, 1, 'ต้นฉบับ', 'https://example.com/one')`;
      await tx`insert into private.work_draft_tags (work_id, position, display_label, normalized_identity)
        values (${WORK}, 1, 'Alpha', 'alpha')`;
      await tx`insert into private.work_draft_video_links
        (work_id, position, provider, provider_video_id, url)
        values (${WORK}, 1, 'youtube', 'abc12345678', 'https://www.youtube.com/watch?v=abc12345678')`;
      await tx`insert into private.work_media_assets (id, work_id, media_kind, status,
        quarantine_object_key, authorize_idempotency_key, master_object_key,
        declared_content_type, declared_extension, declared_byte_size, inspected_byte_size,
        width, height, content_hash, dominant_color, created_at, updated_at, expires_at)
        values (${POSTER}, ${WORK}, 'poster', 'ready', ${`quarantine/${POSTER}`}, ${POSTER},
          ${`media/${POSTER}/master.webp`}, 'image/jpeg', 'jpg', 1024, 512, 1200, 1800,
          ${Buffer.alloc(32, 7)}, '#315A7D', ${NOW}, ${NOW}, ${new Date('2026-09-01T20:00:00Z')})`;
      await tx`insert into private.work_media_variants
        (asset_id, width, height, byte_size, content_hash, object_key)
        values (${POSTER}, 480, 720, 256, ${Buffer.alloc(32, 8)}, ${`media/${POSTER}/480.webp`})`;
      await tx`insert into private.work_draft_media (work_id, media_kind, position, asset_id, created_at)
        values (${WORK}, 'poster', 1, ${POSTER}, ${NOW})`;
      await tx`update public.academic_settings set current_academic_year = 2569, updated_at = ${NOW}
        where singleton = true`;
    });
  });

  afterAll(async () => {
    await cleanup();
    if (previousAcademicYear !== undefined) {
      await database.sql`
        update public.academic_settings set current_academic_year = ${previousAcademicYear}
        where singleton = true
      `;
    }
    await database.onApplicationShutdown();
  });

  it('preserves immutable public history through a changes-requested correction', async () => {
    const first = await revisions.submitRevision({
      actorAccountId: ACCOUNT,
      draft: draft('ฉบับหนึ่ง', 'Alpha', TAG_ALPHA, 'https://example.com/one'),
      expectedBasePublishedRevisionId: null,
      expectedDraftVersion: 1,
      idempotencyKey: '74000000-0000-4000-8000-000000000010',
      now: NOW,
      studyYear: 2,
      workPublicId: WORK_PUBLIC,
    });
    expect(first.outcome).toBe('created');
    if (first.outcome !== 'created') throw new Error('FIRST_SUBMISSION_FAILED');
    const revision1 = first.revision;
    const revision1Id = await revisionId(revision1.publicId);
    await expect(
      publication.approveAndPublish({
        actorAccountId: ADMIN,
        expectedRevisionVersion: 1,
        idempotencyKey: '74000000-0000-4000-8000-000000000011',
        now: new Date(NOW.getTime() + 1_000),
        revisionPublicId: revision1.publicId,
      }),
    ).resolves.toMatchObject({ outcome: 'published' });
    await expectPublishedPointer(revision1Id);
    await expect(publication.findPublicWork(WORK_PUBLIC)).resolves.toMatchObject({
      revisionNumber: 1,
      title: 'ฉบับหนึ่ง',
      tags: [{ displayLabel: 'Alpha' }],
      links: [{ url: 'https://example.com/one' }],
      videoLinks: [{ providerVideoId: 'abc12345678' }],
      attributions: [{ attributionName: 'ผู้ส่ง สายทดสอบ', studyYear: 2 }],
      media: [{ assetId: POSTER, kind: 'poster', variants: [{ width: 480, height: 720 }] }],
    });
    await expect(publication.findPublicMediaObjectKey(WORK_PUBLIC, POSTER, 480)).resolves.toBe(
      `media/${POSTER}/480.webp`,
    );

    const seeded = await works.seedDraft({
      actorAccountId: ACCOUNT,
      expectedPublishedRevisionId: revision1Id,
      idempotencyKey: '74000000-0000-4000-8000-000000000012',
      now: new Date(NOW.getTime() + 2_000),
      publicId: WORK_PUBLIC,
    });
    expect(seeded.outcome).toBe('created');
    if (seeded.outcome !== 'created') throw new Error('SEED_FAILED');
    const second = await revisions.submitRevision({
      actorAccountId: ACCOUNT,
      draft: draft('ฉบับสอง', 'Beta', TAG_BETA, 'https://example.com/two'),
      expectedBasePublishedRevisionId: revision1Id,
      expectedDraftVersion: seeded.work.version,
      idempotencyKey: '74000000-0000-4000-8000-000000000013',
      now: new Date(NOW.getTime() + 3_000),
      studyYear: 3,
      workPublicId: WORK_PUBLIC,
    });
    expect(second.outcome).toBe('created');
    if (second.outcome !== 'created') throw new Error('SECOND_SUBMISSION_FAILED');
    const revision2 = second.revision;
    const revision2Id = await revisionId(revision2.publicId);
    await expectPublishedPointer(revision1Id);
    await expect(publication.findPublicWork(WORK_PUBLIC)).resolves.toMatchObject({
      revisionNumber: 1,
      title: 'ฉบับหนึ่ง',
    });
    await expect(
      reviews.requestChanges({
        actorAccountId: ADMIN,
        expectedRevisionVersion: 1,
        feedback: 'กรุณาเพิ่มผลลัพธ์ที่ตรวจสอบได้',
        idempotencyKey: '74000000-0000-4000-8000-000000000014',
        now: new Date(NOW.getTime() + 4_000),
        reason: 'content',
        revisionPublicId: revision2.publicId,
      }),
    ).resolves.toMatchObject({ outcome: 'changed_requested' });
    await expectPublishedPointer(revision1Id);
    await expect(publication.findPublicWork(WORK_PUBLIC)).resolves.toMatchObject({
      revisionNumber: 1,
      title: 'ฉบับหนึ่ง',
    });

    const draftRows = await database.sql<Array<{ version: string }>>`
      select version from private.work_drafts where work_id = ${WORK} and lifecycle_state = 'active'
    `;
    const correctedDraftVersion = Number(draftRows[0]?.version);
    const corrected = await revisions.submitRevision({
      actorAccountId: ACCOUNT,
      draft: draft('ฉบับสามแก้ไข', 'Gamma', TAG_GAMMA, 'https://example.com/three'),
      expectedBasePublishedRevisionId: revision1Id,
      expectedDraftVersion: correctedDraftVersion,
      idempotencyKey: '74000000-0000-4000-8000-000000000015',
      now: new Date(NOW.getTime() + 5_000),
      studyYear: 4,
      workPublicId: WORK_PUBLIC,
    });
    expect(corrected.outcome).toBe('created');
    if (corrected.outcome !== 'created') throw new Error('CORRECTION_SUBMISSION_FAILED');
    const revision3 = corrected.revision;
    const revision3Id = await revisionId(revision3.publicId);
    await expectPublishedPointer(revision1Id);
    await expect(publication.findPublicWork(WORK_PUBLIC)).resolves.toMatchObject({
      revisionNumber: 1,
      title: 'ฉบับหนึ่ง',
    });
    await expect(
      publication.approveAndPublish({
        actorAccountId: ADMIN,
        expectedRevisionVersion: 1,
        idempotencyKey: '74000000-0000-4000-8000-000000000016',
        now: new Date(NOW.getTime() + 6_000),
        revisionPublicId: revision3.publicId,
      }),
    ).resolves.toMatchObject({ outcome: 'published' });
    await expectPublishedPointer(revision3Id);
    await expect(publication.findPublicWork(WORK_PUBLIC)).resolves.toMatchObject({
      revisionNumber: 3,
      title: 'ฉบับสามแก้ไข',
      tags: [{ displayLabel: 'Gamma' }],
      links: [{ url: 'https://example.com/three' }],
      videoLinks: [{ providerVideoId: 'abc12345678' }],
      attributions: [{ attributionName: 'ผู้ส่ง สายทดสอบ', studyYear: 4 }],
      media: [{ assetId: POSTER, kind: 'poster', variants: [{ width: 480, height: 720 }] }],
    });

    const rows = await database.sql<Array<Record<string, unknown>>>`
      select published.public_id as published_revision_public_id, work.publication_state,
        (select count(*)::integer from private.work_revisions where work_id = ${WORK}) as revisions,
        (select count(*)::integer from private.reviews as review join private.work_revisions as rev on rev.id = review.revision_id where rev.public_id in (${revision2.publicId}::uuid, ${revision3.publicId}::uuid)) as reviews,
        (select count(*)::integer from private.work_revision_operations where work_id = ${WORK}) as operations,
        (select count(*)::integer from private.work_operations where work_id = ${WORK}) as work_operations,
        (select count(*)::integer from private.outbox_events where aggregate_type = 'work_revision' and aggregate_id in (${revision1.publicId}::uuid, ${revision2.publicId}::uuid, ${revision3.publicId}::uuid)) as events,
        (select count(*)::integer from private.published_revision_tags as published_tag
          join private.work_revision_tags as revision_tag on revision_tag.revision_id = published_tag.revision_id
          where published_tag.revision_id = work.published_revision_id
            and revision_tag.normalized_identity = ${TAG_ALPHA}) as alpha_count,
        (select count(*)::integer from private.published_revision_tags as published_tag
          join private.work_revision_tags as revision_tag on revision_tag.revision_id = published_tag.revision_id
          where published_tag.revision_id = work.published_revision_id
            and revision_tag.normalized_identity = ${TAG_GAMMA}) as gamma_count,
        (select rev.public_id from private.public_work_catalog as catalog join private.work_revisions as rev on rev.id = catalog.revision_id where catalog.work_id = ${WORK}) as catalog_revision_public_id
      from public.works as work
      join private.work_revisions as published on published.id = work.published_revision_id
      where work.id = ${WORK}`;
    expect(rows[0]).toMatchObject({
      publication_state: 'published',
      published_revision_public_id: revision3.publicId,
      revisions: 3,
      reviews: 2,
      operations: 3,
      work_operations: 1,
      events: 5,
      alpha_count: 0,
      gamma_count: 1,
      catalog_revision_public_id: revision3.publicId,
    });
    const snapshots = await database.sql<
      Array<{
        attribution_count: number;
        link_count: number;
        media_count: number;
        revision_number: number;
        status: string;
        tag_count: number;
        title: string;
        video_count: number;
      }>
    >`
      select revision.revision_number::integer as revision_number, revision.title, revision.status,
        (select count(*)::integer from private.work_revision_attributions where revision_id = revision.id) as attribution_count,
        (select count(*)::integer from private.work_revision_links where revision_id = revision.id) as link_count,
        (select count(*)::integer from private.work_revision_media where revision_id = revision.id) as media_count,
        (select count(*)::integer from private.work_revision_tags where revision_id = revision.id) as tag_count,
        (select count(*)::integer from private.work_revision_video_links where revision_id = revision.id) as video_count
      from private.work_revisions as revision where revision.work_id = ${WORK}
      order by revision.revision_number
    `;
    expect(snapshots).toEqual([
      snapshot(1, 'ฉบับหนึ่ง', 'approved'),
      snapshot(2, 'ฉบับสอง', 'changes_requested'),
      snapshot(3, 'ฉบับสามแก้ไข', 'approved'),
    ]);
    const retainedReviews = await database.sql<
      Array<{
        decision: string;
        feedback: string | null;
        reason: string | null;
        revision_number: number;
      }>
    >`
      select review.decision, review.reason, review.feedback,
        revision.revision_number::integer as revision_number
      from private.reviews as review
      join private.work_revisions as revision on revision.id = review.revision_id
      where revision.work_id = ${WORK}
      order by revision.revision_number
    `;
    expect(retainedReviews).toEqual([
      { decision: 'approved', feedback: null, reason: null, revision_number: 1 },
      {
        decision: 'changes_requested',
        feedback: 'กรุณาเพิ่มผลลัพธ์ที่ตรวจสอบได้',
        reason: 'content',
        revision_number: 2,
      },
      { decision: 'approved', feedback: null, reason: null, revision_number: 3 },
    ]);
    const events = await database.sql<
      Array<{ aggregate_id: string; event_type: string; payload: Record<string, unknown> }>
    >`
      select aggregate_id, event_type, payload from private.outbox_events
      where aggregate_type = 'work_revision'
        and aggregate_id in (${revision1.publicId}::uuid, ${revision2.publicId}::uuid, ${revision3.publicId}::uuid)
      order by occurred_at, event_type
    `;
    expect(events.map((event) => event.event_type)).toEqual([
      'work_revision_submitted',
      'work_revision_published',
      'work_revision_submitted',
      'work_revision_submitted',
      'work_revision_published',
    ]);
    for (const event of events) {
      if (event.event_type === 'work_revision_submitted') {
        expect(event.payload).toMatchObject({
          revisionPublicId: event.aggregate_id,
          workPublicId: WORK_PUBLIC,
        });
      } else {
        expect(event.payload).toMatchObject({
          cacheTargets: { mediaAssetIds: [POSTER], workPublicId: WORK_PUBLIC },
        });
      }
    }
    expect(JSON.stringify(events)).not.toMatch(
      /studentId|accountId|personId|providerUserId|credential|privateObjectKey|masterObjectKey/i,
    );
    await expect(
      database.sql`update private.work_revisions set title = 'mutated' where public_id = ${revision1.publicId}`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.sql`update private.reviews set feedback = 'mutated' where revision_id = ${revision2Id}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  async function revisionId(publicId: string): Promise<string> {
    const rows = await database.sql<Array<{ id: string }>>`
      select id from private.work_revisions where public_id = ${publicId}
    `;
    const row = rows[0];
    if (row === undefined) throw new Error('REVISION_ID_NOT_FOUND');
    return row.id;
  }

  async function expectPublishedPointer(revisionId: string): Promise<void> {
    const pointers = await database.sql<
      Array<{ catalog_revision_id: string; published_revision_id: string }>
    >`
      select work.published_revision_id, catalog.revision_id as catalog_revision_id
      from public.works as work
      join private.public_work_catalog as catalog on catalog.work_id = work.id
      where work.id = ${WORK}
    `;
    expect(pointers).toEqual([
      { catalog_revision_id: revisionId, published_revision_id: revisionId },
    ]);
  }

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`
        delete from private.outbox_events
        where aggregate_type = 'work_revision'
          and aggregate_id in (select public_id from private.work_revisions where work_id = ${WORK})
      `;
      await tx`delete from private.work_operations where work_id = ${WORK}`;
      await tx`delete from private.work_revision_operations where work_id = ${WORK}`;
      await tx`delete from private.reviews where revision_id in (select id from private.work_revisions where work_id = ${WORK})`;
      await tx`delete from private.published_revision_tags where revision_id in (select id from private.work_revisions where work_id = ${WORK})`;
      await tx`
        delete from public.tags
        where normalized_identity in (${TAG_ALPHA}, ${TAG_BETA}, ${TAG_GAMMA})
      `;
      await tx`delete from private.work_revision_links where revision_id in (select id from private.work_revisions where work_id = ${WORK})`;
      await tx`delete from private.work_revision_tags where revision_id in (select id from private.work_revisions where work_id = ${WORK})`;
      await tx`delete from private.work_revision_video_links where revision_id in (select id from private.work_revisions where work_id = ${WORK})`;
      await tx`delete from private.work_revision_media where revision_id in (select id from private.work_revisions where work_id = ${WORK})`;
      await tx`delete from private.work_revision_attributions where revision_id in (select id from private.work_revisions where work_id = ${WORK})`;
      await tx`delete from private.work_revisions where work_id = ${WORK}`;
      await tx`delete from private.work_draft_media where work_id = ${WORK}`;
      await tx`delete from private.work_draft_video_links where work_id = ${WORK}`;
      await tx`delete from private.work_draft_tags where work_id = ${WORK}`;
      await tx`delete from private.work_draft_links where work_id = ${WORK}`;
      await tx`delete from private.work_drafts where work_id = ${WORK}`;
      await tx`delete from private.work_media_variants where asset_id = ${POSTER}`;
      await tx`delete from private.work_media_assets where id = ${POSTER}`;
      await tx`delete from public.works where id = ${WORK}`;
      await tx`delete from public.account_roles where account_id in (${ACCOUNT}, ${ADMIN})`;
      await tx`delete from public.accounts where id in (${ACCOUNT}, ${ADMIN})`;
      await tx`delete from public.students where person_id = ${PERSON}`;
      await tx`delete from private.person_names where person_id = ${PERSON}`;
      await tx`delete from public.people where id in (${PERSON}, ${ADMIN_PERSON})`;
    });
  }
});

function draft(title: string, displayLabel: string, normalizedIdentity: string, url: string) {
  return {
    academicPeriod: { semester: '1' as const, year: 2569 },
    category: 'course_work' as const,
    description: `${title} รายละเอียด`,
    links: [{ label: 'เว็บไซต์', url }],
    summary: `${title} สรุป`,
    tags: [
      {
        displayLabel,
        normalizedIdentity,
      },
    ],
    title,
    videoLinks: [
      {
        provider: 'youtube' as const,
        providerVideoId: 'abc12345678',
        url: 'https://www.youtube.com/watch?v=abc12345678',
      },
    ],
  };
}

function snapshot(revisionNumber: number, title: string, status: string) {
  return {
    attribution_count: 1,
    link_count: 1,
    media_count: 1,
    revision_number: revisionNumber,
    status,
    tag_count: 1,
    title,
    video_count: 1,
  };
}
