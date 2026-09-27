import type { Clock, IdentityProtector } from '../../auth/application/auth.ports';
import { CollectionGroupsService } from './collection-groups.service';
import { CollectionGroupsError } from './collection-groups.ports';
import type {
  AddMembersResult,
  CollectionGroup,
  CollectionGroupsRepository,
  CollectionRound,
  CreateGroupWithMembersResult,
  CreateRoundWithGroupAndMembersResult,
  GroupMember,
  ReinstateMemberResult,
  SelectableStudent,
  StudentSelectionFilter,
  WithdrawMemberResult,
} from './collection-groups.ports';

const NOW = new Date('2026-09-20T06:00:00.000Z');
const ACTOR_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const ROUND_ID = '20000000-0000-4000-8000-000000000001';
const GROUP_ID = '30000000-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = '50000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT_ID = '40000000-0000-4000-8000-000000000001';
const OTHER_STUDENT_ACCOUNT_ID = '40000000-0000-4000-8000-000000000002';

const ROUND: CollectionRound = { createdAt: NOW, id: ROUND_ID, name: 'รอบทดสอบ', status: 'active' };
const GROUP: CollectionGroup = {
  createdAt: NOW,
  id: GROUP_ID,
  name: 'กลุ่มทดสอบ',
  roundId: ROUND_ID,
};
const MEMBER: GroupMember = {
  addedAt: NOW,
  entryYear: 2569,
  firstNameTh: 'สมชาย',
  lastNameTh: 'ใจดี',
  membershipSource: 'instructor_selection',
  status: 'current',
  studentAccountId: STUDENT_ACCOUNT_ID,
  studentId: '69000001',
  withdrawalReason: null,
  withdrawnAt: null,
};
const STUDENT: SelectableStudent = {
  accountId: STUDENT_ACCOUNT_ID,
  entryYear: 2569,
  firstNameTh: 'สมชาย',
  lastNameTh: 'ใจดี',
  status: 'selectable',
  studentId: '69000001',
};

function student(index: number, status: SelectableStudent['status'] = 'selectable') {
  return {
    ...STUDENT,
    accountId: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    status,
  };
}

class FakeRepository implements CollectionGroupsRepository {
  addMembersResult: AddMembersResult = { added: 1, alreadyMember: 0, outcome: 'added' };
  createGroupResult: CreateGroupWithMembersResult = { group: GROUP, outcome: 'created' };
  createRoundWithGroupResult: CreateRoundWithGroupAndMembersResult = {
    group: GROUP,
    outcome: 'created',
    round: ROUND,
  };
  currentAcademicYear: number | null = 2569;
  entryYears = [2568, 2569];
  group: CollectionGroup | null = GROUP;
  matchingCount = 0;
  members: GroupMember[] = [MEMBER];
  round: CollectionRound | null = ROUND;
  reinstateMemberResult: ReinstateMemberResult = {
    member: MEMBER,
    outcome: 'reinstated',
  };
  snapshot: SelectableStudent[] = [STUDENT];
  students: SelectableStudent[] = [STUDENT];
  studentsByHash = new Map<string, SelectableStudent>();
  withdrawMemberResult: WithdrawMemberResult = {
    member: { ...MEMBER, status: 'withdrawn' },
    outcome: 'withdrawn',
  };

  addMembers(): Promise<AddMembersResult> {
    return Promise.resolve(this.addMembersResult);
  }

  countSelectableStudents(): Promise<number> {
    return Promise.resolve(this.matchingCount);
  }

  createGroupWithMembers(): Promise<CreateGroupWithMembersResult> {
    return Promise.resolve(this.createGroupResult);
  }

  createRound(): Promise<CollectionRound> {
    return Promise.resolve(ROUND);
  }

  createRoundWithGroupAndMembers(): Promise<CreateRoundWithGroupAndMembersResult> {
    return Promise.resolve(this.createRoundWithGroupResult);
  }

  findCurrentAcademicYear(): Promise<number | null> {
    return Promise.resolve(this.currentAcademicYear);
  }

  findGroup(): Promise<CollectionGroup | null> {
    return Promise.resolve(this.group);
  }

  findRound(): Promise<CollectionRound | null> {
    return Promise.resolve(this.round);
  }

  findStudentsByIdHashes(): Promise<Map<string, SelectableStudent>> {
    return Promise.resolve(this.studentsByHash);
  }

  listEntryYears(): Promise<number[]> {
    return Promise.resolve(this.entryYears);
  }

  listGroupMembers(): Promise<GroupMember[]> {
    return Promise.resolve(this.members);
  }

  listGroups(): Promise<CollectionGroup[]> {
    return Promise.resolve([GROUP]);
  }

  listRounds(): Promise<CollectionRound[]> {
    return Promise.resolve([ROUND]);
  }

  listSelectableStudentSnapshot(
    input: StudentSelectionFilter & { limit: number },
  ): Promise<SelectableStudent[]> {
    return Promise.resolve(this.snapshot.slice(0, input.limit));
  }

  listStudents(
    input: StudentSelectionFilter & { afterAccountId: string | null; limit: number },
  ): Promise<SelectableStudent[]> {
    return Promise.resolve(this.students.slice(0, input.limit + 1));
  }

  reinstateMember(): Promise<ReinstateMemberResult> {
    return Promise.resolve(this.reinstateMemberResult);
  }

  withdrawMember(): Promise<WithdrawMemberResult> {
    return Promise.resolve(this.withdrawMemberResult);
  }
}

const clock: Clock = { now: () => NOW };
const identityProtector: IdentityProtector = {
  hashAdminLogin: (value) => `admin-${value}`,
  hashSessionToken: (value) => `session-${value}`,
  hashSourceAddress: (value) => `source-${value}`,
  hashStudentId: (value) => `student-${value}`,
  toAdminSyntheticIdentity: (value) => `admin-${value}@admin.auth.invalid`,
  toSyntheticIdentity: (value) => `student-${value}@auth.invalid`,
};

function setup(repository = new FakeRepository()) {
  return { repository, service: new CollectionGroupsService(repository, clock, identityProtector) };
}

const NO_FILTER = { entryYear: null, groupId: null, query: null };
const NO_REPOSITORY_FILTER = { entryYear: null, groupId: null, search: null };

describe('CollectionGroupsService rounds and groups', () => {
  it('trims a Round name and rejects an empty or overlong one', async () => {
    const { service } = setup();
    await expect(
      service.createRound({ actorAccountId: ACTOR_ACCOUNT_ID, name: '  รอบ  ' }),
    ).resolves.toMatchObject({ id: ROUND_ID });
    for (const name of ['   ', 'x'.repeat(201)]) {
      await expect(service.createRound({ actorAccountId: ACTOR_ACCOUNT_ID, name })).rejects.toEqual(
        new CollectionGroupsError('ROUND_NAME_INVALID', 422),
      );
    }
  });

  it('rejects listing Groups or Group detail for an unknown identifier', async () => {
    const repository = new FakeRepository();
    repository.round = null;
    repository.group = null;
    await expect(setup(repository).service.listGroups(ROUND_ID)).rejects.toEqual(
      new CollectionGroupsError('ROUND_NOT_FOUND', 404),
    );
    await expect(setup(repository).service.getGroup(GROUP_ID)).rejects.toEqual(
      new CollectionGroupsError('GROUP_NOT_FOUND', 404),
    );
  });

  it('returns Group detail with members', async () => {
    await expect(setup().service.getGroup(GROUP_ID)).resolves.toEqual({
      group: GROUP,
      members: [MEMBER],
    });
  });
});

describe('CollectionGroupsService student selection list', () => {
  it('returns one page with an opaque cursor that resumes after its last Account', async () => {
    const repository = new FakeRepository();
    repository.students = [student(1), student(2), student(3)];
    const listStudents = jest.spyOn(repository, 'listStudents');
    const { service } = setup(repository);

    const firstPage = await service.listStudents({ ...NO_FILTER, cursor: null, limit: 2 });

    expect(firstPage).toMatchObject({
      hasCurrentAcademicYear: true,
      students: [student(1), student(2)],
    });
    expect(typeof firstPage.nextCursor).toBe('string');
    expect(firstPage.nextCursor).not.toContain(student(2).accountId);

    await service.listStudents({ ...NO_FILTER, cursor: firstPage.nextCursor, limit: 2 });
    expect(listStudents).toHaveBeenLastCalledWith({
      ...NO_REPOSITORY_FILTER,
      afterAccountId: student(2).accountId,
      limit: 2,
    });
  });

  it('ends pagination on the last page', async () => {
    await expect(
      setup().service.listStudents({ ...NO_FILTER, cursor: null, limit: 50 }),
    ).resolves.toMatchObject({ nextCursor: null, students: [STUDENT] });
  });

  it('rejects a cursor that does not decode to an Account', async () => {
    for (const cursor of ['not-a-cursor', Buffer.from('12345678').toString('base64url')]) {
      await expect(
        setup().service.listStudents({ ...NO_FILTER, cursor, limit: 50 }),
      ).rejects.toEqual(new CollectionGroupsError('STUDENT_CURSOR_INVALID', 422));
    }
  });

  it('normalizes the name query and treats blank as no filter', async () => {
    const repository = new FakeRepository();
    const listStudents = jest.spyOn(repository, 'listStudents');
    const { service } = setup(repository);

    await service.listStudents({ ...NO_FILTER, cursor: null, limit: 50, query: '  สม   ใจ ' });
    expect(listStudents).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: { kind: 'name', name: 'สม ใจ' } }),
    );
    await service.listStudents({ ...NO_FILTER, cursor: null, limit: 50, query: '   ' });
    expect(listStudents).toHaveBeenLastCalledWith(expect.objectContaining({ search: null }));
  });

  it('searches one to eight digits by Student ID prefix hash, never by the raw digits', async () => {
    const repository = new FakeRepository();
    const listStudents = jest.spyOn(repository, 'listStudents');
    const { service } = setup(repository);

    for (const query of ['6', ' 6601 ', '66012345']) {
      await service.listStudents({ ...NO_FILTER, cursor: null, limit: 50, query });
      const prefix = query.trim();
      expect(listStudents).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: {
            kind: 'student_id_prefix',
            prefixHash: `student-${prefix}`,
            prefixLength: prefix.length,
          },
        }),
      );
    }
    // Nine digits cannot be a Student ID prefix; it falls back to a name search that matches no one.
    await service.listStudents({ ...NO_FILTER, cursor: null, limit: 50, query: '660123456' });
    expect(listStudents).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: { kind: 'name', name: '660123456' } }),
    );
  });

  it('reports a missing Current Academic Year so the interface can explain why nobody is selectable', async () => {
    const repository = new FakeRepository();
    repository.currentAcademicYear = null;
    repository.students = [student(1, 'no_access')];
    await expect(
      setup(repository).service.listStudents({ ...NO_FILTER, cursor: null, limit: 50 }),
    ).resolves.toMatchObject({ hasCurrentAcademicYear: false });
  });

  it('rejects add-flow statuses for an unknown Group', async () => {
    const repository = new FakeRepository();
    repository.group = null;
    await expect(
      setup(repository).service.listStudents({
        ...NO_FILTER,
        cursor: null,
        groupId: GROUP_ID,
        limit: 50,
      }),
    ).rejects.toEqual(new CollectionGroupsError('GROUP_NOT_FOUND', 404));
  });
});

describe('CollectionGroupsService select all matching', () => {
  it('returns every selectable match within the remaining capacity', async () => {
    const repository = new FakeRepository();
    repository.snapshot = [student(1), student(2)];
    const snapshot = jest.spyOn(repository, 'listSelectableStudentSnapshot');

    await expect(
      setup(repository).service.selectAllMatching({
        ...NO_FILTER,
        entryYear: 2569,
        selectedCount: 1_998,
      }),
    ).resolves.toEqual([student(1), student(2)]);
    expect(snapshot).toHaveBeenCalledWith({ ...NO_REPOSITORY_FILTER, entryYear: 2569, limit: 3 });
  });

  it('rejects a match beyond the remaining capacity with the matching count, not a partial list', async () => {
    const repository = new FakeRepository();
    repository.snapshot = [student(1), student(2), student(3)];
    repository.matchingCount = 2_400;

    await expect(
      setup(repository).service.selectAllMatching({ ...NO_FILTER, selectedCount: 1_998 }),
    ).rejects.toMatchObject({
      code: 'SELECTION_LIMIT_EXCEEDED',
      details: { matchingCount: 2_400 },
      status: 422,
    });
  });
});

describe('CollectionGroupsService Student ID resolution', () => {
  it('maps each input position to a row or not_found without echoing Student IDs', async () => {
    const repository = new FakeRepository();
    repository.studentsByHash = new Map([
      ['student-65000001', student(1)],
      ['student-65000002', student(2, 'no_access')],
      ['student-65000003', student(3, 'current_member')],
    ]);

    const results = await setup(repository).service.resolveStudentIds({
      groupId: null,
      studentIds: ['65000001', '65000002', '65000009', '65000003'],
    });

    expect(results).toEqual([
      { outcome: 'matched', position: 0, student: student(1) },
      { outcome: 'no_access', position: 1, student: student(2, 'no_access') },
      { outcome: 'not_found', position: 2 },
      { outcome: 'matched', position: 3, student: student(3, 'current_member') },
    ]);
    expect(JSON.stringify(results)).not.toMatch(/6500000\d/);
  });

  it('rejects an empty or oversized chunk before hashing', async () => {
    const repository = new FakeRepository();
    const find = jest.spyOn(repository, 'findStudentsByIdHashes');
    for (const studentIds of [[], Array.from({ length: 501 }, () => '65000001')]) {
      await expect(
        setup(repository).service.resolveStudentIds({ groupId: null, studentIds }),
      ).rejects.toEqual(new CollectionGroupsError('STUDENT_ID_LIST_INVALID', 422));
    }
    expect(find).not.toHaveBeenCalled();
  });
});

describe('CollectionGroupsService create with members', () => {
  const createInput = {
    actorAccountId: ACTOR_ACCOUNT_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    memberAccountIds: [STUDENT_ACCOUNT_ID],
    name: '  กลุ่ม 1  ',
    roundId: ROUND_ID,
  };

  it('creates a Group with its members in one repository operation', async () => {
    const repository = new FakeRepository();
    const create = jest.spyOn(repository, 'createGroupWithMembers');

    await expect(setup(repository).service.createGroupWithMembers(createInput)).resolves.toEqual(
      GROUP,
    );
    expect(create).toHaveBeenCalledWith({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      memberAccountIds: [STUDENT_ACCOUNT_ID],
      name: 'กลุ่ม 1',
      now: NOW,
      roundId: ROUND_ID,
    });
  });

  it('returns the original Group when the same submission is replayed', async () => {
    const repository = new FakeRepository();
    repository.createGroupResult = { group: GROUP, outcome: 'replayed' };
    await expect(setup(repository).service.createGroupWithMembers(createInput)).resolves.toEqual(
      GROUP,
    );
  });

  it('rejects an empty, oversized, or duplicated member list before the repository', async () => {
    const repository = new FakeRepository();
    const create = jest.spyOn(repository, 'createGroupWithMembers');
    const oversized = Array.from({ length: 2_001 }, (_value, index) => student(index).accountId);
    for (const memberAccountIds of [[], oversized, [STUDENT_ACCOUNT_ID, STUDENT_ACCOUNT_ID]]) {
      await expect(
        setup(repository).service.createGroupWithMembers({ ...createInput, memberAccountIds }),
      ).rejects.toEqual(new CollectionGroupsError('MEMBER_LIST_INVALID', 422));
    }
    await expect(
      setup(repository).service.createGroupWithMembers({ ...createInput, name: '   ' }),
    ).rejects.toEqual(new CollectionGroupsError('GROUP_NAME_INVALID', 422));
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    [{ outcome: 'round_not_found' }, new CollectionGroupsError('ROUND_NOT_FOUND', 404)],
    [{ outcome: 'round_closed' }, new CollectionGroupsError('ROUND_CLOSED', 409)],
    [
      { outcome: 'idempotency_conflict' },
      new CollectionGroupsError('IDEMPOTENCY_KEY_CONFLICT', 409),
    ],
    [
      { accountIds: [OTHER_STUDENT_ACCOUNT_ID], outcome: 'members_not_selectable' },
      new CollectionGroupsError('MEMBER_NOT_SELECTABLE', 409, {
        accountIds: [OTHER_STUDENT_ACCOUNT_ID],
      }),
    ],
  ] as const)('maps %j to a stable error', async (result, error) => {
    const repository = new FakeRepository();
    repository.createGroupResult = result as CreateGroupWithMembersResult;
    await expect(setup(repository).service.createGroupWithMembers(createInput)).rejects.toEqual(
      error,
    );
  });

  it('creates a Round with its first Group and members, validating both names', async () => {
    const repository = new FakeRepository();
    const create = jest.spyOn(repository, 'createRoundWithGroupAndMembers');
    const { service } = setup(repository);
    const input = {
      actorAccountId: ACTOR_ACCOUNT_ID,
      groupName: '  กลุ่ม 1  ',
      idempotencyKey: IDEMPOTENCY_KEY,
      memberAccountIds: [STUDENT_ACCOUNT_ID],
      roundName: '  ภาคเรียน 1/2569  ',
    };

    await expect(service.createRoundWithGroupAndMembers(input)).resolves.toEqual({
      group: GROUP,
      round: ROUND,
    });
    expect(create).toHaveBeenCalledWith({
      createdByAccountId: ACTOR_ACCOUNT_ID,
      groupName: 'กลุ่ม 1',
      idempotencyKey: IDEMPOTENCY_KEY,
      memberAccountIds: [STUDENT_ACCOUNT_ID],
      now: NOW,
      roundName: 'ภาคเรียน 1/2569',
    });

    await expect(
      service.createRoundWithGroupAndMembers({ ...input, roundName: ' ' }),
    ).rejects.toEqual(new CollectionGroupsError('ROUND_NAME_INVALID', 422));
    repository.createRoundWithGroupResult = {
      accountIds: [STUDENT_ACCOUNT_ID],
      outcome: 'members_not_selectable',
    };
    await expect(service.createRoundWithGroupAndMembers(input)).rejects.toMatchObject({
      code: 'MEMBER_NOT_SELECTABLE',
      details: { accountIds: [STUDENT_ACCOUNT_ID] },
      status: 409,
    });
  });
});

describe('CollectionGroupsService add members', () => {
  const addInput = {
    actorAccountId: ACTOR_ACCOUNT_ID,
    groupId: GROUP_ID,
    memberAccountIds: [STUDENT_ACCOUNT_ID, OTHER_STUDENT_ACCOUNT_ID],
  };

  it('reports added members and those who became members concurrently', async () => {
    const repository = new FakeRepository();
    repository.addMembersResult = { added: 1, alreadyMember: 1, outcome: 'added' };
    await expect(setup(repository).service.addMembers(addInput)).resolves.toEqual({
      added: 1,
      alreadyMember: 1,
    });
  });

  it('rejects the whole request for an unknown Group, a closed Round, or an ineligible Student', async () => {
    const repository = new FakeRepository();
    repository.addMembersResult = { outcome: 'round_closed' };
    await expect(setup(repository).service.addMembers(addInput)).rejects.toEqual(
      new CollectionGroupsError('ROUND_CLOSED', 409),
    );
    repository.addMembersResult = {
      accountIds: [OTHER_STUDENT_ACCOUNT_ID],
      outcome: 'members_not_selectable',
    };
    await expect(setup(repository).service.addMembers(addInput)).rejects.toEqual(
      new CollectionGroupsError('MEMBER_NOT_SELECTABLE', 409, {
        accountIds: [OTHER_STUDENT_ACCOUNT_ID],
      }),
    );
    repository.group = null;
    await expect(setup(repository).service.addMembers(addInput)).rejects.toEqual(
      new CollectionGroupsError('GROUP_NOT_FOUND', 404),
    );
  });

  it('rejects a duplicated member list', async () => {
    await expect(
      setup().service.addMembers({
        ...addInput,
        memberAccountIds: [STUDENT_ACCOUNT_ID, STUDENT_ACCOUNT_ID],
      }),
    ).rejects.toEqual(new CollectionGroupsError('MEMBER_LIST_INVALID', 422));
  });
});

describe('CollectionGroupsService withdrawal', () => {
  it('rejects an invalid withdrawal reason before calling the repository', async () => {
    const repository = new FakeRepository();
    for (const reason of ['', '   ', 'x'.repeat(2_001)]) {
      await expect(
        setup(repository).service.withdrawMember({
          actorAccountId: ACTOR_ACCOUNT_ID,
          groupId: GROUP_ID,
          reason,
          studentAccountId: MEMBER.studentAccountId,
        }),
      ).rejects.toEqual(new CollectionGroupsError('WITHDRAWAL_REASON_INVALID', 422));
    }
  });

  it('rejects withdrawing a Student who is not a Group member', async () => {
    const repository = new FakeRepository();
    repository.withdrawMemberResult = { outcome: 'not_found' };
    await expect(
      setup(repository).service.withdrawMember({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: GROUP_ID,
        reason: 'เหตุผลที่ตรวจสอบได้',
        studentAccountId: MEMBER.studentAccountId,
      }),
    ).rejects.toEqual(new CollectionGroupsError('GROUP_MEMBER_NOT_FOUND', 404));
  });

  it('rejects withdrawing a Student who was already withdrawn, instead of silently discarding the new reason', async () => {
    const repository = new FakeRepository();
    repository.withdrawMemberResult = {
      member: { ...MEMBER, status: 'withdrawn', withdrawalReason: 'เหตุผลเดิม' },
      outcome: 'already_withdrawn',
    };
    await expect(
      setup(repository).service.withdrawMember({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: GROUP_ID,
        reason: 'เหตุผลใหม่ที่จะถูกละเลย',
        studentAccountId: MEMBER.studentAccountId,
      }),
    ).rejects.toEqual(new CollectionGroupsError('GROUP_MEMBER_ALREADY_WITHDRAWN', 409));
  });

  it('withdraws a member with a trimmed reason', async () => {
    await expect(
      setup().service.withdrawMember({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: GROUP_ID,
        reason: '  เหตุผลที่ตรวจสอบได้  ',
        studentAccountId: MEMBER.studentAccountId,
      }),
    ).resolves.toMatchObject({ status: 'withdrawn' });
  });
});

describe('CollectionGroupsService reinstatement', () => {
  it('requires a reason and restores a withdrawn member', async () => {
    const { service } = setup();
    await expect(
      service.reinstateMember({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: GROUP_ID,
        reason: '  กลับเข้าร่วม  ',
        studentAccountId: MEMBER.studentAccountId,
      }),
    ).resolves.toMatchObject({ status: 'current' });
    for (const reason of ['', '   ', 'x'.repeat(2_001)]) {
      await expect(
        service.reinstateMember({
          actorAccountId: ACTOR_ACCOUNT_ID,
          groupId: GROUP_ID,
          reason,
          studentAccountId: MEMBER.studentAccountId,
        }),
      ).rejects.toEqual(new CollectionGroupsError('REINSTATEMENT_REASON_INVALID', 422));
    }
  });

  it('rejects reinstating a missing or already-current member', async () => {
    const repository = new FakeRepository();
    repository.reinstateMemberResult = { outcome: 'not_found' };
    await expect(
      setup(repository).service.reinstateMember({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: GROUP_ID,
        reason: 'กลับเข้าร่วม',
        studentAccountId: MEMBER.studentAccountId,
      }),
    ).rejects.toEqual(new CollectionGroupsError('GROUP_MEMBER_NOT_FOUND', 404));
    repository.reinstateMemberResult = { outcome: 'already_current', member: MEMBER };
    await expect(
      setup(repository).service.reinstateMember({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: GROUP_ID,
        reason: 'กลับเข้าร่วม',
        studentAccountId: MEMBER.studentAccountId,
      }),
    ).rejects.toEqual(new CollectionGroupsError('GROUP_MEMBER_ALREADY_CURRENT', 409));
  });
});
