import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresPublicationRepository } from '../src/modules/works/infrastructure/postgres-publication.repository';
import { PostgresWorkRecoveryRepository } from '../src/modules/works/infrastructure/postgres-work-recovery.repository';
import { PostgresAttributionRemovalRepository } from '../src/modules/works/infrastructure/postgres-attribution-removal.repository';

const STUDENT_PERSON_ID = id(1);
const STUDENT_ACCOUNT_ID = id(2);
const STUDENT_PROVIDER_ID = id(3);
const CONTRIBUTOR_PERSON_ID = id(4);
const CONTRIBUTOR_ACCOUNT_ID = id(5);
const CONTRIBUTOR_PROVIDER_ID = id(6);
const ADMIN_PERSON_ID = id(7);
const ADMIN_ACCOUNT_ID = id(8);
const ADMIN_PROVIDER_ID = id(9);
const OTHER_PERSON_ID = id(10);
const OTHER_ACCOUNT_ID = id(11);
const OTHER_PROVIDER_ID = id(12);
const WORK_ID = id(13);
const WORK_PUBLIC_ID = id(14);
const REVISION_ID = id(15);
const REVISION_PUBLIC_ID = id(16);
const REVIEW_ID = id(17);
const REVIEW_KEY = id(18);
const TAG_ID = id(19);
const TAG_PUBLIC_ID = id(20);
const EXTERNAL_PERSON_ID = id(21);
const EXTERNAL_INVITATION_ID = id(22);
const EXTERNAL_SESSION_HASH = 'a'.repeat(64);
const NOW = new Date('2026-08-26T04:30:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresWorkRecoveryRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresWorkRecoveryRepository(database);
  const attributionRemoval = new PostgresAttributionRemovalRepository(database);
  const publication = new PostgresPublicationRepository(
    database,
    new ConfigService({ PUBLIC_MEDIA_ORIGIN: 'https://media.example.test' }),
  );

  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  afterEach(cleanup);
  afterAll(() => database.onApplicationShutdown());

  it('creates and cancels one current Removal Request without changing visibility', async () => {
    const created = await repository.createRemovalRequest({
      actorAccountId: STUDENT_ACCOUNT_ID,
      expectedWorkVersion: 1,
      idempotencyKey: id(30),
      now: NOW,
      reason: 'ต้องการหยุดเผยแพร่ผลงานชิ้นนี้',
      workPublicId: WORK_PUBLIC_ID,
    });
    expect(created).toMatchObject({
      outcome: 'created',
      request: { revisionPublicId: REVISION_PUBLIC_ID, state: 'pending', version: 1 },
    });
    await expect(publication.findPublicWork(WORK_PUBLIC_ID)).resolves.toMatchObject({
      title: 'ผลงานสำหรับทดสอบการกู้คืน',
    });
    await expect(
      repository.createRemovalRequest({
        actorAccountId: STUDENT_ACCOUNT_ID,
        expectedWorkVersion: 1,
        idempotencyKey: id(31),
        now: NOW,
        reason: 'คำขอซ้ำสำหรับ Revision เดียวกัน',
        workPublicId: WORK_PUBLIC_ID,
      }),
    ).resolves.toEqual({ outcome: 'state_conflict' });
    if (!('request' in created)) throw new Error('REQUEST_NOT_CREATED');
    await expect(
      repository.cancelRemovalRequest({
        actorAccountId: OTHER_ACCOUNT_ID,
        expectedVersion: 1,
        idempotencyKey: id(32),
        now: NOW,
        requestPublicId: created.request.publicId,
      }),
    ).resolves.toEqual({ outcome: 'not_found' });
    await expect(
      repository.cancelRemovalRequest({
        actorAccountId: STUDENT_ACCOUNT_ID,
        expectedVersion: 1,
        idempotencyKey: id(33),
        now: NOW,
        requestPublicId: created.request.publicId,
      }),
    ).resolves.toMatchObject({ outcome: 'resolved', request: { state: 'cancelled', version: 2 } });
    await expect(publication.findPublicWork(WORK_PUBLIC_ID)).resolves.not.toBeNull();
  });

  it('turns accepted External Contributor removal into an immutable pending correction', async () => {
    const created = await attributionRemoval.create({
      idempotencyKey: id(40),
      invitationSessionHash: EXTERNAL_SESSION_HASH,
      now: NOW,
      reason: 'ขอถอนชื่อผู้ร่วมผลงานออกจากหน้าสาธารณะ',
    });
    expect(created).toMatchObject({
      outcome: 'created',
      request: { attributionName: 'External Person', state: 'pending' },
    });
    if (!('request' in created)) throw new Error('ATTRIBUTION_REMOVAL_NOT_CREATED');
    await expect(publication.findPublicWork(WORK_PUBLIC_ID)).resolves.not.toBeNull();

    const accepted = await attributionRemoval.decide({
      actorAccountId: ADMIN_ACCOUNT_ID,
      decision: 'accept',
      decisionReason: null,
      expectedVersion: 1,
      idempotencyKey: id(41),
      now: new Date(NOW.getTime() + 1_000),
      requestPublicId: created.request.publicId,
    });
    expect(accepted).toMatchObject({ outcome: 'resolved', request: { state: 'accepted' } });
    const rows = await database.sql<
      Array<{ correction_count: number; original_count: number; pending_count: number }>
    >`
      select
        (select count(*)::integer from private.work_revision_attributions
          where revision_id = ${REVISION_ID} and person_id = ${EXTERNAL_PERSON_ID}) as original_count,
        (select count(*)::integer from private.work_revision_attributions as attribution
          join private.work_revisions as revision on revision.id = attribution.revision_id
          where revision.work_id = ${WORK_ID} and revision.author_kind = 'admin_correction'
            and attribution.person_id = ${EXTERNAL_PERSON_ID}) as correction_count,
        (select count(*)::integer from private.work_revisions
          where work_id = ${WORK_ID} and status = 'pending_review'
            and author_kind = 'admin_correction') as pending_count
    `;
    expect(rows[0]).toEqual({ correction_count: 0, original_count: 1, pending_count: 1 });
    const publicWork = await publication.findPublicWork(WORK_PUBLIC_ID);
    expect(
      publicWork?.attributions.some((item) => item.attributionName === 'External Person'),
    ).toBe(true);
    if (!('request' in accepted) || accepted.request.correctionRevisionPublicId === null) {
      throw new Error('ATTRIBUTION_CORRECTION_NOT_CREATED');
    }
    await repository.transition({
      actorAccountId: ADMIN_ACCOUNT_ID,
      expectedVersion: 1,
      idempotencyKey: id(42),
      now: new Date(NOW.getTime() + 2_000),
      operation: 'unpublish',
      reason: 'ระงับการเผยแพร่ก่อนอนุมัติ Revision แก้ไข',
      workPublicId: WORK_PUBLIC_ID,
    });
    await expect(
      publication.approveAndPublish({
        actorAccountId: ADMIN_ACCOUNT_ID,
        expectedRevisionVersion: 1,
        idempotencyKey: id(43),
        now: new Date(NOW.getTime() + 3_000),
        revisionPublicId: accepted.request.correctionRevisionPublicId,
      }),
    ).resolves.toMatchObject({ outcome: 'published' });
    const correctedPublicWork = await publication.findPublicWork(WORK_PUBLIC_ID);
    expect(
      correctedPublicWork?.attributions.some((item) => item.attributionName === 'External Person'),
    ).toBe(false);
    const tag = await database.sql<Array<{ active_work_count: number }>>`
      select active_work_count::integer from public.tags where id = ${TAG_ID}
    `;
    expect(tag[0]?.active_work_count).toBe(1);
  });

  it('approves a Removal Request atomically while retaining pointer, history, and audit', async () => {
    const created = await repository.createRemovalRequest({
      actorAccountId: STUDENT_ACCOUNT_ID,
      expectedWorkVersion: 1,
      idempotencyKey: id(34),
      now: NOW,
      reason: 'ต้องการหยุดเผยแพร่ผลงานชิ้นนี้',
      workPublicId: WORK_PUBLIC_ID,
    });
    if (!('request' in created)) throw new Error('REQUEST_NOT_CREATED');
    const input = {
      actorAccountId: ADMIN_ACCOUNT_ID,
      decision: 'approve' as const,
      decisionReason: null,
      expectedVersion: 1,
      expectedWorkVersion: 1,
      idempotencyKey: id(35),
      now: new Date(NOW.getTime() + 1_000),
      requestPublicId: created.request.publicId,
    };
    await expect(repository.decideRemovalRequest(input)).resolves.toMatchObject({
      outcome: 'resolved',
      request: { state: 'approved', version: 2 },
    });
    await expect(repository.decideRemovalRequest(input)).resolves.toMatchObject({
      outcome: 'replayed',
      request: { state: 'approved' },
    });
    await expect(publication.findPublicWork(WORK_PUBLIC_ID)).resolves.toBeNull();
    const rows = await database.sql<
      Array<{
        active_work_count: number;
        audit_count: number;
        event_payload: { cacheTargets: { workPublicId: string }; recipientAccountIds: string[] };
        publication_state: string;
        published_revision_id: string;
        request_count: number;
        review_count: number;
        version: string;
      }>
    >`
      select work.publication_state, work.published_revision_id, work.version,
        tag.active_work_count::integer,
        (select count(*)::integer from private.removal_requests where work_id = work.id) as request_count,
        (select count(*)::integer from private.work_recovery_audits where work_id = work.id) as audit_count,
        (select count(*)::integer from private.reviews where revision_id = work.published_revision_id) as review_count,
        (select payload from private.outbox_events
          where aggregate_type = 'removal_request' and aggregate_id = ${created.request.publicId}) as event_payload
      from public.works as work
      join public.tags as tag on tag.id = ${TAG_ID}
      where work.id = ${WORK_ID}
    `;
    expect(rows[0]?.active_work_count).toBe(0);
    expect(rows[0]?.audit_count).toBe(1);
    expect(rows[0]?.event_payload).toMatchObject({
      cacheTargets: { workPublicId: WORK_PUBLIC_ID },
      recipientAccountIds: [STUDENT_ACCOUNT_ID],
    });
    expect(rows[0]?.publication_state).toBe('unpublished');
    expect(rows[0]?.published_revision_id).toBe(REVISION_ID);
    expect(rows[0]?.request_count).toBe(1);
    expect(rows[0]?.review_count).toBe(1);
    expect(rows[0]?.version).toBe('2');
  });

  it('archives, restores active/private, then restores unchanged publication explicitly', async () => {
    await expect(
      repository.transition(transitionInput('archive', id(40), 1)),
    ).resolves.toMatchObject({
      outcome: 'transitioned',
      work: { activityState: 'archived', publicationState: 'unpublished', version: 2 },
    });
    await expect(publication.findPublicWork(WORK_PUBLIC_ID)).resolves.toBeNull();
    await expect(
      repository.transition(transitionInput('restore_publication', id(41), 2)),
    ).resolves.toEqual({ outcome: 'state_conflict' });
    await expect(
      repository.transition(transitionInput('restore_active', id(42), 2)),
    ).resolves.toMatchObject({
      work: { activityState: 'active', publicationState: 'unpublished', version: 3 },
    });
    await expect(publication.findPublicWork(WORK_PUBLIC_ID)).resolves.toBeNull();
    await expect(
      repository.transition(transitionInput('restore_publication', id(43), 3)),
    ).resolves.toMatchObject({
      work: {
        activityState: 'active',
        publicationState: 'published',
        publishedRevisionPublicId: REVISION_PUBLIC_ID,
        version: 4,
      },
    });
    await expect(publication.findPublicWork(WORK_PUBLIC_ID)).resolves.toMatchObject({
      revisionNumber: 1,
      title: 'ผลงานสำหรับทดสอบการกู้คืน',
    });
    const retained = await database.sql<
      Array<{ active_work_count: number; audits: number; revisions: number; reviews: number }>
    >`
      select tag.active_work_count::integer,
        (select count(*)::integer from private.work_recovery_audits where work_id = ${WORK_ID}) as audits,
        (select count(*)::integer from private.work_revisions where work_id = ${WORK_ID}) as revisions,
        (select count(*)::integer from private.reviews where revision_id = ${REVISION_ID}) as reviews
      from public.tags as tag where tag.id = ${TAG_ID}
    `;
    expect(retained).toEqual([{ active_work_count: 1, audits: 3, revisions: 1, reviews: 1 }]);
  });

  it('declines with retained reason and emits only a private decision intent', async () => {
    const created = await repository.createRemovalRequest({
      actorAccountId: STUDENT_ACCOUNT_ID,
      expectedWorkVersion: 1,
      idempotencyKey: id(44),
      now: NOW,
      reason: 'ต้องการหยุดเผยแพร่ผลงานชิ้นนี้',
      workPublicId: WORK_PUBLIC_ID,
    });
    if (!('request' in created)) throw new Error('REQUEST_NOT_CREATED');
    await expect(
      repository.decideRemovalRequest({
        actorAccountId: ADMIN_ACCOUNT_ID,
        decision: 'decline',
        decisionReason: 'ยังไม่มีเหตุผลเพียงพอให้นำออก',
        expectedVersion: 1,
        expectedWorkVersion: 1,
        idempotencyKey: id(45),
        now: NOW,
        requestPublicId: created.request.publicId,
      }),
    ).resolves.toMatchObject({
      request: { decisionReason: 'ยังไม่มีเหตุผลเพียงพอให้นำออก', state: 'declined' },
    });
    await expect(publication.findPublicWork(WORK_PUBLIC_ID)).resolves.not.toBeNull();
    const events = await database.sql<Array<{ payload: Record<string, unknown> }>>`
      select payload from private.outbox_events
      where aggregate_id = ${created.request.publicId} and event_type = 'removal_request_declined'
    `;
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      recipientAccountIds: [STUDENT_ACCOUNT_ID],
      type: 'removal_request_declined',
    });
    expect(JSON.stringify(events)).not.toMatch(/studentId|credential|token/i);
  });

  function transitionInput(
    operation: 'archive' | 'restore_active' | 'restore_publication' | 'unpublish',
    idempotencyKey: string,
    expectedVersion: number,
  ) {
    return {
      actorAccountId: ADMIN_ACCOUNT_ID,
      expectedVersion,
      idempotencyKey,
      now: NOW,
      operation,
      reason: 'เหตุผลที่บันทึกไว้สำหรับการกู้คืน',
      workPublicId: WORK_PUBLIC_ID,
    };
  }

  async function seed(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`insert into public.people (id) values
        (${STUDENT_PERSON_ID}), (${CONTRIBUTOR_PERSON_ID}), (${ADMIN_PERSON_ID}),
        (${OTHER_PERSON_ID}), (${EXTERNAL_PERSON_ID})`;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state) values
          (${STUDENT_ACCOUNT_ID}, ${STUDENT_PERSON_ID}, ${STUDENT_PROVIDER_ID}, 'set'),
          (${CONTRIBUTOR_ACCOUNT_ID}, ${CONTRIBUTOR_PERSON_ID}, ${CONTRIBUTOR_PROVIDER_ID}, 'set'),
          (${ADMIN_ACCOUNT_ID}, ${ADMIN_PERSON_ID}, ${ADMIN_PROVIDER_ID}, 'set'),
          (${OTHER_ACCOUNT_ID}, ${OTHER_PERSON_ID}, ${OTHER_PROVIDER_ID}, 'set')
      `;
      await transaction`
        insert into public.account_roles (account_id, role) values
          (${STUDENT_ACCOUNT_ID}, 'student'), (${CONTRIBUTOR_ACCOUNT_ID}, 'student'),
          (${ADMIN_ACCOUNT_ID}, 'admin'), (${OTHER_ACCOUNT_ID}, 'student')
      `;
      await transaction`
        insert into public.works (
          id, public_id, submitter_person_id, activity_state, publication_state,
          published_revision_id, version, created_at, updated_at
        ) values (
          ${WORK_ID}, ${WORK_PUBLIC_ID}, ${STUDENT_PERSON_ID}, 'active', 'published',
          null, 1, ${NOW}, ${NOW}
        )
      `;
      await transaction`
        insert into private.work_revisions (
          id, public_id, work_id, revision_number, status, draft_version, title, summary,
          description, category, academic_year, semester, submitted_at, version
        ) values (
          ${REVISION_ID}, ${REVISION_PUBLIC_ID}, ${WORK_ID}, 1, 'approved', 1,
          'ผลงานสำหรับทดสอบการกู้คืน', 'สรุปผลงาน', 'รายละเอียดผลงาน', 'course_work',
          2569, '1', ${NOW}, 2
        )
      `;
      await transaction`update public.works set published_revision_id = ${REVISION_ID} where id = ${WORK_ID}`;
      await transaction`
        insert into private.work_revision_attributions (
          revision_id, position, kind, person_id, attribution_name, study_year, contribution_role
        ) values
          (${REVISION_ID}, 1, 'submitter', ${STUDENT_PERSON_ID}, 'ผู้ส่งผลงาน', 2, null),
          (${REVISION_ID}, 2, 'account', ${CONTRIBUTOR_PERSON_ID}, 'ผู้ร่วมผลงาน', 3, null),
          (${REVISION_ID}, 3, 'external', ${EXTERNAL_PERSON_ID}, 'External Person', null, 'Advisor')
      `;
      await transaction`
        insert into private.attribution_invitations (
          id, work_id, kind, accepted_person_id, state, proposed_attribution_name,
          proposed_contribution_role, attribution_name, contribution_role,
          public_attribution_consented_at, invitation_token_hash, recovery_code_hash,
          expires_at, created_at, updated_at, resolved_at
        ) values (
          ${EXTERNAL_INVITATION_ID}, ${WORK_ID}, 'external', ${EXTERNAL_PERSON_ID}, 'accepted',
          'External Person', 'Advisor', 'External Person', 'Advisor', ${NOW},
          ${'b'.repeat(64)}, ${'c'.repeat(64)}, ${new Date(NOW.getTime() + 86_400_000)},
          ${NOW}, ${NOW}, ${NOW}
        )
      `;
      await transaction`
        insert into private.attribution_invitation_sessions
          (session_hash, invitation_id, expires_at, created_at)
        values (
          ${EXTERNAL_SESSION_HASH}, ${EXTERNAL_INVITATION_ID},
          ${new Date(NOW.getTime() + 1_800_000)}, ${NOW}
        )
      `;
      await transaction`
        insert into private.reviews (
          id, revision_id, actor_account_id, decision, expected_revision_version,
          resulting_revision_version, idempotency_key, request_payload, reviewed_at
        ) values (
          ${REVIEW_ID}, ${REVISION_ID}, ${ADMIN_ACCOUNT_ID}, 'approved', 1, 2,
          ${REVIEW_KEY}, '{}'::jsonb, ${NOW}
        )
      `;
      await transaction`
        insert into public.tags (
          id, public_id, normalized_identity, display_label, activated_at, active_work_count
        ) values (${TAG_ID}, ${TAG_PUBLIC_ID}, 'recovery', 'Recovery', ${NOW}, 1)
      `;
      await transaction`
        insert into private.published_revision_tags (revision_id, tag_id, position)
        values (${REVISION_ID}, ${TAG_ID}, 1)
      `;
      await transaction`
        insert into private.work_revision_tags (
          revision_id, position, display_label, normalized_identity
        ) values (${REVISION_ID}, 1, 'Recovery', 'recovery')
      `;
    });
  }

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`set local session_replication_role = replica`;
      await transaction`delete from private.attribution_removal_operations where request_id in (
        select id from private.attribution_removal_requests where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.attribution_removal_requests where work_id = ${WORK_ID}`;
      await transaction`delete from private.admin_correction_audits where work_id = ${WORK_ID}`;
      await transaction`delete from private.attribution_invitation_sessions where invitation_id = ${EXTERNAL_INVITATION_ID}`;
      await transaction`delete from private.attribution_invitations where id = ${EXTERNAL_INVITATION_ID}`;
      await transaction`delete from private.outbox_events where aggregate_id in (
        select public_id from private.work_recovery_audits where work_id = ${WORK_ID}
        union select public_id from private.removal_requests where work_id = ${WORK_ID}
        union select public_id from private.attribution_removal_requests where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.work_recovery_audits where work_id = ${WORK_ID}`;
      await transaction`delete from private.removal_request_operations where request_id in (
        select id from private.removal_requests where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.removal_requests where work_id = ${WORK_ID}`;
      await transaction`delete from private.published_revision_tags where revision_id = ${REVISION_ID}`;
      await transaction`delete from public.tags where id = ${TAG_ID}`;
      await transaction`delete from private.reviews where revision_id in (
        select id from private.work_revisions where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.work_revision_tags where revision_id in (
        select id from private.work_revisions where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.work_revision_attributions where revision_id in (
        select id from private.work_revisions where work_id = ${WORK_ID}
      )`;
      await transaction`delete from private.work_revisions where work_id = ${WORK_ID}`;
      await transaction`delete from public.works where id = ${WORK_ID}`;
      await transaction`delete from public.account_roles where account_id in (
        ${STUDENT_ACCOUNT_ID}, ${CONTRIBUTOR_ACCOUNT_ID}, ${ADMIN_ACCOUNT_ID}, ${OTHER_ACCOUNT_ID}
      )`;
      await transaction`delete from public.accounts where id in (
        ${STUDENT_ACCOUNT_ID}, ${CONTRIBUTOR_ACCOUNT_ID}, ${ADMIN_ACCOUNT_ID}, ${OTHER_ACCOUNT_ID}
      )`;
      await transaction`delete from public.people where id in (
        ${STUDENT_PERSON_ID}, ${CONTRIBUTOR_PERSON_ID}, ${ADMIN_PERSON_ID},
        ${OTHER_PERSON_ID}, ${EXTERNAL_PERSON_ID}
      )`;
    });
  }
});

function id(value: number): string {
  return `97000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}
