import type { Clock, IdentityProtector } from '../../auth/application/auth.ports';
import { CollectionGroupsService } from './collection-groups.service';
import { CollectionGroupsError } from './collection-groups.ports';
import type {
  AddMembersByEntryYearResult,
  AddMembersResult,
  CollectionGroup,
  CollectionGroupsRepository,
  CollectionRound,
  GroupMember,
  WithdrawMemberResult,
  ReinstateMemberResult,
} from './collection-groups.ports';

const NOW = new Date('2026-09-20T06:00:00.000Z');
const ACTOR_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const ROUND_ID = '20000000-0000-4000-8000-000000000001';
const GROUP_ID = '30000000-0000-4000-8000-000000000001';

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
  membershipSource: 'individual',
  status: 'current',
  studentAccountId: '40000000-0000-4000-8000-000000000001',
  withdrawalReason: null,
  withdrawnAt: null,
};

class FakeRepository implements CollectionGroupsRepository {
  addMembersByEntryYearResult: AddMembersByEntryYearResult = {
    accepted: [MEMBER],
    alreadyWithdrawnCount: 0,
  };
  addMembersByStudentIdHashesResult: AddMembersResult = {
    accepted: [MEMBER],
    alreadyWithdrawnStudentIds: [],
    unknownStudentIds: [],
  };
  group: CollectionGroup | null = GROUP;
  members: GroupMember[] = [MEMBER];
  round: CollectionRound | null = ROUND;
  reinstateMemberResult: ReinstateMemberResult = {
    member: MEMBER,
    outcome: 'reinstated',
  };
  withdrawMemberResult: WithdrawMemberResult = {
    member: { ...MEMBER, status: 'withdrawn' },
    outcome: 'withdrawn',
  };

  addMembersByEntryYear(): Promise<AddMembersByEntryYearResult> {
    return Promise.resolve(this.addMembersByEntryYearResult);
  }

  addMembersByStudentIdHashes(): Promise<AddMembersResult> {
    return Promise.resolve(this.addMembersByStudentIdHashesResult);
  }

  createGroup(): Promise<CollectionGroup> {
    return Promise.resolve(GROUP);
  }

  createRound(): Promise<CollectionRound> {
    return Promise.resolve(ROUND);
  }

  findGroup(): Promise<CollectionGroup | null> {
    return Promise.resolve(this.group);
  }

  findRound(): Promise<CollectionRound | null> {
    return Promise.resolve(this.round);
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

  it('rejects creating a Group under a missing Round', async () => {
    const repository = new FakeRepository();
    repository.round = null;
    await expect(
      setup(repository).service.createGroup({
        actorAccountId: ACTOR_ACCOUNT_ID,
        name: 'กลุ่ม',
        roundId: ROUND_ID,
      }),
    ).rejects.toEqual(new CollectionGroupsError('ROUND_NOT_FOUND', 404));
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

describe('CollectionGroupsService membership by Student ID', () => {
  it('hashes every Student ID and forwards the accepted/unknown/already-withdrawn split from the repository', async () => {
    const repository = new FakeRepository();
    repository.addMembersByStudentIdHashesResult = {
      accepted: [MEMBER],
      alreadyWithdrawnStudentIds: ['88888888'],
      unknownStudentIds: ['99999999'],
    };
    await expect(
      setup(repository).service.addMembersByStudentIds({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: GROUP_ID,
        studentIds: ['10000001', '88888888', '99999999'],
      }),
    ).resolves.toEqual({
      accepted: [MEMBER],
      alreadyWithdrawnStudentIds: ['88888888'],
      unknownStudentIds: ['99999999'],
    });
  });

  it('rejects an empty or over-limit Student ID list before touching the repository', async () => {
    const repository = new FakeRepository();
    for (const studentIds of [
      [],
      Array.from({ length: 501 }, (_, index) => String(10000000 + index)),
    ]) {
      await expect(
        setup(repository).service.addMembersByStudentIds({
          actorAccountId: ACTOR_ACCOUNT_ID,
          groupId: GROUP_ID,
          studentIds,
        }),
      ).rejects.toEqual(new CollectionGroupsError('STUDENT_ID_LIST_INVALID', 422));
    }
  });

  it('rejects membership mutations against an unknown Group', async () => {
    const repository = new FakeRepository();
    repository.group = null;
    await expect(
      setup(repository).service.addMembersByStudentIds({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: GROUP_ID,
        studentIds: ['10000001'],
      }),
    ).rejects.toEqual(new CollectionGroupsError('GROUP_NOT_FOUND', 404));
  });

  it('adds a single Student individually via the same hashing path', async () => {
    await expect(
      setup().service.addMemberIndividually({
        actorAccountId: ACTOR_ACCOUNT_ID,
        groupId: GROUP_ID,
        studentId: '10000001',
      }),
    ).resolves.toEqual({
      accepted: [MEMBER],
      alreadyWithdrawnStudentIds: [],
      unknownStudentIds: [],
    });
  });
});

describe('CollectionGroupsService Entry Year and withdrawal', () => {
  it('adds members by Entry Year for a known Group', async () => {
    await expect(
      setup().service.addMembersByEntryYear({
        actorAccountId: ACTOR_ACCOUNT_ID,
        entryYear: 2569,
        groupId: GROUP_ID,
      }),
    ).resolves.toEqual({ accepted: [MEMBER], alreadyWithdrawnCount: 0 });
  });

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
