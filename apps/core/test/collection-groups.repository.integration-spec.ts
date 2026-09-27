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
const EXPIRED_STUDENT_PERSON_ID = '54000000-0000-4000-8000-000000000031';
const EXPIRED_STUDENT_ACCOUNT_ID = '54000000-0000-4000-8000-000000000032';
const EXPIRED_STUDENT_PROVIDER_USER_ID = '54000000-0000-4000-8000-000000000033';
const EARLIER_STUDENT_PERSON_ID = '54000000-0000-4000-8000-000000000041';
const EARLIER_STUDENT_ACCOUNT_ID = '54000000-0000-4000-8000-000000000042';
const EARLIER_STUDENT_PROVIDER_USER_ID = '54000000-0000-4000-8000-000000000043';
const MISSING_ROUND_ID = '54000000-0000-4000-8000-000000000099';
const STUDENT_ONE_ID_HASH = '54'.repeat(32);
const STUDENT_TWO_ID_HASH = '55'.repeat(32);
const EXPIRED_STUDENT_ID_HASH = '57'.repeat(32);
const UNKNOWN_ID_HASH = '56'.repeat(32);
// Student One has a recorded raw Student ID; Student Two predates the backfill.
const STUDENT_ONE_ID = '54000001';
const SHARED_PREFIX_HASH = '5a'.repeat(32);
const STUDENT_ONE_ONLY_PREFIX_HASH = '5b'.repeat(32);
const NOW = new Date('2026-09-20T06:00:00.000Z');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
// A name token no other fixture uses, so list assertions ignore unrelated rows.
const NAME_TOKEN = 'คัดเลือกทดสอบ';
const PROVIDER_USER_IDS = [
  ACTOR_PROVIDER_USER_ID,
  STUDENT_ONE_PROVIDER_USER_ID,
  STUDENT_TWO_PROVIDER_USER_ID,
  EXPIRED_STUDENT_PROVIDER_USER_ID,
  EARLIER_STUDENT_PROVIDER_USER_ID,
];

let keySequence = 0;
function idempotencyKey(): string {
  keySequence += 1;
  return `54000000-0000-4000-9000-${String(keySequence).padStart(12, '0')}`;
}

describe('PostgresCollectionGroupsRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const repository = new PostgresCollectionGroupsRepository(database);
  let previousAcademicYear: number | null = null;

  beforeAll(async () => {
    await cleanup();
    const settings = await database.sql<{ current_academic_year: number | null }[]>`
      select current_academic_year from public.academic_settings where singleton = true
    `;
    previousAcademicYear = settings[0]?.current_academic_year ?? null;
    await database.sql.begin(async (transaction) => {
      await transaction`
        insert into public.people (id)
        values (${ACTOR_PERSON_ID}), (${STUDENT_ONE_PERSON_ID}), (${STUDENT_TWO_PERSON_ID}),
          (${EXPIRED_STUDENT_PERSON_ID}), (${EARLIER_STUDENT_PERSON_ID})
      `;
      await transaction`
        insert into public.students (person_id, entry_year, access_ends_academic_year)
        values (${STUDENT_ONE_PERSON_ID}, 2569, 2576), (${STUDENT_TWO_PERSON_ID}, 2569, 2576),
          (${EXPIRED_STUDENT_PERSON_ID}, 2560, 2567), (${EARLIER_STUDENT_PERSON_ID}, 2568, 2575)
      `;
      await transaction`
        insert into public.accounts (
          id, person_id, provider_user_id, credential_state, created_at, updated_at
        ) values
          (${ACTOR_ACCOUNT_ID}, ${ACTOR_PERSON_ID}, ${ACTOR_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${STUDENT_ONE_ACCOUNT_ID}, ${STUDENT_ONE_PERSON_ID}, ${STUDENT_ONE_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${STUDENT_TWO_ACCOUNT_ID}, ${STUDENT_TWO_PERSON_ID}, ${STUDENT_TWO_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${EXPIRED_STUDENT_ACCOUNT_ID}, ${EXPIRED_STUDENT_PERSON_ID}, ${EXPIRED_STUDENT_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW}),
          (${EARLIER_STUDENT_ACCOUNT_ID}, ${EARLIER_STUDENT_PERSON_ID}, ${EARLIER_STUDENT_PROVIDER_USER_ID}, 'set', ${NOW}, ${NOW})
      `;
      await transaction`
        insert into public.account_roles (account_id, role)
        values (${ACTOR_ACCOUNT_ID}, 'instructor'), (${STUDENT_ONE_ACCOUNT_ID}, 'student'),
          (${STUDENT_TWO_ACCOUNT_ID}, 'student'), (${EXPIRED_STUDENT_ACCOUNT_ID}, 'student'),
          (${EARLIER_STUDENT_ACCOUNT_ID}, 'student')
      `;
      await transaction`
        insert into private.person_names (person_id, first_name_th, last_name_th)
        values (${ACTOR_PERSON_ID}, 'ผู้สอน', 'ทดสอบ'),
          (${STUDENT_ONE_PERSON_ID}, ${`${NAME_TOKEN}ก`}, 'หนึ่ง'),
          (${STUDENT_TWO_PERSON_ID}, ${`${NAME_TOKEN}ข`}, 'สอง'),
          (${EXPIRED_STUDENT_PERSON_ID}, ${`${NAME_TOKEN}ค`}, 'สาม'),
          (${EARLIER_STUDENT_PERSON_ID}, ${`${NAME_TOKEN}ง`}, 'สี่')
      `;
      await transaction`
        insert into private.student_auth_identities (
          account_id, student_id_hash, synthetic_identity, student_id
        ) values
          (${STUDENT_ONE_ACCOUNT_ID}, ${STUDENT_ONE_ID_HASH}, ${`${STUDENT_ONE_ID_HASH}@auth.invalid`}, ${STUDENT_ONE_ID}),
          (${STUDENT_TWO_ACCOUNT_ID}, ${STUDENT_TWO_ID_HASH}, ${`${STUDENT_TWO_ID_HASH}@auth.invalid`}, null),
          (${EXPIRED_STUDENT_ACCOUNT_ID}, ${EXPIRED_STUDENT_ID_HASH}, ${`${EXPIRED_STUDENT_ID_HASH}@auth.invalid`}, null)
      `;
      await transaction`
        insert into private.student_id_search_prefixes (
          account_id, prefix_length, prefix_hash, created_at
        ) values
          (${STUDENT_ONE_ACCOUNT_ID}, 2, ${SHARED_PREFIX_HASH}, ${NOW}),
          (${STUDENT_TWO_ACCOUNT_ID}, 2, ${SHARED_PREFIX_HASH}, ${NOW}),
          (${STUDENT_ONE_ACCOUNT_ID}, 7, ${STUDENT_ONE_ONLY_PREFIX_HASH}, ${NOW})
      `;
      await transaction`
        update public.academic_settings set current_academic_year = 2569 where singleton = true
      `;
    });
  });

  afterAll(async () => {
    await cleanup();
    await database.sql`
      update public.academic_settings
      set current_academic_year = ${previousAcademicYear}
      where singleton = true
    `;
    await database.onApplicationShutdown();
  });

  const NO_FILTER = {
    entryYear: null,
    groupId: null,
    search: { kind: 'name' as const, name: NAME_TOKEN },
  };

  it('lists active Students by Entry Year, name, and Account with a resumable keyset', async () => {
    const firstPage = await repository.listStudents({
      ...NO_FILTER,
      afterAccountId: null,
      limit: 2,
    });
    expect(firstPage.map((student) => student.accountId)).toEqual([
      EXPIRED_STUDENT_ACCOUNT_ID,
      EARLIER_STUDENT_ACCOUNT_ID,
      STUDENT_ONE_ACCOUNT_ID,
    ]);
    expect(firstPage[0]).toEqual({
      accountId: EXPIRED_STUDENT_ACCOUNT_ID,
      entryYear: 2560,
      firstNameTh: `${NAME_TOKEN}ค`,
      lastNameTh: 'สาม',
      status: 'no_access',
      studentId: null,
    });

    const secondPage = await repository.listStudents({
      ...NO_FILTER,
      afterAccountId: EARLIER_STUDENT_ACCOUNT_ID,
      limit: 2,
    });
    expect(secondPage.map((student) => [student.accountId, student.status])).toEqual([
      [STUDENT_ONE_ACCOUNT_ID, 'selectable'],
      [STUDENT_TWO_ACCOUNT_ID, 'selectable'],
    ]);
  });

  it('filters by Entry Year and a partial name, treating LIKE wildcards literally', async () => {
    await expect(
      repository.listStudents({ ...NO_FILTER, afterAccountId: null, entryYear: 2569, limit: 50 }),
    ).resolves.toEqual([
      expect.objectContaining({ accountId: STUDENT_ONE_ACCOUNT_ID }),
      expect.objectContaining({ accountId: STUDENT_TWO_ACCOUNT_ID }),
    ]);
    await expect(
      repository.listStudents({
        ...NO_FILTER,
        afterAccountId: null,
        limit: 50,
        search: { kind: 'name', name: `${NAME_TOKEN}ข ส` },
      }),
    ).resolves.toEqual([expect.objectContaining({ accountId: STUDENT_TWO_ACCOUNT_ID })]);
    await expect(
      repository.listStudents({
        ...NO_FILTER,
        afterAccountId: null,
        limit: 50,
        search: { kind: 'name', name: `${NAME_TOKEN}%` },
      }),
    ).resolves.toEqual([]);
  });

  it('searches by Student ID prefix hash, including Accounts without a recorded raw value', async () => {
    const prefixMatches = await repository.listStudents({
      ...NO_FILTER,
      afterAccountId: null,
      limit: 50,
      search: { kind: 'student_id_prefix', prefixHash: SHARED_PREFIX_HASH, prefixLength: 2 },
    });
    expect(prefixMatches.map((student) => [student.accountId, student.studentId])).toEqual([
      [STUDENT_ONE_ACCOUNT_ID, STUDENT_ONE_ID],
      [STUDENT_TWO_ACCOUNT_ID, null],
    ]);
    // The same hash at a different length is a different prefix.
    await expect(
      repository.listStudents({
        ...NO_FILTER,
        afterAccountId: null,
        limit: 50,
        search: { kind: 'student_id_prefix', prefixHash: SHARED_PREFIX_HASH, prefixLength: 7 },
      }),
    ).resolves.toEqual([]);
    await expect(
      repository.listStudents({
        ...NO_FILTER,
        afterAccountId: null,
        limit: 50,
        search: {
          kind: 'student_id_prefix',
          prefixHash: STUDENT_ONE_ONLY_PREFIX_HASH,
          prefixLength: 7,
        },
      }),
    ).resolves.toEqual([expect.objectContaining({ accountId: STUDENT_ONE_ACCOUNT_ID })]);
    // Eight digits are a full Student ID, matched by its own hash.
    await expect(
      repository.listStudents({
        ...NO_FILTER,
        afterAccountId: null,
        limit: 50,
        search: { kind: 'student_id_prefix', prefixHash: STUDENT_TWO_ID_HASH, prefixLength: 8 },
      }),
    ).resolves.toEqual([expect.objectContaining({ accountId: STUDENT_TWO_ACCOUNT_ID })]);
    await expect(
      repository.countSelectableStudents({
        ...NO_FILTER,
        search: { kind: 'student_id_prefix', prefixHash: SHARED_PREFIX_HASH, prefixLength: 2 },
      }),
    ).resolves.toBe(2);
  });

  it('lists Entry Years that have Students and reads the Current Academic Year', async () => {
    await expect(repository.listEntryYears()).resolves.toEqual(
      expect.arrayContaining([2560, 2568, 2569]),
    );
    await expect(repository.findCurrentAcademicYear()).resolves.toBe(2569);
  });

  it('snapshots and counts only selectable matches', async () => {
    const snapshot = await repository.listSelectableStudentSnapshot({ ...NO_FILTER, limit: 10 });
    expect(snapshot.map((student) => student.accountId)).toEqual([
      EARLIER_STUDENT_ACCOUNT_ID,
      STUDENT_ONE_ACCOUNT_ID,
      STUDENT_TWO_ACCOUNT_ID,
    ]);
    await expect(repository.countSelectableStudents(NO_FILTER)).resolves.toBe(3);
  });

  it('resolves Student ID hashes to rows keyed by hash, omitting unknown ones', async () => {
    const resolved = await repository.findStudentsByIdHashes({
      groupId: null,
      studentIdHashes: [STUDENT_ONE_ID_HASH, EXPIRED_STUDENT_ID_HASH, UNKNOWN_ID_HASH],
    });
    expect([...resolved.keys()].sort()).toEqual(
      [EXPIRED_STUDENT_ID_HASH, STUDENT_ONE_ID_HASH].sort(),
    );
    expect(resolved.get(STUDENT_ONE_ID_HASH)).toMatchObject({
      status: 'selectable',
      studentId: STUDENT_ONE_ID,
    });
    expect(resolved.get(EXPIRED_STUDENT_ID_HASH)).toMatchObject({ status: 'no_access' });
  });

  it('creates a Group with members in one transaction and replays a repeated key', async () => {
    const round = await repository.createRound({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'รอบคัดเลือก',
      now: NOW,
    });
    const key = idempotencyKey();
    const input = {
      createdByAccountId: ACTOR_ACCOUNT_ID,
      idempotencyKey: key,
      memberAccountIds: [STUDENT_ONE_ACCOUNT_ID, STUDENT_TWO_ACCOUNT_ID],
      name: 'กลุ่มคัดเลือก',
      now: NOW,
      roundId: round.id,
    };

    const created = await repository.createGroupWithMembers(input);
    expect(created).toMatchObject({ outcome: 'created' });
    if (created.outcome !== 'created') throw new Error('expected created');
    await expect(repository.listGroupMembers(created.group.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membershipSource: 'instructor_selection',
          status: 'current',
          studentAccountId: STUDENT_ONE_ACCOUNT_ID,
          studentId: STUDENT_ONE_ID,
        }),
        expect.objectContaining({ studentAccountId: STUDENT_TWO_ACCOUNT_ID, studentId: null }),
      ]),
    );

    await expect(repository.createGroupWithMembers(input)).resolves.toEqual({
      group: created.group,
      outcome: 'replayed',
    });
    await expect(
      repository.createGroupWithMembers({ ...input, name: 'ชื่ออื่น' }),
    ).resolves.toEqual({ outcome: 'idempotency_conflict' });
    await expect(repository.listGroups(round.id)).resolves.toHaveLength(1);
  });

  it('writes nothing when a selected Student is no longer eligible', async () => {
    const round = await repository.createRound({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'รอบย้อนกลับ',
      now: NOW,
    });
    await expect(
      repository.createGroupWithMembers({
        createdByAccountId: ACTOR_ACCOUNT_ID,
        idempotencyKey: idempotencyKey(),
        memberAccountIds: [STUDENT_ONE_ACCOUNT_ID, EXPIRED_STUDENT_ACCOUNT_ID, MISSING_ROUND_ID],
        name: 'กลุ่มที่ไม่ควรเกิด',
        now: NOW,
        roundId: round.id,
      }),
    ).resolves.toEqual({
      accountIds: [EXPIRED_STUDENT_ACCOUNT_ID, MISSING_ROUND_ID],
      outcome: 'members_not_selectable',
    });
    await expect(repository.listGroups(round.id)).resolves.toEqual([]);

    const roundName = 'รอบที่ไม่ควรเกิด';
    await expect(
      repository.createRoundWithGroupAndMembers({
        createdByAccountId: ACTOR_ACCOUNT_ID,
        groupName: 'กลุ่มแรก',
        idempotencyKey: idempotencyKey(),
        memberAccountIds: [EXPIRED_STUDENT_ACCOUNT_ID],
        now: NOW,
        roundName,
      }),
    ).resolves.toEqual({
      accountIds: [EXPIRED_STUDENT_ACCOUNT_ID],
      outcome: 'members_not_selectable',
    });
    const rounds = await repository.listRounds();
    expect(rounds.some((listed) => listed.name === roundName)).toBe(false);
  });

  it('rejects create and add in a closed or missing Round', async () => {
    const round = await repository.createRound({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'รอบที่จะปิด',
      now: NOW,
    });
    const created = await repository.createGroupWithMembers({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      idempotencyKey: idempotencyKey(),
      memberAccountIds: [STUDENT_ONE_ACCOUNT_ID],
      name: 'กลุ่มก่อนปิด',
      now: NOW,
      roundId: round.id,
    });
    if (created.outcome !== 'created') throw new Error('expected created');
    await database.sql`update public.collection_rounds set status = 'closed' where id = ${round.id}`;

    await expect(
      repository.createGroupWithMembers({
        createdByAccountId: ACTOR_ACCOUNT_ID,
        idempotencyKey: idempotencyKey(),
        memberAccountIds: [STUDENT_TWO_ACCOUNT_ID],
        name: 'กลุ่มหลังปิด',
        now: NOW,
        roundId: round.id,
      }),
    ).resolves.toEqual({ outcome: 'round_closed' });
    await expect(
      repository.addMembers({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: created.group.id,
        memberAccountIds: [STUDENT_TWO_ACCOUNT_ID],
        now: NOW,
      }),
    ).resolves.toEqual({ outcome: 'round_closed' });
    await expect(repository.listGroupMembers(created.group.id)).resolves.toHaveLength(1);
    await expect(
      repository.createGroupWithMembers({
        createdByAccountId: ACTOR_ACCOUNT_ID,
        idempotencyKey: idempotencyKey(),
        memberAccountIds: [STUDENT_TWO_ACCOUNT_ID],
        name: 'กลุ่มไม่มีรอบ',
        now: NOW,
        roundId: MISSING_ROUND_ID,
      }),
    ).resolves.toEqual({ outcome: 'round_not_found' });
  });

  it('creates a Round with its first Group and members, replaying a repeated key', async () => {
    const input = {
      createdByAccountId: ACTOR_ACCOUNT_ID,
      groupName: 'กลุ่มพร้อมรอบ',
      idempotencyKey: idempotencyKey(),
      memberAccountIds: [STUDENT_ONE_ACCOUNT_ID],
      now: NOW,
      roundName: 'รอบพร้อมกลุ่ม',
    };
    const created = await repository.createRoundWithGroupAndMembers(input);
    if (created.outcome !== 'created') throw new Error('expected created');
    expect(created.group.roundId).toBe(created.round.id);
    await expect(repository.listGroupMembers(created.group.id)).resolves.toEqual([
      expect.objectContaining({ membershipSource: 'instructor_selection' }),
    ]);
    await expect(repository.createRoundWithGroupAndMembers(input)).resolves.toEqual({
      group: created.group,
      outcome: 'replayed',
      round: created.round,
    });
  });

  it('adds members with obligations for open forms and reports add-flow statuses', async () => {
    const round = await repository.createRound({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'รอบเพิ่มสมาชิก',
      now: NOW,
    });
    const created = await repository.createGroupWithMembers({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      idempotencyKey: idempotencyKey(),
      memberAccountIds: [STUDENT_ONE_ACCOUNT_ID, EARLIER_STUDENT_ACCOUNT_ID],
      name: 'กลุ่มเพิ่มสมาชิก',
      now: NOW,
      roundId: round.id,
    });
    if (created.outcome !== 'created') throw new Error('expected created');
    const groupId = created.group.id;
    const forms = await database.sql<{ id: string }[]>`
      insert into public.collection_forms
        (group_id, title, status, fields, created_by_account_id, created_at, opened_at)
      values
        (${groupId}, 'แบบฟอร์มเปิด', 'open', '[]'::jsonb, ${ACTOR_ACCOUNT_ID}, ${NOW}, ${NOW}),
        (${groupId}, 'แบบฟอร์มร่าง', 'draft', '[]'::jsonb, ${ACTOR_ACCOUNT_ID}, ${NOW}, null)
      returning id
    `;
    await repository.withdrawMember({
      actorAccountId: ACTOR_ACCOUNT_ID,
      groupId,
      now: NOW,
      reason: 'ถอนเพื่อทดสอบสถานะ',
      studentAccountId: EARLIER_STUDENT_ACCOUNT_ID,
    });

    const statuses = await repository.listStudents({
      ...NO_FILTER,
      afterAccountId: null,
      groupId,
      limit: 50,
    });
    expect(
      Object.fromEntries(statuses.map((student) => [student.accountId, student.status])),
    ).toEqual({
      [EARLIER_STUDENT_ACCOUNT_ID]: 'withdrawn_member',
      [EXPIRED_STUDENT_ACCOUNT_ID]: 'no_access',
      [STUDENT_ONE_ACCOUNT_ID]: 'current_member',
      [STUDENT_TWO_ACCOUNT_ID]: 'selectable',
    });
    await expect(
      repository.listSelectableStudentSnapshot({ ...NO_FILTER, groupId, limit: 10 }),
    ).resolves.toEqual([expect.objectContaining({ accountId: STUDENT_TWO_ACCOUNT_ID })]);

    await expect(
      repository.addMembers({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId,
        memberAccountIds: [STUDENT_TWO_ACCOUNT_ID, EARLIER_STUDENT_ACCOUNT_ID],
        now: NOW,
      }),
    ).resolves.toEqual({
      accountIds: [EARLIER_STUDENT_ACCOUNT_ID],
      outcome: 'members_not_selectable',
    });

    await expect(
      repository.addMembers({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId,
        memberAccountIds: [STUDENT_TWO_ACCOUNT_ID, STUDENT_ONE_ACCOUNT_ID],
        now: NOW,
      }),
    ).resolves.toEqual({ added: 1, alreadyMember: 1, outcome: 'added' });

    const obligations = await database.sql<{ form_id: string; student_account_id: string }[]>`
      select form_id, student_account_id from public.collection_obligations
      where form_id = any(${forms.map((form) => form.id)}::uuid[])
    `;
    expect(obligations).toEqual([
      { form_id: forms[0]!.id, student_account_id: STUDENT_TWO_ACCOUNT_ID },
    ]);
  });

  it('keeps historical membership sources valid alongside instructor_selection', async () => {
    const round = await repository.createRound({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'รอบแหล่งเดิม',
      now: NOW,
    });
    const created = await repository.createGroupWithMembers({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      idempotencyKey: idempotencyKey(),
      memberAccountIds: [STUDENT_ONE_ACCOUNT_ID],
      name: 'กลุ่มแหล่งเดิม',
      now: NOW,
      roundId: round.id,
    });
    if (created.outcome !== 'created') throw new Error('expected created');
    await database.sql`
      insert into public.collection_group_memberships
        (group_id, student_account_id, membership_source, added_by_account_id, added_at)
      values (${created.group.id}, ${STUDENT_TWO_ACCOUNT_ID}, 'entry_year', ${ACTOR_ACCOUNT_ID}, ${NOW})
    `;
    await expect(repository.listGroupMembers(created.group.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ membershipSource: 'entry_year' }),
        expect.objectContaining({ membershipSource: 'instructor_selection' }),
      ]),
    );
  });

  it('withdraws a member with a reason and is idempotent on retry', async () => {
    const round = await repository.createRound({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      name: 'รอบถอนสมาชิก',
      now: NOW,
    });
    const created = await repository.createGroupWithMembers({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      idempotencyKey: idempotencyKey(),
      memberAccountIds: [STUDENT_ONE_ACCOUNT_ID],
      name: 'กลุ่มถอนสมาชิก',
      now: NOW,
      roundId: round.id,
    });
    if (created.outcome !== 'created') throw new Error('expected created');
    const group = created.group;

    const withdrawn = await repository.withdrawMember({
      actorAccountId: ACTOR_ACCOUNT_ID,
      groupId: group.id,
      now: NOW,
      reason: 'ลาออกจากสถานศึกษา',
      studentAccountId: STUDENT_ONE_ACCOUNT_ID,
    });
    expect(withdrawn).toMatchObject({
      member: {
        status: 'withdrawn',
        studentId: STUDENT_ONE_ID,
        withdrawalReason: 'ลาออกจากสถานศึกษา',
      },
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

    await expect(
      repository.reinstateMember({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: group.id,
        now: new Date(NOW.getTime() + 2_000),
        reason: 'คืนสมาชิกเพื่อทดสอบ',
        studentAccountId: STUDENT_ONE_ACCOUNT_ID,
      }),
    ).resolves.toMatchObject({ outcome: 'reinstated', member: { status: 'current' } });
  });

  async function cleanup(): Promise<void> {
    await database.sql.begin(async (transaction) => {
      const actorAccounts = transaction`
        select id from public.accounts where provider_user_id = ${ACTOR_PROVIDER_USER_ID}
      `;
      await transaction`
        delete from private.collection_membership_audit_events
        where actor_account_id in (${actorAccounts})
      `;
      await transaction`
        delete from public.collection_obligations
        where form_id in (
          select id from public.collection_forms where created_by_account_id in (${actorAccounts})
        )
      `;
      await transaction`
        delete from public.collection_forms where created_by_account_id in (${actorAccounts})
      `;
      await transaction`
        delete from public.collection_group_memberships
        where group_id in (
          select id from public.collection_groups where created_by_account_id in (${actorAccounts})
        )
      `;
      await transaction`
        delete from public.collection_groups where created_by_account_id in (${actorAccounts})
      `;
      await transaction`
        delete from public.collection_rounds where created_by_account_id in (${actorAccounts})
      `;
      const accounts = await transaction<{ id: string; person_id: string }[]>`
        select id, person_id from public.accounts
        where provider_user_id = any(${PROVIDER_USER_IDS}::uuid[])
      `;
      const accountIds = accounts.map((account) => account.id);
      await transaction`
        delete from private.student_auth_identities where account_id = any(${accountIds}::uuid[])
      `;
      await transaction`delete from public.account_roles where account_id = any(${accountIds}::uuid[])`;
      await transaction`delete from public.accounts where id = any(${accountIds}::uuid[])`;
      for (const account of accounts) {
        await transaction`delete from private.person_names where person_id = ${account.person_id}`;
        await transaction`delete from public.students where person_id = ${account.person_id}`;
        await transaction`delete from public.people where id = ${account.person_id}`;
      }
    });
  }
});
