import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresPublicationRepository } from '../src/modules/works/infrastructure/postgres-publication.repository';
import { PostgresReviewsRepository } from '../src/modules/works/infrastructure/postgres-reviews.repository';

const STUDENT_PERSON_ID = '83000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT_ID = '83000000-0000-4000-8000-000000000002';
const STUDENT_PROVIDER_ID = '83000000-0000-4000-8000-000000000003';
const CONTRIBUTOR_PERSON_ID = '83000000-0000-4000-8000-000000000004';
const CONTRIBUTOR_ACCOUNT_ID = '83000000-0000-4000-8000-000000000005';
const CONTRIBUTOR_PROVIDER_ID = '83000000-0000-4000-8000-000000000006';
const CONTRIBUTOR_PROFILE_PUBLIC_ID = '83000000-0000-4000-8000-000000000007';
const ADMIN_PERSON_ID = '83000000-0000-4000-8000-000000000008';
const ADMIN_ACCOUNT_ID = '83000000-0000-4000-8000-000000000009';
const ADMIN_PROVIDER_ID = '83000000-0000-4000-8000-000000000010';
const WORK_ID = '83000000-0000-4000-8000-000000000011';
const WORK_PUBLIC_ID = '83000000-0000-4000-8000-000000000012';
const REVISION_ID = '83000000-0000-4000-8000-000000000013';
const REVISION_PUBLIC_ID = '83000000-0000-4000-8000-000000000014';
const POSTER_ID = '83000000-0000-4000-8000-000000000015';
const IDEMPOTENCY_KEY = '83000000-0000-4000-8000-000000000016';
const OTHER_KEY = '83000000-0000-4000-8000-000000000017';
const SECOND_REVISION_ID = '83000000-0000-4000-8000-000000000018';
const SECOND_REVISION_PUBLIC_ID = '83000000-0000-4000-8000-000000000019';
const SECOND_POSTER_ID = '83000000-0000-4000-8000-000000000020';
const SECOND_KEY = '83000000-0000-4000-8000-000000000021';
const SECOND_CONCURRENT_KEY = '83000000-0000-4000-8000-000000000022';
const THIRD_REVISION_ID = '83000000-0000-4000-8000-000000000023';
const THIRD_REVISION_PUBLIC_ID = '83000000-0000-4000-8000-000000000024';
const CHANGE_REQUEST_KEY = '83000000-0000-4000-8000-000000000025';
const NOW = new Date('2026-08-25T18:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresPublicationRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresPublicationRepository(database);
  const reviews = new PostgresReviewsRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`
        insert into public.people (id) values
          (${STUDENT_PERSON_ID}), (${CONTRIBUTOR_PERSON_ID}), (${ADMIN_PERSON_ID})
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year) values
          (${STUDENT_PERSON_ID}, 2566, 2573), (${CONTRIBUTOR_PERSON_ID}, 2565, 2572)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state) values
          (${STUDENT_ACCOUNT_ID}, ${STUDENT_PERSON_ID}, ${STUDENT_PROVIDER_ID}, 'set'),
          (${CONTRIBUTOR_ACCOUNT_ID}, ${CONTRIBUTOR_PERSON_ID}, ${CONTRIBUTOR_PROVIDER_ID}, 'set'),
          (${ADMIN_ACCOUNT_ID}, ${ADMIN_PERSON_ID}, ${ADMIN_PROVIDER_ID}, 'set')
      `;
      await transaction`
        insert into public.account_roles (account_id, role) values
          (${STUDENT_ACCOUNT_ID}, 'student'), (${CONTRIBUTOR_ACCOUNT_ID}, 'student'),
          (${ADMIN_ACCOUNT_ID}, 'admin')
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th) values
          (${STUDENT_PERSON_ID}, 'ผู้ส่ง', 'ผลงาน'),
          (${CONTRIBUTOR_PERSON_ID}, 'ผู้ร่วม', 'ผลงาน')
      `;
      await transaction`
        insert into public.public_profiles (
          person_id, public_id, version, created_at, updated_at
        ) values (
          ${CONTRIBUTOR_PERSON_ID}, ${CONTRIBUTOR_PROFILE_PUBLIC_ID}, 1, ${NOW}, ${NOW}
        )
      `;
      await transaction`
        insert into public.profile_consents (person_id, consent_text_version, granted_at)
        values (${CONTRIBUTOR_PERSON_ID}, 'phase-1', ${NOW})
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
        insert into private.work_drafts (
          work_id, title, summary, description, category, academic_year, semester,
          submitter_study_year, version, created_at, updated_at
        ) values (
          ${WORK_ID}, 'ระบบแนะนำผลงาน', 'สรุปผลงาน', 'รายละเอียดผลงาน',
          'course_work', 2569, '1', 2, 2, ${NOW}, ${NOW}
        )
      `;
      await transaction`
        insert into private.work_revisions (
          id, public_id, work_id, revision_number, status, draft_version, title, summary,
          description, category, academic_year, semester, submitted_at, version
        ) values (
          ${REVISION_ID}, ${REVISION_PUBLIC_ID}, ${WORK_ID}, 1, 'pending_review', 2,
          'ระบบแนะนำผลงาน', 'สรุปผลงาน', 'รายละเอียดผลงาน', 'course_work', 2569, '1',
          ${NOW}, 1
        )
      `;
      await transaction`
        insert into private.work_revision_attributions (
          revision_id, position, kind, person_id, attribution_name, study_year
        ) values
          (${REVISION_ID}, 1, 'submitter', ${STUDENT_PERSON_ID}, 'ชื่อผู้ส่ง snapshot', 2),
          (${REVISION_ID}, 2, 'account', ${CONTRIBUTOR_PERSON_ID}, 'ชื่อผู้ร่วม snapshot', 3)
      `;
      await transaction`
        insert into private.work_revision_tags (
          revision_id, position, display_label, normalized_identity
        ) values (${REVISION_ID}, 1, 'React', 'react')
      `;
      await transaction`
        insert into private.work_revision_links (revision_id, position, label, url)
        values (${REVISION_ID}, 1, 'เว็บไซต์', 'https://example.com/work')
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
          ${new Date('2026-09-01T18:00:00.000Z')}
        )
      `;
      await transaction`
        insert into private.work_media_variants (
          asset_id, width, height, byte_size, content_hash, object_key
        ) values (${POSTER_ID}, 480, 720, 256, ${Buffer.alloc(32, 2)}, ${`media/${POSTER_ID}/480.webp`})
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

  it('keeps the first Revision and its media absent from public reads before approval', async () => {
    await expect(repository.findPublicWork(WORK_PUBLIC_ID)).resolves.toBeNull();
    await expect(
      repository.findPublicMediaObjectKey(WORK_PUBLIC_ID, POSTER_ID, 480),
    ).resolves.toBeNull();
    await expect(
      database.sql`
        insert into private.reviews (
          revision_id, actor_account_id, decision, reason, feedback,
          expected_revision_version, resulting_revision_version, idempotency_key,
          request_payload, reviewed_at
        ) values (
          ${REVISION_ID}, ${ADMIN_ACCOUNT_ID}, 'changes_requested', null, null,
          1, 2, gen_random_uuid(), '{}'::jsonb, ${NOW}
        )
      `,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.sql`
        insert into private.reviews (
          revision_id, actor_account_id, decision, reason, feedback,
          expected_revision_version, resulting_revision_version, idempotency_key,
          request_payload, reviewed_at
        ) values (
          ${REVISION_ID}, ${ADMIN_ACCOUNT_ID}, 'approved', null, 'must stay private',
          1, 2, gen_random_uuid(), '{}'::jsonb, ${NOW}
        )
      `,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('publishes atomically, resolves concurrency, activates Tags, and records safe effects', async () => {
    await expect(
      repository.approveAndPublish(input({ expectedRevisionVersion: 2 })),
    ).resolves.toEqual({ outcome: 'revision_version_conflict' });
    await expect(repository.findPublicWork(WORK_PUBLIC_ID)).resolves.toBeNull();

    await database.sql`
      insert into private.outbox_events (
        aggregate_type, aggregate_id, event_type, payload, occurred_at
      ) values (
        'work_revision', ${REVISION_PUBLIC_ID}, 'work_revision_published', '{}'::jsonb, ${NOW}
      )
    `;
    await expect(repository.approveAndPublish(input())).rejects.toMatchObject({ code: '23505' });
    await expect(repository.findPublicWork(WORK_PUBLIC_ID)).resolves.toBeNull();
    await expect(
      database.sql`
        select revision.status, work.publication_state,
          (select count(*)::integer from private.reviews where revision_id = revision.id) as reviews,
          (select count(*)::integer from public.tags) as tags
        from private.work_revisions as revision
        join public.works as work on work.id = revision.work_id
        where revision.id = ${REVISION_ID}
      `,
    ).resolves.toMatchObject([
      { publication_state: 'never_published', reviews: 0, status: 'pending_review', tags: 0 },
    ]);
    await database.sql`
      delete from private.outbox_events
      where aggregate_type = 'work_revision' and aggregate_id = ${REVISION_PUBLIC_ID}
        and event_type = 'work_revision_published'
    `;

    const firstInput = input();
    const secondInput = input({ idempotencyKey: OTHER_KEY });
    const competing = await Promise.all([
      repository.approveAndPublish(firstInput),
      repository.approveAndPublish(secondInput),
    ]);
    expect(competing.map((result) => result.outcome).sort()).toEqual([
      'published',
      'revision_state_conflict',
    ]);
    const winningInput = competing[0]?.outcome === 'published' ? firstInput : secondInput;
    await expect(repository.approveAndPublish(winningInput)).resolves.toMatchObject({
      outcome: 'replayed',
      publication: { revisionPublicId: REVISION_PUBLIC_ID, workPublicId: WORK_PUBLIC_ID },
    });
    await expect(
      repository.approveAndPublish({ ...winningInput, expectedRevisionVersion: 2 }),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });

    const work = await repository.findPublicWork(WORK_PUBLIC_ID);
    expect(work).toMatchObject({
      attributions: [
        { attributionName: 'ชื่อผู้ส่ง snapshot', profilePublicId: null },
        {
          attributionName: 'ชื่อผู้ร่วม snapshot',
          profilePublicId: CONTRIBUTOR_PROFILE_PUBLIC_ID,
        },
      ],
      tags: [{ displayLabel: 'React' }],
      title: 'ระบบแนะนำผลงาน',
      workPublicId: WORK_PUBLIC_ID,
    });
    expect(JSON.stringify(work)).not.toMatch(
      /studentId|accountId|personId|provider|ชื่อโปรไฟล์ส่วนตัว/i,
    );
    await expect(repository.findPublicMediaObjectKey(WORK_PUBLIC_ID, POSTER_ID, 480)).resolves.toBe(
      `media/${POSTER_ID}/480.webp`,
    );
    await expect(
      repository.findPublicMediaObjectKey(WORK_PUBLIC_ID, POSTER_ID, 999),
    ).resolves.toBeNull();

    const state = await database.sql<
      Array<{
        active_work_count: number;
        catalog_normalized_search: string;
        catalog_revision_id: string;
        decision: string;
        event_count: number;
        event_payload: {
          cacheTargets: {
            mediaAssetIds: string[];
            tagPublicIds: string[];
            workPublicId: string;
          };
        };
        draft_lifecycle_state: string;
        publication_state: string;
        published_revision_id: string;
        revision_status: string;
        revision_version: string;
      }>
    >`
      select work.publication_state, work.published_revision_id,
        revision.status as revision_status, revision.version as revision_version,
        review.decision,
        tag.active_work_count::integer as active_work_count,
        catalog.revision_id as catalog_revision_id,
        catalog.normalized_search as catalog_normalized_search,
        (select count(*)::integer from private.outbox_events
          where aggregate_type = 'work_revision' and aggregate_id = revision.public_id
            and event_type = 'work_revision_published') as event_count,
        (select payload from private.outbox_events
          where aggregate_type = 'work_revision' and aggregate_id = revision.public_id
            and event_type = 'work_revision_published') as event_payload,
        (select lifecycle_state from private.work_drafts where work_id = work.id)
          as draft_lifecycle_state
      from public.works as work
      join private.work_revisions as revision on revision.id = work.published_revision_id
      join private.reviews as review on review.revision_id = revision.id
      join private.published_revision_tags as published_tag on published_tag.revision_id = revision.id
      join public.tags as tag on tag.id = published_tag.tag_id
      join private.public_work_catalog as catalog on catalog.work_id = work.id
      where work.id = ${WORK_ID}
    `;
    expect(state).toMatchObject([
      {
        active_work_count: 1,
        catalog_revision_id: REVISION_ID,
        decision: 'approved',
        draft_lifecycle_state: 'retained',
        event_count: 1,
        publication_state: 'published',
        published_revision_id: REVISION_ID,
        revision_status: 'approved',
        revision_version: '2',
      },
    ]);
    expect(state[0]?.catalog_normalized_search).toContain('react');
    expect(state[0]?.event_payload).toMatchObject({
      cacheTargets: {
        mediaAssetIds: [POSTER_ID],
        tagPublicIds: [expect.any(String)],
        workPublicId: WORK_PUBLIC_ID,
      },
    });
    expect(JSON.stringify(state[0]?.event_payload)).not.toMatch(/studentId|provider/i);
    await expect(
      database.sql`update private.reviews set decision = 'changes_requested' where revision_id = ${REVISION_ID}`,
    ).rejects.toMatchObject({ code: '23514' });

    await database.sql`
      update public.profile_consents set withdrawn_at = ${new Date(NOW.getTime() + 2_000)}
      where person_id = ${CONTRIBUTOR_PERSON_ID} and withdrawn_at is null
    `;
    await expect(repository.findPublicWork(WORK_PUBLIC_ID)).resolves.toMatchObject({
      attributions: [
        { attributionName: 'ชื่อผู้ส่ง snapshot', profilePublicId: null },
        { attributionName: 'ชื่อผู้ร่วม snapshot', profilePublicId: null },
      ],
      workPublicId: WORK_PUBLIC_ID,
    });
  });

  it('atomically advances to a newer Revision and retires old Tag/media eligibility', async () => {
    await database.sql.begin(async (transaction) => {
      await transaction`
        insert into private.work_revisions (
          id, public_id, work_id, revision_number, status, base_published_revision_id,
          draft_version, title, summary, description, category, academic_year, semester,
          submitted_at, version
        ) values (
          ${SECOND_REVISION_ID}, ${SECOND_REVISION_PUBLIC_ID}, ${WORK_ID}, 2, 'pending_review',
          ${REVISION_ID}, 3, 'ผลงานฉบับใหม่', 'สรุปใหม่', 'รายละเอียดใหม่', 'course_work',
          2569, '2', ${new Date(NOW.getTime() + 3_000)}, 1
        )
      `;
      await transaction`
        insert into private.work_revision_attributions (
          revision_id, position, kind, person_id, attribution_name, study_year
        ) values (
          ${SECOND_REVISION_ID}, 1, 'submitter', ${STUDENT_PERSON_ID}, 'ชื่อผู้ส่งฉบับใหม่', 3
        )
      `;
      await transaction`
        insert into private.work_revision_tags (
          revision_id, position, display_label, normalized_identity
        ) values (${SECOND_REVISION_ID}, 1, 'Vue', 'vue')
      `;
      await transaction`
        insert into private.work_media_assets (
          id, work_id, media_kind, status, quarantine_object_key, authorize_idempotency_key,
          master_object_key, declared_content_type, declared_extension, declared_byte_size,
          inspected_byte_size, width, height, content_hash, dominant_color,
          created_at, updated_at, expires_at
        ) values (
          ${SECOND_POSTER_ID}, ${WORK_ID}, 'poster', 'ready', ${`quarantine/${SECOND_POSTER_ID}`},
          ${SECOND_POSTER_ID}, ${`media/${SECOND_POSTER_ID}/master.webp`}, 'image/jpeg', 'jpg',
          1024, 512, 1200, 1800, ${Buffer.alloc(32, 3)}, '#375A4A', ${NOW}, ${NOW},
          ${new Date('2026-09-01T18:00:00.000Z')}
        )
      `;
      await transaction`
        insert into private.work_media_variants (
          asset_id, width, height, byte_size, content_hash, object_key
        ) values (
          ${SECOND_POSTER_ID}, 480, 720, 256, ${Buffer.alloc(32, 4)},
          ${`media/${SECOND_POSTER_ID}/480.webp`}
        )
      `;
      await transaction`
        insert into private.work_revision_media (revision_id, media_kind, position, asset_id)
        values (${SECOND_REVISION_ID}, 'poster', 1, ${SECOND_POSTER_ID})
      `;
    });

    await expect(repository.findPublicWork(WORK_PUBLIC_ID)).resolves.toMatchObject({
      revisionNumber: 1,
      title: 'ระบบแนะนำผลงาน',
    });
    await expect(
      repository.findPublicMediaObjectKey(WORK_PUBLIC_ID, SECOND_POSTER_ID, 480),
    ).resolves.toBeNull();

    const attempts = await Promise.all([
      repository.approveAndPublish({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedRevisionVersion: 1,
        idempotencyKey: SECOND_KEY,
        now: new Date(NOW.getTime() + 4_000),
        revisionPublicId: SECOND_REVISION_PUBLIC_ID,
      }),
      repository.approveAndPublish({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedRevisionVersion: 1,
        idempotencyKey: SECOND_CONCURRENT_KEY,
        now: new Date(NOW.getTime() + 4_000),
        revisionPublicId: SECOND_REVISION_PUBLIC_ID,
      }),
    ]);
    expect(attempts.map((result) => result.outcome).sort()).toEqual([
      'published',
      'revision_state_conflict',
    ]);

    await expect(repository.findPublicWork(WORK_PUBLIC_ID)).resolves.toMatchObject({
      attributions: [{ attributionName: 'ชื่อผู้ส่งฉบับใหม่' }],
      revisionNumber: 2,
      tags: [{ displayLabel: 'Vue' }],
      title: 'ผลงานฉบับใหม่',
    });
    await expect(
      repository.findPublicMediaObjectKey(WORK_PUBLIC_ID, POSTER_ID, 480),
    ).resolves.toBeNull();
    await expect(
      repository.findPublicMediaObjectKey(WORK_PUBLIC_ID, SECOND_POSTER_ID, 480),
    ).resolves.toBe(`media/${SECOND_POSTER_ID}/480.webp`);

    const state = await database.sql<
      Array<{
        event_payload: {
          cacheTargets: {
            mediaAssetIds: string[];
            tagPublicIds: string[];
            workPublicId: string;
          };
        };
        old_media_retained: boolean;
        old_revision_retained: boolean;
        react_count: number;
        vue_count: number;
      }>
    >`
      select
        exists(select 1 from private.work_revisions where id = ${REVISION_ID}) as old_revision_retained,
        exists(select 1 from private.work_media_assets where id = ${POSTER_ID}) as old_media_retained,
        (select active_work_count::integer from public.tags where normalized_identity = 'react') as react_count,
        (select active_work_count::integer from public.tags where normalized_identity = 'vue') as vue_count,
        (select payload from private.outbox_events
          where aggregate_type = 'work_revision' and aggregate_id = ${SECOND_REVISION_PUBLIC_ID}
            and event_type = 'work_revision_published') as event_payload
    `;
    expect(state[0]).toMatchObject({
      old_media_retained: true,
      old_revision_retained: true,
      react_count: 0,
      vue_count: 1,
    });
    const eventPayload = state[0]?.event_payload;
    expect(eventPayload).toMatchObject({
      cacheTargets: {
        workPublicId: WORK_PUBLIC_ID,
      },
    });
    expect(eventPayload?.cacheTargets.mediaAssetIds.sort()).toEqual(
      [POSTER_ID, SECOND_POSTER_ID].sort(),
    );
    expect(eventPayload?.cacheTargets.tagPublicIds).toHaveLength(2);
    expect(eventPayload?.cacheTargets.tagPublicIds.every((id) => /^[0-9a-f-]{36}$/u.test(id))).toBe(
      true,
    );
  });

  it('keeps the current Published Revision public after a Change Request on a newer snapshot', async () => {
    await database.sql.begin(async (transaction) => {
      await transaction`
        insert into private.work_revisions (
          id, public_id, work_id, revision_number, status, base_published_revision_id,
          draft_version, title, summary, description, category, academic_year, semester,
          submitted_at, version
        ) values (
          ${THIRD_REVISION_ID}, ${THIRD_REVISION_PUBLIC_ID}, ${WORK_ID}, 3, 'pending_review',
          ${SECOND_REVISION_ID}, 1, 'ฉบับที่ต้องแก้ไข', 'สรุปที่ต้องแก้ไข',
          'รายละเอียดที่ต้องแก้ไข', 'course_work', 2569, '2',
          ${new Date(NOW.getTime() + 5_000)}, 1
        )
      `;
      await transaction`
        insert into private.work_revision_attributions (
          revision_id, position, kind, person_id, attribution_name, study_year
        ) values (
          ${THIRD_REVISION_ID}, 1, 'submitter', ${STUDENT_PERSON_ID}, 'ชื่อผู้ส่งฉบับแก้ไข', 3
        )
      `;
      await transaction`
        insert into private.work_revision_media (revision_id, media_kind, position, asset_id)
        values (${THIRD_REVISION_ID}, 'poster', 1, ${SECOND_POSTER_ID})
      `;
    });

    await expect(
      reviews.requestChanges({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedRevisionVersion: 1,
        feedback: 'กรุณาเพิ่มรายละเอียดผลลัพธ์ที่ตรวจสอบได้',
        idempotencyKey: CHANGE_REQUEST_KEY,
        now: new Date(NOW.getTime() + 6_000),
        reason: 'content',
        revisionPublicId: THIRD_REVISION_PUBLIC_ID,
      }),
    ).resolves.toMatchObject({ outcome: 'changed_requested' });
    await expect(repository.findPublicWork(WORK_PUBLIC_ID)).resolves.toMatchObject({
      revisionNumber: 2,
      title: 'ผลงานฉบับใหม่',
    });
    const state = await database.sql<
      Array<{
        base_published_revision_id: string;
        published_revision_id: string;
        status: string;
      }>
    >`
      select revision.status, draft.base_published_revision_id, work.published_revision_id
      from private.work_revisions as revision
      join public.works as work on work.id = revision.work_id
      join private.work_drafts as draft on draft.work_id = work.id
      where revision.id = ${THIRD_REVISION_ID}
    `;
    expect(state).toEqual([
      {
        base_published_revision_id: SECOND_REVISION_ID,
        published_revision_id: SECOND_REVISION_ID,
        status: 'changes_requested',
      },
    ]);
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`set local session_replication_role = replica`;
      await transaction`delete from private.outbox_events where aggregate_type = 'work_revision' and aggregate_id = ${REVISION_PUBLIC_ID}`;
      await transaction`delete from private.outbox_events where aggregate_type = 'work_revision' and aggregate_id = ${SECOND_REVISION_PUBLIC_ID}`;
      await transaction`delete from private.outbox_events where aggregate_type = 'work_revision' and aggregate_id = ${THIRD_REVISION_PUBLIC_ID}`;
      await transaction`delete from private.published_revision_tags where revision_id = ${SECOND_REVISION_ID}`;
      await transaction`delete from private.published_revision_tags where revision_id = ${REVISION_ID}`;
      await transaction`delete from public.tags where normalized_identity in ('react', 'vue')`;
      await transaction`delete from private.reviews where revision_id in (${REVISION_ID}, ${SECOND_REVISION_ID}, ${THIRD_REVISION_ID})`;
      await transaction`delete from private.work_revision_links where revision_id = ${REVISION_ID}`;
      await transaction`delete from private.work_revision_tags where revision_id = ${REVISION_ID}`;
      await transaction`delete from private.work_revision_attributions where revision_id = ${REVISION_ID}`;
      await transaction`delete from private.work_revision_media where revision_id = ${REVISION_ID}`;
      await transaction`delete from private.work_revision_attributions where revision_id = ${SECOND_REVISION_ID}`;
      await transaction`delete from private.work_revision_media where revision_id = ${SECOND_REVISION_ID}`;
      await transaction`delete from private.work_revision_attributions where revision_id = ${THIRD_REVISION_ID}`;
      await transaction`delete from private.work_revision_media where revision_id = ${THIRD_REVISION_ID}`;
      await transaction`delete from private.work_revision_tags where revision_id = ${SECOND_REVISION_ID}`;
      await transaction`delete from private.work_draft_media where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_video_links where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_tags where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_draft_links where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_drafts where work_id = ${WORK_ID}`;
      await transaction`delete from private.work_revisions where id in (${REVISION_ID}, ${SECOND_REVISION_ID}, ${THIRD_REVISION_ID})`;
      await transaction`delete from private.work_media_variants where asset_id = ${SECOND_POSTER_ID}`;
      await transaction`delete from private.work_media_variants where asset_id = ${POSTER_ID}`;
      await transaction`delete from private.work_media_assets where id in (${POSTER_ID}, ${SECOND_POSTER_ID})`;
      await transaction`delete from public.works where id = ${WORK_ID}`;
      await transaction`delete from public.profile_consents where person_id = ${CONTRIBUTOR_PERSON_ID}`;
      await transaction`delete from public.public_profiles where person_id = ${CONTRIBUTOR_PERSON_ID}`;
      await transaction`delete from public.account_roles where account_id in (${STUDENT_ACCOUNT_ID}, ${CONTRIBUTOR_ACCOUNT_ID}, ${ADMIN_ACCOUNT_ID})`;
      await transaction`delete from public.accounts where id in (${STUDENT_ACCOUNT_ID}, ${CONTRIBUTOR_ACCOUNT_ID}, ${ADMIN_ACCOUNT_ID})`;
      await transaction`delete from public.students where person_id in (${STUDENT_PERSON_ID}, ${CONTRIBUTOR_PERSON_ID})`;
      await transaction`delete from public.people where id in (${STUDENT_PERSON_ID}, ${CONTRIBUTOR_PERSON_ID}, ${ADMIN_PERSON_ID})`;
    });
  }
});

function input(
  overrides: Partial<Parameters<PostgresPublicationRepository['approveAndPublish']>[0]> = {},
) {
  return {
    actorAccountId: ADMIN_ACCOUNT_ID,
    expectedRevisionVersion: 1,
    idempotencyKey: IDEMPOTENCY_KEY,
    now: new Date(NOW.getTime() + 1_000),
    revisionPublicId: REVISION_PUBLIC_ID,
    ...overrides,
  };
}
