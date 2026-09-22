import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import { PostgresCollectionGroupsRepository } from '../src/modules/collection-groups/infrastructure/postgres-collection-groups.repository';

const ACTOR_PERSON_ID = '54000000-0000-4000-8000-000000000001';
const ACTOR_ACCOUNT_ID = '54000000-0000-4000-8000-000000000002';
const ACTOR_PROVIDER_USER_ID = '54000000-0000-4000-8000-000000000003';
const STUDENT_ONE_PERSON_ID = '54000000-0000-4000-8000-000000000011';
const STUDENT_ONE_ACCOUNT_ID = '54000000-0000-4000-8000-000000000012';
const STUDENT_ONE_PROVIDER_USER_ID = '54000000-0000-4000-8000-000000000013';
const STUDENT_TWO_PERSON_ID = '54000000-0000-4000-8000-000000000021';
const STUDENT_TWO_ACCOUNT_ID = '54000000-0000-4000-8000-000000000022';
const STUDENT_TWO_PROVIDER_USER_ID = '54000000-0000-4000-8000-000000000023';
const ENTRY_YEAR_STUDENT_PERSON_ID = '54000000-0000-4000-8000-000000000031';
const ENTRY_YEAR_STUDENT_ACCOUNT_ID = '54000000-0000-4000-8000-000000000032';
const ENTRY_YEAR_STUDENT_PROVIDER_USER_ID = '54000000-0000-4000-8000-000000000033';
const STUDENT_ONE_ID_HASH = '54'.repeat(32);
const STUDENT_TWO_ID_HASH = '55'.repeat(32);
const UNKNOWN_ID_HASH = '56'.repeat(32);
const NOW = new Date('2026-09-20T06:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ENTRY_YEAR = 2571;

describe('PostgresCollectionGroupsRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresCollectionGroupsRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql.begin(async (transaction) => {
      await transaction`
        insert into public.people (id)
        values (${ACTOR_PERSON_ID}), (${STUDENT_ONE_PERSON_ID}), (${STUDENT_TWO_PERSON_ID}),
          (${ENTRY_YEAR_STUDENT_PERSON_ID})
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${STUDENT_ONE_PERSON_ID}, 2569, 2576), (${STUDENT_TWO_PERSON_ID}, 2569, 2576),
          (${ENTRY_YEAR_STUDENT_PERSON_ID}, ${ENTRY_YEAR}, 2578)
      `;
      await transaction`
        insert into public.accounts (
          id, person_id, provider_user_id, credential_state, created_at, updated_at
        ) values
          (${ACTOR_ACCOUNT_ID}, ${ACTOR_PERSON_ID}, ${ACTOR_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${STUDENT_ONE_ACCOUNT_ID}, ${STUDENT_ONE_PERSON_ID}, ${STUDENT_ONE_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${STUDENT_TWO_ACCOUNT_ID}, ${STUDENT_TWO_PERSON_ID}, ${STUDENT_TWO_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${ENTRY_YEAR_STUDENT_ACCOUNT_ID}, ${ENTRY_YEAR_STUDENT_PERSON_ID}, ${ENTRY_YEAR_STUDENT_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW})
      `;
      await transaction`
        insert into public.account_roles (account_id, role)
        values (${ACTOR_ACCOUNT_ID}, 'instructor'), (${STUDENT_ONE_ACCOUNT_ID}, 'student'),
          (${STUDENT_TWO_ACCOUNT_ID}, 'student'), (${ENTRY_YEAR_STUDENT_ACCOUNT_ID}, 'student')
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th)
        values (${ACTOR_PERSON_ID}, 'ผู้สอน', 'ทดสอบ'),
          (${STUDENT_ONE_PERSON_ID}, 'สมชาย', 'หนึ่ง'),
          (${STUDENT_TWO_PERSON_ID}, 'สมหญิง', 'สอง'),
          (${ENTRY_YEAR_STUDENT_PERSON_ID}, 'สมปอง', 'สาม')
      `;
      await transaction`
        insert into private.student_auth_identities (account_id, student_id_hash, synthetic_identity)
        values
          (${STUDENT_ONE_ACCOUNT_ID}, ${STUDENT_ONE_ID_HASH}, ${`${STUDENT_ONE_ID_HASH}@auth.invalid`}),
          (${STUDENT_TWO_ACCOUNT_ID}, ${STUDENT_TWO_ID_HASH}, ${`${STUDENT_TWO_ID_HASH}@auth.invalid`})
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  it('creates a round and a group within it', async () => {
    const round = await repository.createRound({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'รอบทดสอบ',
      now: NOW,
    });
    expect(round).toMatchObject({ name: 'รอบทดสอบ', status: 'active' });

    const group = await repository.createGroup({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'กลุ่มทดสอบ',
      now: NOW,
      roundId: round.id,
    });
    expect(group).toMatchObject({ name: 'กลุ่มทดสอบ', roundId: round.id });

    await expect(repository.findGroup(group.id)).resolves.toEqual(group);
    await expect(repository.listGroups(round.id)).resolves.toEqual([group]);
  });

  it('adds members by Student ID, reports unknown IDs, and is idempotent on retry', async () => {
    const round = await repository.createRound({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'รอบ Student ID',
      now: NOW,
    });
    const group = await repository.createGroup({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'กลุ่ม Student ID',
      now: NOW,
      roundId: round.id,
    });

    const result = await repository.addMembersByStudentIdHashes({
      actorAccountId: ACTOR_ACCOUNT_ID,
      groupId: group.id,
      now: NOW,
      source: 'student_id_list',
      studentIdHashToOriginal: new Map([
        [STUDENT_ONE_ID_HASH, '10000001'],
        [STUDENT_TWO_ID_HASH, '10000002'],
        [UNKNOWN_ID_HASH, '99999999'],
      ]),
    });

    expect(result.unknownStudentIds).toEqual(['99999999']);
    expect(result.alreadyWithdrawnStudentIds).toEqual([]);
    expect(result.accepted.map((member) => member.studentAccountId).sort()).toEqual(
      [STUDENT_ONE_ACCOUNT_ID, STUDENT_TWO_ACCOUNT_ID].sort(),
    );

    const membersAfterFirstAdd = await repository.listGroupMembers(group.id);
    expect(membersAfterFirstAdd).toHaveLength(2);

    const retry = await repository.addMembersByStudentIdHashes({
      actorAccountId: ACTOR_ACCOUNT_ID,
      groupId: group.id,
      now: NOW,
      source: 'student_id_list',
      studentIdHashToOriginal: new Map([[STUDENT_ONE_ID_HASH, '10000001']]),
    });
    expect(retry.accepted).toHaveLength(1);
    await expect(repository.listGroupMembers(group.id)).resolves.toHaveLength(2);

    // Re-adding does not bypass the explicit reinstatement action and reason.
    await repository.withdrawMember({
      actorAccountId: ACTOR_ACCOUNT_ID,
      groupId: group.id,
      now: NOW,
      reason: 'ทดสอบการถอนก่อนเพิ่มซ้ำ',
      studentAccountId: STUDENT_ONE_ACCOUNT_ID,
    });
    const reAddAttempt = await repository.addMembersByStudentIdHashes({
      actorAccountId: ACTOR_ACCOUNT_ID,
      groupId: group.id,
      now: NOW,
      source: 'student_id_list',
      studentIdHashToOriginal: new Map([[STUDENT_ONE_ID_HASH, '10000001']]),
    });
    expect(reAddAttempt.accepted).toEqual([]);
    expect(reAddAttempt.alreadyWithdrawnStudentIds).toEqual(['10000001']);
    await expect(repository.listGroupMembers(group.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'withdrawn', studentAccountId: STUDENT_ONE_ACCOUNT_ID }),
      ]),
    );
    await expect(
      repository.reinstateMember({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: group.id,
        now: new Date(NOW.getTime() + 1_000),
        reason: 'คืนสมาชิกเพื่อทดสอบ',
        studentAccountId: STUDENT_ONE_ACCOUNT_ID,
      }),
    ).resolves.toMatchObject({ outcome: 'reinstated', member: { status: 'current' } });
  });

  it('adds members by Entry Year snapshot without becoming a live filter', async () => {
    const round = await repository.createRound({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'รอบปีเข้า',
      now: NOW,
    });
    const group = await repository.createGroup({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'กลุ่มปีเข้า',
      now: NOW,
      roundId: round.id,
    });

    const result = await repository.addMembersByEntryYear({
      actorAccountId: ACTOR_ACCOUNT_ID,
      entryYear: ENTRY_YEAR,
      groupId: group.id,
      now: NOW,
    });
    expect(result.alreadyWithdrawnCount).toBe(0);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({
      membershipSource: 'entry_year',
      studentAccountId: ENTRY_YEAR_STUDENT_ACCOUNT_ID,
    });
  });

  it('withdraws a member with a reason and is idempotent on retry', async () => {
    const round = await repository.createRound({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'รอบถอนสมาชิก',
      now: NOW,
    });
    const group = await repository.createGroup({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'กลุ่มถอนสมาชิก',
      now: NOW,
      roundId: round.id,
    });
    await repository.addMembersByStudentIdHashes({
      actorAccountId: ACTOR_ACCOUNT_ID,
      groupId: group.id,
      now: NOW,
      source: 'individual',
      studentIdHashToOriginal: new Map([[STUDENT_ONE_ID_HASH, '10000001']]),
    });

    const withdrawn = await repository.withdrawMember({
      actorAccountId: ACTOR_ACCOUNT_ID,
      groupId: group.id,
      now: NOW,
      reason: 'ลาออกจากสถานศึกษา',
      studentAccountId: STUDENT_ONE_ACCOUNT_ID,
    });
    expect(withdrawn).toMatchObject({
      member: { status: 'withdrawn', withdrawalReason: 'ลาออกจากสถานศึกษา' },
      outcome: 'withdrawn',
    });

    // A second withdrawal attempt against an already-withdrawn membership
    // must not overwrite the original actor/time/reason with this new one.
    const retried = await repository.withdrawMember({
      actorAccountId: ACTOR_ACCOUNT_ID,
      groupId: group.id,
      now: new Date(NOW.getTime() + 1_000),
      reason: 'เหตุผลอื่น',
      studentAccountId: STUDENT_ONE_ACCOUNT_ID,
    });
    expect(retried).toMatchObject({
      member: { status: 'withdrawn', withdrawalReason: 'ลาออกจากสถานศึกษา' },
      outcome: 'already_withdrawn',
    });

    await expect(
      repository.withdrawMember({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: group.id,
        now: NOW,
        reason: 'ไม่มีตัวตน',
        studentAccountId: STUDENT_TWO_ACCOUNT_ID,
      }),
    ).resolves.toEqual({ outcome: 'not_found' });
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      await transaction`
        delete from private.collection_membership_audit_events
        where actor_account_id in (
          select id from public.accounts where provider_user_id = ${ACTOR_PROVIDER_USER_ID}
        )
      `;
      await transaction`
        delete from public.collection_group_memberships
        where student_account_id in (
          select id from public.accounts
          where provider_user_id in (
            ${ACTOR_PROVIDER_USER_ID}, ${STUDENT_ONE_PROVIDER_USER_ID},
            ${STUDENT_TWO_PROVIDER_USER_ID}, ${ENTRY_YEAR_STUDENT_PROVIDER_USER_ID}
          )
        )
      `;
      await transaction`
        delete from public.collection_groups
        where created_by_account_id in (
          select id from public.accounts where provider_user_id = ${ACTOR_PROVIDER_USER_ID}
        )
      `;
      await transaction`
        delete from public.collection_rounds
        where created_by_account_id in (
          select id from public.accounts where provider_user_id = ${ACTOR_PROVIDER_USER_ID}
        )
      `;
      await transaction`
        delete from private.student_auth_identities
        where account_id in (
          select id from public.accounts
          where provider_user_id in (${STUDENT_ONE_PROVIDER_USER_ID}, ${STUDENT_TWO_PROVIDER_USER_ID})
        )
      `;
      await transaction`
        delete from public.account_roles
        where account_id in (
          select id from public.accounts
          where provider_user_id in (
            ${ACTOR_PROVIDER_USER_ID}, ${STUDENT_ONE_PROVIDER_USER_ID},
            ${STUDENT_TWO_PROVIDER_USER_ID}, ${ENTRY_YEAR_STUDENT_PROVIDER_USER_ID}
          )
        )
      `;
      const people = await transaction<{ person_id: string }[]>`
        select person_id from public.accounts
        where provider_user_id in (
          ${ACTOR_PROVIDER_USER_ID}, ${STUDENT_ONE_PROVIDER_USER_ID},
          ${STUDENT_TWO_PROVIDER_USER_ID}, ${ENTRY_YEAR_STUDENT_PROVIDER_USER_ID}
        )
      `;
      await transaction`
        delete from public.accounts
        where provider_user_id in (
          ${ACTOR_PROVIDER_USER_ID}, ${STUDENT_ONE_PROVIDER_USER_ID},
          ${STUDENT_TWO_PROVIDER_USER_ID}, ${ENTRY_YEAR_STUDENT_PROVIDER_USER_ID}
        )
      `;
      for (const person of people) {
        await transaction`delete from private.person_names where person_id = ${person.person_id}`;
        await transaction`delete from public.students where person_id = ${person.person_id}`;
        await transaction`delete from public.people where id = ${person.person_id}`;
      }
    });
  }
});
