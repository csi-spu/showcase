import { Inject, Injectable } from '@nestjs/common';
import { AUTH_CLOCK, AUTH_IDENTITY_PROTECTOR } from '../../auth/application/auth.ports';
import type { Clock, IdentityProtector } from '../../auth/application/auth.ports';
import { COLLECTION_GROUPS_REPOSITORY, CollectionGroupsError } from './collection-groups.ports';
import type {
  AddMembersByEntryYearResult,
  AddMembersResult,
  CollectionGroup,
  CollectionGroupsRepository,
  CollectionRound,
  GroupMember,
} from './collection-groups.ports';

const MAX_STUDENT_IDS_PER_REQUEST = 500;

@Injectable()
export class CollectionGroupsService {
  constructor(
    @Inject(COLLECTION_GROUPS_REPOSITORY) private readonly repository: CollectionGroupsRepository,
    @Inject(AUTH_CLOCK) private readonly clock: Clock,
    @Inject(AUTH_IDENTITY_PROTECTOR) private readonly identityProtector: IdentityProtector,
  ) {}

  async createRound(input: { actorAccountId: string; name: string }): Promise<CollectionRound> {
    const name = this.requireName(input.name, 'ROUND_NAME_INVALID');
    return this.repository.createRound({
      createdByAccountId: input.actorAccountId,
      name,
      now: this.clock.now(),
    });
  }

  async createRoundWithGroup(input: {
    actorAccountId: string;
    groupName: string;
    roundName: string;
  }): Promise<{ group: CollectionGroup; round: CollectionRound }> {
    const roundName = this.requireName(input.roundName, 'ROUND_NAME_INVALID');
    const groupName = this.requireName(input.groupName, 'GROUP_NAME_INVALID');
    return this.repository.createRoundWithGroup({
      createdByAccountId: input.actorAccountId,
      groupName,
      now: this.clock.now(),
      roundName,
    });
  }

  listRounds(): Promise<CollectionRound[]> {
    return this.repository.listRounds();
  }

  async createGroup(input: {
    actorAccountId: string;
    name: string;
    roundId: string;
  }): Promise<CollectionGroup> {
    const name = this.requireName(input.name, 'GROUP_NAME_INVALID');
    const round = await this.repository.findRound(input.roundId);
    if (round === null) {
      throw new CollectionGroupsError('ROUND_NOT_FOUND', 404);
    }
    return this.repository.createGroup({
      createdByAccountId: input.actorAccountId,
      name,
      now: this.clock.now(),
      roundId: input.roundId,
    });
  }

  async listGroups(roundId: string): Promise<CollectionGroup[]> {
    const round = await this.repository.findRound(roundId);
    if (round === null) {
      throw new CollectionGroupsError('ROUND_NOT_FOUND', 404);
    }
    return this.repository.listGroups(roundId);
  }

  async getGroup(groupId: string): Promise<{ group: CollectionGroup; members: GroupMember[] }> {
    const group = await this.repository.findGroup(groupId);
    if (group === null) {
      throw new CollectionGroupsError('GROUP_NOT_FOUND', 404);
    }
    const members = await this.repository.listGroupMembers(groupId);
    return { group, members };
  }

  async addMembersByStudentIds(input: {
    actorAccountId: string;
    groupId: string;
    studentIds: string[];
  }): Promise<AddMembersResult> {
    return this.addMembersByIdsInternal(input, 'student_id_list');
  }

  async addMemberIndividually(input: {
    actorAccountId: string;
    groupId: string;
    studentId: string;
  }): Promise<AddMembersResult> {
    return this.addMembersByIdsInternal(
      {
        actorAccountId: input.actorAccountId,
        groupId: input.groupId,
        studentIds: [input.studentId],
      },
      'individual',
    );
  }

  async addMembersByEntryYear(input: {
    actorAccountId: string;
    entryYear: number;
    groupId: string;
  }): Promise<AddMembersByEntryYearResult> {
    await this.requireGroup(input.groupId);
    return this.repository.addMembersByEntryYear({
      actorAccountId: input.actorAccountId,
      entryYear: input.entryYear,
      groupId: input.groupId,
      now: this.clock.now(),
    });
  }

  async withdrawMember(input: {
    actorAccountId: string;
    groupId: string;
    reason: string;
    studentAccountId: string;
  }): Promise<GroupMember> {
    const reason = input.reason.trim();
    if (reason.length === 0 || reason.length > 2_000) {
      throw new CollectionGroupsError('WITHDRAWAL_REASON_INVALID', 422);
    }
    await this.requireGroup(input.groupId);
    const result = await this.repository.withdrawMember({
      actorAccountId: input.actorAccountId,
      groupId: input.groupId,
      now: this.clock.now(),
      reason,
      studentAccountId: input.studentAccountId,
    });
    if (result.outcome === 'not_found') {
      throw new CollectionGroupsError('GROUP_MEMBER_NOT_FOUND', 404);
    }
    if (result.outcome === 'round_closed') {
      throw new CollectionGroupsError('ROUND_CLOSED', 409);
    }
    if (result.outcome === 'already_withdrawn') {
      throw new CollectionGroupsError('GROUP_MEMBER_ALREADY_WITHDRAWN', 409);
    }
    return result.member;
  }

  async reinstateMember(input: {
    actorAccountId: string;
    groupId: string;
    reason: string;
    studentAccountId: string;
  }): Promise<GroupMember> {
    const reason = input.reason.trim();
    if (reason.length === 0 || reason.length > 2_000) {
      throw new CollectionGroupsError('REINSTATEMENT_REASON_INVALID', 422);
    }
    await this.requireGroup(input.groupId);
    const result = await this.repository.reinstateMember({
      actorAccountId: input.actorAccountId,
      groupId: input.groupId,
      now: this.clock.now(),
      reason,
      studentAccountId: input.studentAccountId,
    });
    if (result.outcome === 'not_found') {
      throw new CollectionGroupsError('GROUP_MEMBER_NOT_FOUND', 404);
    }
    if (result.outcome === 'already_current') {
      throw new CollectionGroupsError('GROUP_MEMBER_ALREADY_CURRENT', 409);
    }
    if (result.outcome === 'round_closed') {
      throw new CollectionGroupsError('ROUND_CLOSED', 409);
    }
    if (result.outcome === 'student_inactive') {
      throw new CollectionGroupsError('STUDENT_ACCOUNT_INACTIVE', 409);
    }
    return result.member;
  }

  private async addMembersByIdsInternal(
    input: { actorAccountId: string; groupId: string; studentIds: string[] },
    source: 'individual' | 'student_id_list',
  ): Promise<AddMembersResult> {
    if (input.studentIds.length === 0 || input.studentIds.length > MAX_STUDENT_IDS_PER_REQUEST) {
      throw new CollectionGroupsError('STUDENT_ID_LIST_INVALID', 422);
    }
    await this.requireGroup(input.groupId);

    const studentIdHashToOriginal = new Map<string, string>();
    for (const studentId of input.studentIds) {
      studentIdHashToOriginal.set(this.identityProtector.hashStudentId(studentId), studentId);
    }

    return this.repository.addMembersByStudentIdHashes({
      actorAccountId: input.actorAccountId,
      groupId: input.groupId,
      now: this.clock.now(),
      source,
      studentIdHashToOriginal,
    });
  }

  private async requireGroup(groupId: string): Promise<CollectionGroup> {
    const group = await this.repository.findGroup(groupId);
    if (group === null) {
      throw new CollectionGroupsError('GROUP_NOT_FOUND', 404);
    }
    return group;
  }

  private requireName(value: string, errorCode: string): string {
    const name = value.trim();
    if (name.length === 0 || name.length > 200) {
      throw new CollectionGroupsError(errorCode, 422);
    }
    return name;
  }
}
