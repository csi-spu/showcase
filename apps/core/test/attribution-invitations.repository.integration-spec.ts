import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresAttributionInvitationsRepository } from '../src/modules/works/infrastructure/postgres-attribution-invitations.repository';
import { PostgresWorksRepository } from '../src/modules/works/infrastructure/postgres-works.repository';

const SUBMITTER_PERSON_ID = '65000000-0000-4000-8000-000000000001';
const SUBMITTER_ACCOUNT_ID = '65000000-0000-4000-8000-000000000002';
const RECIPIENT_PERSON_ID = '65000000-0000-4000-8000-000000000003';
const RECIPIENT_ACCOUNT_ID = '65000000-0000-4000-8000-000000000004';
const OTHER_PERSON_ID = '65000000-0000-4000-8000-000000000005';
const OTHER_ACCOUNT_ID = '65000000-0000-4000-8000-000000000006';
const WORK_ID = '65000000-0000-4000-8000-000000000007';
const WORK_PUBLIC_ID = '65000000-0000-4000-8000-000000000008';
const LIMIT_WORK_ID = '65000000-0000-4000-8000-000000000009';
const LIMIT_WORK_PUBLIC_ID = '65000000-0000-4000-8000-000000000010';
const STUDENT_ID_HASH = 'a'.repeat(64);
const SOURCE_HASH = 'b'.repeat(64);
const NOW = new Date('2026-08-25T10:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('PostgresAttributionInvitationsRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresAttributionInvitationsRepository(database);
  const works = new PostgresWorksRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`
        insert into public.people (id) values
          (${SUBMITTER_PERSON_ID}), (${RECIPIENT_PERSON_ID}), (${OTHER_PERSON_ID})
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year) values
          (${SUBMITTER_PERSON_ID}, 2566, 2573),
          (${RECIPIENT_PERSON_ID}, 2565, 2572),
          (${OTHER_PERSON_ID}, 2565, 2572)
      `;
      await transaction`
        insert into public.accounts (id, person_id, provider_user_id, credential_state) values
          (${SUBMITTER_ACCOUNT_ID}, ${SUBMITTER_PERSON_ID}, ${'65000000-0000-4000-8000-000000000011'}, 'set'),
          (${RECIPIENT_ACCOUNT_ID}, ${RECIPIENT_PERSON_ID}, ${'65000000-0000-4000-8000-000000000012'}, 'set'),
          (${OTHER_ACCOUNT_ID}, ${OTHER_PERSON_ID}, ${'65000000-0000-4000-8000-000000000013'}, 'set')
      `;
      await transaction`
        insert into public.account_roles (account_id, role) values
          (${SUBMITTER_ACCOUNT_ID}, 'student'),
          (${RECIPIENT_ACCOUNT_ID}, 'student'),
          (${OTHER_ACCOUNT_ID}, 'student')
      `;
      await transaction`
        insert into private.student_auth_identities (
          account_id, student_id_hash, synthetic_identity, created_at
        ) values (
          ${RECIPIENT_ACCOUNT_ID}, ${STUDENT_ID_HASH}, ${`${STUDENT_ID_HASH}@auth.invalid`}, ${NOW}
        )
      `;
      await transaction`
        insert into public.works (
          id, public_id, submitter_person_id, activity_state, publication_state, created_at, updated_at
        ) values
          (${WORK_ID}, ${WORK_PUBLIC_ID}, ${SUBMITTER_PERSON_ID}, 'active', 'never_published', ${NOW}, ${NOW}),
          (${LIMIT_WORK_ID}, ${LIMIT_WORK_PUBLIC_ID}, ${SUBMITTER_PERSON_ID}, 'active', 'never_published', ${NOW}, ${NOW})
      `;
      await transaction`
        insert into private.work_drafts (
          work_id, title, summary, description, category, academic_year, semester, created_at, updated_at
        ) values
          (${WORK_ID}, 'ผลงาน', 'สรุป', 'รายละเอียด', 'course_work', 2569, '1', ${NOW}, ${NOW}),
          (${LIMIT_WORK_ID}, 'ผลงาน', 'สรุป', 'รายละเอียด', 'course_work', 2569, '1', ${NOW}, ${NOW})
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('uses generic private lookup, authorizes the correct Account, and emits one safe event', async () => {
    const created = await repository.createAccountInvitation({
      actorAccountId: SUBMITTER_ACCOUNT_ID,
      idempotencyKey: key(1),
      now: NOW,
      publicId: WORK_PUBLIC_ID,
      sourceKeyHash: SOURCE_HASH,
      studentIdHash: STUDENT_ID_HASH,
    });
    expect(created).toEqual({ outcome: 'created' });
    await expect(
      repository.createAccountInvitation({
        actorAccountId: SUBMITTER_ACCOUNT_ID,
        idempotencyKey: key(2),
        now: NOW,
        publicId: WORK_PUBLIC_ID,
        sourceKeyHash: SOURCE_HASH,
        studentIdHash: 'c'.repeat(64),
      }),
    ).resolves.toEqual({ outcome: 'not_eligible' });

    const received = await repository.listReceivedInvitations(
      RECIPIENT_ACCOUNT_ID,
      20,
      undefined,
      NOW,
    );
    expect(received.items).toHaveLength(1);
    expect(JSON.stringify(received)).not.toMatch(/studentId|accountId|personId/i);
    const invitation = received.items[0]!;
    await expect(
      repository.acceptAccountInvitation({
        actorAccountId: OTHER_ACCOUNT_ID,
        attribution: { attributionName: 'คนอื่น', kind: 'account', studyYear: 2 },
        expectedVersion: 1,
        idempotencyKey: key(3),
        invitationPublicId: invitation.publicId,
        now: NOW,
      }),
    ).resolves.toEqual({ outcome: 'not_found' });
    await expect(
      repository.acceptAccountInvitation({
        actorAccountId: RECIPIENT_ACCOUNT_ID,
        attribution: { attributionName: 'ผู้รับคำเชิญ', kind: 'account', studyYear: 4 },
        expectedVersion: 1,
        idempotencyKey: key(4),
        invitationPublicId: invitation.publicId,
        now: NOW,
      }),
    ).resolves.toEqual({ outcome: 'accepted' });
    await expect(works.findOwnedDraft(RECIPIENT_ACCOUNT_ID, WORK_PUBLIC_ID)).resolves.toBeNull();

    const events = await database.sql<Array<{ event_type: string; payload: unknown }>>`
      select event_type, payload from private.outbox_events
      where aggregate_type = 'attribution_invitation'
      order by event_type
    `;
    expect(events.map((event) => event.event_type)).toEqual([
      'attribution_invitation_accepted',
      'attribution_invitation_created',
    ]);
    expect(JSON.stringify(events)).not.toMatch(/690000|studentId|student_id/i);
    await expect(
      database.sql.begin(async (transaction) => {
        await transaction`set local role anon`;
        await transaction`select * from private.attribution_invitations`;
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('exchanges an external secret once, stores only hashes, and creates no Account capability', async () => {
    const created = await repository.createExternalInvitation({
      actorAccountId: SUBMITTER_ACCOUNT_ID,
      attributionName: 'Alex Example',
      contributionRole: 'ที่ปรึกษา',
      expiresAt: new Date('2026-09-08T10:00:00.000Z'),
      idempotencyKey: key(5),
      invitationTokenHash: 'd'.repeat(64),
      now: NOW,
      publicId: WORK_PUBLIC_ID,
    });
    if (!('invitation' in created)) throw new Error('EXTERNAL_INVITATION_CREATE_FAILED');
    const exchanged = await repository.exchangeExternalToken({
      invitationSessionHash: 'e'.repeat(64),
      invitationTokenHash: 'd'.repeat(64),
      now: NOW,
      sessionExpiresAt: new Date('2026-08-25T10:30:00.000Z'),
    });
    expect(exchanged).toMatchObject({ outcome: 'exchanged' });
    await expect(
      repository.findExternalSessionInvitation('e'.repeat(64), NOW),
    ).resolves.toMatchObject({ publicId: created.invitation.publicId, state: 'pending' });
    await expect(
      repository.exchangeExternalToken({
        invitationSessionHash: 'f'.repeat(64),
        invitationTokenHash: 'd'.repeat(64),
        now: NOW,
        sessionExpiresAt: new Date('2026-08-25T10:30:00.000Z'),
      }),
    ).resolves.toEqual({ outcome: 'invalid_or_expired' });
    await expect(
      repository.acceptExternalInvitation({
        attribution: {
          attributionName: 'Alex Example',
          contributionRole: 'ที่ปรึกษา',
          kind: 'external',
        },
        expectedVersion: 1,
        idempotencyKey: key(6),
        invitationSessionHash: 'e'.repeat(64),
        now: NOW,
        recoveryCodeHash: '1'.repeat(64),
      }),
    ).resolves.toEqual({ outcome: 'accepted' });

    const persisted = await database.sql<
      Array<{ account_count: number; recovery_code_hash: string; token_hash: string }>
    >`
      select invitation.invitation_token_hash as token_hash,
        invitation.recovery_code_hash,
        (select count(*)::integer from public.accounts where person_id = invitation.accepted_person_id) as account_count
      from private.attribution_invitations as invitation
      where invitation.public_id = ${created.invitation.publicId}
    `;
    expect(persisted).toEqual([
      { account_count: 0, recovery_code_hash: '1'.repeat(64), token_hash: 'd'.repeat(64) },
    ]);
  });

  it('serializes concurrent retries with one idempotency key into one invitation', async () => {
    const input = {
      actorAccountId: SUBMITTER_ACCOUNT_ID,
      attributionName: 'ผู้ร่วมที่ส่งคำขอซ้ำ',
      contributionRole: 'ผู้ทดสอบ',
      expiresAt: new Date('2026-09-08T10:00:00.000Z'),
      idempotencyKey: key(7),
      invitationTokenHash: '2'.repeat(64),
      now: NOW,
      publicId: WORK_PUBLIC_ID,
    };
    const outcomes = await Promise.all([
      repository.createExternalInvitation(input),
      repository.createExternalInvitation(input),
    ]);
    expect(outcomes.map((outcome) => outcome.outcome).sort()).toEqual(['created', 'replayed']);
    const count = await database.sql<Array<{ count: number }>>`
      select count(*)::integer as count
      from private.attribution_invitations
      where work_id = ${WORK_ID} and proposed_attribution_name = ${input.attributionName}
    `;
    expect(count).toEqual([{ count: 1 }]);
  });

  it('expires pending invitations with the supplied clock and records the event atomically', async () => {
    await expect(
      repository.createAccountInvitation({
        actorAccountId: SUBMITTER_ACCOUNT_ID,
        idempotencyKey: key(8),
        now: NOW,
        publicId: WORK_PUBLIC_ID,
        sourceKeyHash: SOURCE_HASH,
        studentIdHash: STUDENT_ID_HASH,
      }),
    ).resolves.toEqual({ outcome: 'created' });
    const page = await repository.listReceivedInvitations(
      RECIPIENT_ACCOUNT_ID,
      20,
      undefined,
      new Date('2026-09-09T10:00:00.000Z'),
    );
    expect(page.items.some((item) => item.state === 'expired')).toBe(true);
    const events = await database.sql<Array<{ count: number }>>`
      select count(*)::integer as count from private.outbox_events
      where aggregate_type = 'attribution_invitation'
        and event_type = 'attribution_invitation_expired'
    `;
    expect(events).toEqual([{ count: 1 }]);
  });

  it('rate-limits private lookup independently by Account and source', async () => {
    await database.sql`delete from private.attribution_account_lookup_rate_limits`;
    await database.sql`delete from private.attribution_source_lookup_rate_limits`;
    const accountOutcomes = [];
    for (let index = 0; index < 11; index += 1) {
      accountOutcomes.push(
        await repository.createAccountInvitation({
          actorAccountId: OTHER_ACCOUNT_ID,
          idempotencyKey: key(100 + index),
          now: NOW,
          publicId: WORK_PUBLIC_ID,
          sourceKeyHash: (200 + index).toString(16).padStart(64, '0'),
          studentIdHash: '9'.repeat(64),
        }),
      );
    }
    expect(accountOutcomes.slice(0, 10).every((result) => result.outcome !== 'rate_limited')).toBe(
      true,
    );
    expect(accountOutcomes[10]).toEqual({ outcome: 'rate_limited' });

    await database.sql`delete from private.attribution_account_lookup_rate_limits`;
    await database.sql`delete from private.attribution_source_lookup_rate_limits`;
    const actors = [SUBMITTER_ACCOUNT_ID, RECIPIENT_ACCOUNT_ID, OTHER_ACCOUNT_ID];
    const sourceOutcomes = [];
    for (let index = 0; index < 11; index += 1) {
      sourceOutcomes.push(
        await repository.createAccountInvitation({
          actorAccountId: actors[index % actors.length]!,
          idempotencyKey: key(120 + index),
          now: NOW,
          publicId: WORK_PUBLIC_ID,
          sourceKeyHash: '8'.repeat(64),
          studentIdHash: '7'.repeat(64),
        }),
      );
    }
    expect(sourceOutcomes.slice(0, 10).every((result) => result.outcome !== 'rate_limited')).toBe(
      true,
    );
    expect(sourceOutcomes[10]).toEqual({ outcome: 'rate_limited' });
  });

  it('serializes concurrent creation at 20 active Contributors and cursor-paginates history', async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 21 }, (_, index) =>
        repository.createExternalInvitation({
          actorAccountId: SUBMITTER_ACCOUNT_ID,
          attributionName: `ผู้ร่วมผลงาน ${index + 1}`,
          contributionRole: 'ผู้ทดสอบ',
          expiresAt: new Date('2026-09-08T10:00:00.000Z'),
          idempotencyKey: key(20 + index),
          invitationTokenHash: (index + 10).toString(16).padStart(64, '0'),
          now: new Date(NOW.getTime() + index),
          publicId: LIMIT_WORK_PUBLIC_ID,
        }),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.outcome === 'created')).toHaveLength(20);
    expect(outcomes.filter((outcome) => outcome.outcome === 'active_limit_reached')).toHaveLength(
      1,
    );

    const first = await repository.listWorkInvitations(
      SUBMITTER_ACCOUNT_ID,
      LIMIT_WORK_PUBLIC_ID,
      7,
      undefined,
      NOW,
    );
    expect(first?.items).toHaveLength(7);
    expect(first?.nextCursor).not.toBeNull();
    const second = await repository.listWorkInvitations(
      SUBMITTER_ACCOUNT_ID,
      LIMIT_WORK_PUBLIC_ID,
      20,
      first?.nextCursor ?? undefined,
      NOW,
    );
    expect(second?.items).toHaveLength(13);
    expect(
      new Set([...(first?.items ?? []), ...(second?.items ?? [])].map((item) => item.publicId))
        .size,
    ).toBe(20);
  });

  async function cleanup() {
    await database.sql.begin(async (transaction) => {
      await transaction`
        delete from private.outbox_events where aggregate_type = 'attribution_invitation'
      `;
      await transaction`
        delete from private.attribution_invitation_operations
        where actor_account_id in (${SUBMITTER_ACCOUNT_ID}, ${RECIPIENT_ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})
          or invitation_id in (
            select id from private.attribution_invitations
            where work_id in (${WORK_ID}, ${LIMIT_WORK_ID})
          )
      `;
      await transaction`
        delete from private.attribution_account_lookup_rate_limits
        where actor_account_id in (${SUBMITTER_ACCOUNT_ID}, ${RECIPIENT_ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})
      `;
      await transaction`delete from private.attribution_source_lookup_rate_limits`;
      const externalPeople = await transaction<Array<{ accepted_person_id: string }>>`
        select accepted_person_id from private.attribution_invitations
        where work_id in (${WORK_ID}, ${LIMIT_WORK_ID}) and kind = 'external'
          and accepted_person_id is not null
      `;
      await transaction`
        delete from private.attribution_invitations where work_id in (${WORK_ID}, ${LIMIT_WORK_ID})
      `;
      await transaction`delete from public.works where id in (${WORK_ID}, ${LIMIT_WORK_ID})`;
      await transaction`
        delete from private.student_auth_identities
        where account_id in (${SUBMITTER_ACCOUNT_ID}, ${RECIPIENT_ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})
      `;
      await transaction`
        delete from public.account_roles
        where account_id in (${SUBMITTER_ACCOUNT_ID}, ${RECIPIENT_ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})
      `;
      await transaction`
        delete from public.accounts
        where id in (${SUBMITTER_ACCOUNT_ID}, ${RECIPIENT_ACCOUNT_ID}, ${OTHER_ACCOUNT_ID})
      `;
      await transaction`
        delete from public.students
        where person_id in (${SUBMITTER_PERSON_ID}, ${RECIPIENT_PERSON_ID}, ${OTHER_PERSON_ID})
      `;
      for (const person of externalPeople) {
        await transaction`delete from public.people where id = ${person.accepted_person_id}`;
      }
      await transaction`
        delete from public.people
        where id in (${SUBMITTER_PERSON_ID}, ${RECIPIENT_PERSON_ID}, ${OTHER_PERSON_ID})
      `;
    });
  }
});

function key(index: number): string {
  return `65000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
}
