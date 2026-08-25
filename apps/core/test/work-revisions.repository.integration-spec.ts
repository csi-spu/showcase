import { ConfigService } from '@nestjs/config';
import type postgres from 'postgres';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresWorkRevisionsRepository } from '../src/modules/works/infrastructure/postgres-work-revisions.repository';
import { PostgresWorkMediaRepository } from '../src/modules/works/infrastructure/postgres-work-media.repository';

const PERSON_ID = '73000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '73000000-0000-4000-8000-000000000002';
const PROVIDER_USER_ID = '73000000-0000-4000-8000-000000000003';
const CONTRIBUTOR_PERSON_ID = '73000000-0000-4000-8000-000000000004';
const OTHER_PERSON_ID = '73000000-0000-4000-8000-000000000005';
const OTHER_ACCOUNT_ID = '73000000-0000-4000-8000-000000000006';
const OTHER_PROVIDER_USER_ID = '73000000-0000-4000-8000-000000000007';
const WORK_ID = '73000000-0000-4000-8000-000000000008';
const WORK_PUBLIC_ID = '73000000-0000-4000-8000-000000000009';
const SECOND_WORK_ID = '73000000-0000-4000-8000-000000000010';
const SECOND_WORK_PUBLIC_ID = '73000000-0000-4000-8000-000000000011';
const POSTER_ID = '73000000-0000-4000-8000-000000000012';
const SECOND_POSTER_ID = '73000000-0000-4000-8000-000000000013';
const INVITATION_ID = '73000000-0000-4000-8000-000000000014';
const NOW = new Date('2026-08-25T15:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresWorkRevisionsRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresWorkRevisionsRepository(database);
  const mediaRepository = new PostgresWorkMediaRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`
        insert into public.people (id) values
          (${PERSON_ID}), (${CONTRIBUTOR_PERSON_ID}), (${OTHER_PERSON_ID})
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year) values
          (${PERSON_ID}, 2566, 2573), (${OTHER_PERSON_ID}, 2566, 2573)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state) values
          (${ACCOUNT_ID}, ${PERSON_ID}, ${PROVIDER_USER_ID}, 'set'),
          (${OTHER_ACCOUNT_ID}, ${OTHER_PERSON_ID}, ${OTHER_PROVIDER_USER_ID}, 'set')
      `;
      await transaction`
        insert into public.account_roles (account_id, role)
        values (${ACCOUNT_ID}, 'student'), (${OTHER_ACCOUNT_ID}, 'student')
      `;
      await transaction`
        update public.academic_settings set current_academic_year = 2569, updated_at = ${NOW}
        where singleton = true
      `;
      await seedDraft(transaction, WORK_ID, WORK_PUBLIC_ID, POSTER_ID, 3);
      await seedDraft(transaction, SECOND_WORK_ID, SECOND_WORK_PUBLIC_ID, SECOND_POSTER_ID, 1);
      await transaction`
        insert into private.attribution_invitations (
          id, work_id, kind, invitee_person_id, accepted_person_id, state,
          attribution_name, study_year, public_attribution_consented_at,
          expires_at, created_at, updated_at, resolved_at
        ) values (
          ${INVITATION_ID}, ${WORK_ID}, 'account', ${CONTRIBUTOR_PERSON_ID},
          ${CONTRIBUTOR_PERSON_ID}, 'accepted', 'ชื่อผู้ร่วมผลงาน', 2, ${NOW},
          ${new Date('2026-09-08T15:00:00.000Z')}, ${NOW}, ${NOW}, ${NOW}
        )
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('atomically creates one immutable numbered private snapshot and replays equivalent retries', async () => {
    await expect(
      repository.submitRevision(submitInput({ actorAccountId: OTHER_ACCOUNT_ID })),
    ).resolves.toEqual({ outcome: 'not_found' });
    await expect(
      repository.submitRevision(submitInput({ expectedDraftVersion: 2 })),
    ).resolves.toEqual({ outcome: 'draft_version_conflict' });
    await database.sql`update private.work_media_assets set status = 'processing' where id = ${POSTER_ID}`;
    await expect(repository.submitRevision(submitInput())).resolves.toEqual({
      outcome: 'media_not_ready',
    });
    const rejectedTransaction = await database.sql<
      Array<{ events: number; operations: number; revisions: number }>
    >`
      select
        (select count(*)::integer from private.work_revisions where work_id = ${WORK_ID}) as revisions,
        (select count(*)::integer from private.work_revision_operations where work_id = ${WORK_ID}) as operations,
        (select count(*)::integer from private.outbox_events where aggregate_type = 'work_revision') as events
    `;
    expect(rejectedTransaction).toEqual([{ events: 0, operations: 0, revisions: 0 }]);
    await database.sql`update private.work_media_assets set status = 'ready' where id = ${POSTER_ID}`;

    const created = await repository.submitRevision(submitInput());
    expect(created).toMatchObject({
      outcome: 'created',
      revision: {
        attributions: [
          {
            attributionName: 'ชื่อผู้ส่ง',
            kind: 'submitter',
            studyYear: 2,
          },
          {
            attributionName: 'ชื่อผู้ร่วมผลงาน',
            kind: 'account',
            studyYear: 2,
          },
        ],
        content: { title: 'ระบบแนะนำผลงาน' },
        media: [{ assetId: POSTER_ID, kind: 'poster', position: 1 }],
        number: 1,
        status: 'pending_review',
        version: 1,
        workPublicId: WORK_PUBLIC_ID,
      },
    });
    if (!('revision' in created)) throw new Error('REVISION_CREATE_FAILED');

    await expect(repository.submitRevision(submitInput())).resolves.toMatchObject({
      outcome: 'replayed',
      revision: { publicId: created.revision.publicId },
    });
    await expect(
      repository.submitRevision(
        submitInput({ submitterAttribution: { attributionName: 'ชื่อผู้ส่ง', studyYear: 3 } }),
      ),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });
    await expect(
      repository.submitRevision(submitInput({ idempotencyKey: key(2) })),
    ).resolves.toEqual({ outcome: 'pending_revision_exists' });

    const visibility = await database.sql<
      Array<{
        draft_count: number;
        publication_state: string;
        published_revision_id: string | null;
      }>
    >`
      select publication_state, published_revision_id,
        (select count(*)::integer from private.work_drafts where work_id = work.id) as draft_count
      from public.works as work where id = ${WORK_ID}
    `;
    expect(visibility).toEqual([
      { draft_count: 0, publication_state: 'never_published', published_revision_id: null },
    ]);
    const eventCount = await database.sql<Array<{ count: number }>>`
      select count(*)::integer as count from private.outbox_events
      where aggregate_type = 'work_revision' and aggregate_id = ${created.revision.publicId}
        and event_type = 'work_revision_submitted'
    `;
    expect(eventCount).toEqual([{ count: 1 }]);
    await expect(
      mediaRepository.claimExpired(new Date('2026-09-02T15:00:00.000Z')),
    ).resolves.toBeNull();

    await expect(
      database.sql`
        update private.work_revisions set title = 'แก้ประวัติ'
        where public_id = ${created.revision.publicId}
      `,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.sql`
        delete from private.work_revision_media
        where revision_id = (
          select id from private.work_revisions where public_id = ${created.revision.publicId}
        )
      `,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('withdraws only pending state, retains history, and seeds a new private Draft idempotently', async () => {
    const pending = await repository.listReviewQueue({ limit: 20, cursor: undefined });
    if ('outcome' in pending || pending.items.length !== 1) throw new Error('QUEUE_SETUP_FAILED');
    const revisionPublicId = pending.items[0]!.revisionPublicId;

    await expect(
      repository.withdrawRevision(withdrawInput(revisionPublicId, { expectedRevisionVersion: 2 })),
    ).resolves.toEqual({ outcome: 'revision_version_conflict' });
    const withdrawn = await repository.withdrawRevision(withdrawInput(revisionPublicId));
    expect(withdrawn).toMatchObject({
      outcome: 'withdrawn',
      revision: { publicId: revisionPublicId, status: 'withdrawn', version: 2 },
    });
    await expect(
      repository.withdrawRevision(withdrawInput(revisionPublicId)),
    ).resolves.toMatchObject({
      outcome: 'replayed',
      revision: { publicId: revisionPublicId, status: 'withdrawn' },
    });

    const draft = await database.sql<Array<{ title: string; version: string }>>`
      select title, version from private.work_drafts where work_id = ${WORK_ID}
    `;
    expect(draft).toEqual([{ title: 'ระบบแนะนำผลงาน', version: '1' }]);
    const retained = await repository.findRevisionForReview(revisionPublicId);
    expect(retained).toBeNull();
    const history = await database.sql<Array<{ count: number }>>`
      select count(*)::integer as count from private.work_revisions
      where public_id = ${revisionPublicId} and status = 'withdrawn'
    `;
    expect(history).toEqual([{ count: 1 }]);
  });

  it('serializes concurrent submissions and cursor-paginates the Admin Review queue', async () => {
    const outcomes = await Promise.all([
      repository.submitRevision(submitInput({ expectedDraftVersion: 1, idempotencyKey: key(4) })),
      repository.submitRevision(submitInput({ expectedDraftVersion: 1, idempotencyKey: key(5) })),
    ]);
    expect(outcomes.map((result) => result.outcome).sort()).toEqual([
      'created',
      'pending_revision_exists',
    ]);
    const secondInput = submitInput({
      expectedDraftVersion: 1,
      idempotencyKey: key(6),
      now: new Date(NOW.getTime() + 1_000),
      workPublicId: SECOND_WORK_PUBLIC_ID,
    });
    const equivalentRetries = await Promise.all([
      repository.submitRevision(secondInput),
      repository.submitRevision(secondInput),
    ]);
    expect(equivalentRetries.map((result) => result.outcome).sort()).toEqual([
      'created',
      'replayed',
    ]);

    const first = await repository.listReviewQueue({ limit: 1, cursor: undefined });
    if ('outcome' in first) throw new Error('QUEUE_FAILED');
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.workPublicId).toBe(SECOND_WORK_PUBLIC_ID);
    expect(first.nextCursor).not.toBeNull();
    const second = await repository.listReviewQueue({ cursor: first.nextCursor!, limit: 10 });
    if ('outcome' in second) throw new Error('QUEUE_CURSOR_FAILED');
    expect(second.items).toHaveLength(1);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.revisionPublicId)).size,
    ).toBe(2);
    await expect(repository.listReviewQueue({ cursor: 'bad', limit: 10 })).resolves.toEqual({
      outcome: 'invalid_cursor',
    });
    expect(JSON.stringify([...first.items, ...second.items])).not.toMatch(
      /accountId|personId|studentId/i,
    );
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`set local session_replication_role = replica`;
      await transaction`delete from private.outbox_events where aggregate_type = 'work_revision'`;
      await transaction`
        delete from private.work_revision_operations where work_id in (${WORK_ID}, ${SECOND_WORK_ID})
      `;
      await transaction`
        delete from private.work_revision_attributions where revision_id in (
          select id from private.work_revisions where work_id in (${WORK_ID}, ${SECOND_WORK_ID})
        )
      `;
      await transaction`
        delete from private.work_revision_media where revision_id in (
          select id from private.work_revisions where work_id in (${WORK_ID}, ${SECOND_WORK_ID})
        )
      `;
      await transaction`
        delete from private.work_revision_video_links where revision_id in (
          select id from private.work_revisions where work_id in (${WORK_ID}, ${SECOND_WORK_ID})
        )
      `;
      await transaction`
        delete from private.work_revision_tags where revision_id in (
          select id from private.work_revisions where work_id in (${WORK_ID}, ${SECOND_WORK_ID})
        )
      `;
      await transaction`
        delete from private.work_revision_links where revision_id in (
          select id from private.work_revisions where work_id in (${WORK_ID}, ${SECOND_WORK_ID})
        )
      `;
      await transaction`delete from private.work_revisions where work_id in (${WORK_ID}, ${SECOND_WORK_ID})`;
      await transaction`delete from private.attribution_invitations where id = ${INVITATION_ID}`;
      await transaction`delete from private.work_draft_media where work_id in (${WORK_ID}, ${SECOND_WORK_ID})`;
      await transaction`delete from private.work_draft_video_links where work_id in (${WORK_ID}, ${SECOND_WORK_ID})`;
      await transaction`delete from private.work_draft_tags where work_id in (${WORK_ID}, ${SECOND_WORK_ID})`;
      await transaction`delete from private.work_draft_links where work_id in (${WORK_ID}, ${SECOND_WORK_ID})`;
      await transaction`delete from private.work_drafts where work_id in (${WORK_ID}, ${SECOND_WORK_ID})`;
      await transaction`delete from private.work_media_variants where asset_id in (${POSTER_ID}, ${SECOND_POSTER_ID})`;
      await transaction`delete from private.work_media_assets where id in (${POSTER_ID}, ${SECOND_POSTER_ID})`;
      await transaction`delete from public.works where id in (${WORK_ID}, ${SECOND_WORK_ID})`;
      await transaction`delete from public.account_roles where account_id in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})`;
      await transaction`delete from public.accounts where id in (${ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})`;
      await transaction`delete from public.students where person_id in (${PERSON_ID}, ${OTHER_PERSON_ID})`;
      await transaction`delete from public.people where id in (${PERSON_ID}, ${CONTRIBUTOR_PERSON_ID}, ${OTHER_PERSON_ID})`;
    });
  }
});

async function seedDraft(
  transaction: postgres.TransactionSql,
  workId: string,
  workPublicId: string,
  posterId: string,
  version: number,
): Promise<void> {
  await transaction`
    insert into public.works (
      id, public_id, submitter_person_id, activity_state, publication_state, created_at, updated_at
    ) values (${workId}, ${workPublicId}, ${PERSON_ID}, 'active', 'never_published', ${NOW}, ${NOW})
  `;
  await transaction`
    insert into private.work_drafts (
      work_id, title, summary, description, category, academic_year, semester,
      version, created_at, updated_at
    ) values (
      ${workId}, 'ระบบแนะนำผลงาน', 'สรุปผลงาน', 'รายละเอียดผลงาน',
      'course_work', 2569, '1', ${version}, ${NOW}, ${NOW}
    )
  `;
  await transaction`
    insert into private.work_draft_links (work_id, position, label, url)
    values (${workId}, 1, 'เว็บไซต์', 'https://example.com/')
  `;
  await transaction`
    insert into private.work_draft_tags (work_id, position, display_label, normalized_identity)
    values (${workId}, 1, 'React', 'react')
  `;
  await transaction`
    insert into private.work_media_assets (
      id, work_id, media_kind, status, quarantine_object_key, authorize_idempotency_key,
      master_object_key, declared_content_type, declared_extension, declared_byte_size,
      inspected_byte_size, width, height, content_hash, dominant_color,
      created_at, updated_at, expires_at
    ) values (
      ${posterId}, ${workId}, 'poster', 'ready', ${`quarantine/${posterId}`}, ${posterId},
      ${`media/${posterId}/master.webp`}, 'image/jpeg', 'jpg', 1024,
      512, 1200, 1800, ${Buffer.alloc(32, 1)}, '#285078', ${NOW}, ${NOW},
      ${new Date('2026-09-01T15:00:00.000Z')}
    )
  `;
  await transaction`
    insert into private.work_media_variants (
      asset_id, width, height, byte_size, content_hash, object_key
    ) values (${posterId}, 480, 720, 128, ${Buffer.alloc(32, 2)}, ${`media/${posterId}/480.webp`})
  `;
  await transaction`
    insert into private.work_draft_media (work_id, media_kind, position, asset_id, created_at)
    values (${workId}, 'poster', 1, ${posterId}, ${NOW})
  `;
}

function submitInput(overrides: Partial<ReturnType<typeof submitInputBase>> = {}) {
  return { ...submitInputBase(), ...overrides };
}

function submitInputBase() {
  return {
    actorAccountId: ACCOUNT_ID,
    expectedBasePublishedRevisionId: null,
    expectedDraftVersion: 3,
    idempotencyKey: key(1),
    now: NOW,
    submitterAttribution: { attributionName: 'ชื่อผู้ส่ง', studyYear: 2 },
    workPublicId: WORK_PUBLIC_ID,
  };
}

function withdrawInput(
  revisionPublicId: string,
  overrides: Partial<ReturnType<typeof withdrawInputBase>> = {},
) {
  return { ...withdrawInputBase(revisionPublicId), ...overrides };
}

function withdrawInputBase(revisionPublicId: string) {
  return {
    actorAccountId: ACCOUNT_ID,
    expectedRevisionVersion: 1,
    idempotencyKey: key(3),
    now: new Date(NOW.getTime() + 1_000),
    revisionPublicId,
    workPublicId: WORK_PUBLIC_ID,
  };
}

function key(index: number): string {
  return `73000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
}
