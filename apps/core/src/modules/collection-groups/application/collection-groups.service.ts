import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_CLOCK, AUTH_IDENTITY_PROTECTOR } from '../../auth/application/auth.ports';
import type { Clock, IdentityProtector } from '../../auth/application/auth.ports';
import {
  MAX_MEMBERS_PER_REQUEST,
  MAX_STUDENT_IDS_PER_RESOLVE,
} from '../domain/member-selection-policy';
import { COLLECTION_GROUPS_REPOSITORY, CollectionGroupsError } from './collection-groups.ports';
import type {
  CollectionGroup,
  CollectionGroupsRepository,
  CollectionRound,
  GroupMember,
  SelectableStudent,
  StudentIdResolution,
  StudentSearch,
  StudentSelectionFilter,
} from './collection-groups.ports';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STUDENT_ID_PREFIX_PATTERN = /^[0-9]{1,8}$/u;

interface StudentSelectionQuery {
  entryYear: number | null;
  groupId: string | null;
  query: string | null;
}

@Injectable()
export class CollectionGroupsService {
  private readonly logger = new Logger(CollectionGroupsService.name);

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

  listRounds(): Promise<CollectionRound[]> {
    return this.repository.listRounds();
  }

  async listGroups(roundId: string): Promise<CollectionGroup[]> {
    const round = await this.repository.findRound(roundId);
    if (round === null) {
      throw new CollectionGroupsError('ROUND_NOT_FOUND', 404);
    }
    return this.repository.listGroups(roundId);
  }

  async getGroup(groupId: string): Promise<{ group: CollectionGroup; members: GroupMember[] }> {
    const group = await this.requireGroup(groupId);
    const members = await this.repository.listGroupMembers(groupId);
    return { group, members };
  }

  async listStudents(
    input: StudentSelectionQuery & { cursor: string | null; limit: number },
  ): Promise<{
    hasCurrentAcademicYear: boolean;
    nextCursor: string | null;
    students: SelectableStudent[];
  }> {
    const afterAccountId = input.cursor === null ? null : this.decodeCursor(input.cursor);
    const filter = await this.resolveFilter(input);
    const [rows, currentAcademicYear] = await Promise.all([
      this.repository.listStudents({ ...filter, afterAccountId, limit: input.limit }),
      this.repository.findCurrentAcademicYear(),
    ]);
    const students = rows.slice(0, input.limit);
    const last = students.at(-1);
    return {
      hasCurrentAcademicYear: currentAcademicYear !== null,
      nextCursor:
        rows.length > input.limit && last !== undefined ? this.encodeCursor(last.accountId) : null,
      students,
    };
  }

  listEntryYears(): Promise<number[]> {
    return this.repository.listEntryYears();
  }

  /*
   * A snapshot of every selectable match, so the confirmation list is
   * complete. Rejecting beyond the remaining capacity keeps the Instructor from
   * confirming a silently truncated selection.
   */
  async selectAllMatching(
    input: StudentSelectionQuery & { selectedCount: number },
  ): Promise<SelectableStudent[]> {
    const filter = await this.resolveFilter(input);
    const remaining = MAX_MEMBERS_PER_REQUEST - input.selectedCount;
    const students = await this.repository.listSelectableStudentSnapshot({
      ...filter,
      limit: remaining + 1,
    });
    if (students.length > remaining) {
      const matchingCount = await this.repository.countSelectableStudents(filter);
      this.logger.warn({
        errorCode: 'SELECTION_LIMIT_EXCEEDED',
        groupId: filter.groupId,
        matchingCount,
        operation: 'collection_group_select_all',
        selectedCount: input.selectedCount,
      });
      throw new CollectionGroupsError('SELECTION_LIMIT_EXCEEDED', 422, { matchingCount });
    }
    return students;
  }

  async resolveStudentIds(input: {
    groupId: string | null;
    studentIds: string[];
  }): Promise<StudentIdResolution[]> {
    if (input.studentIds.length === 0 || input.studentIds.length > MAX_STUDENT_IDS_PER_RESOLVE) {
      throw new CollectionGroupsError('STUDENT_ID_LIST_INVALID', 422);
    }
    if (input.groupId !== null) {
      await this.requireGroup(input.groupId);
    }
    const hashes = input.studentIds.map((studentId) =>
      this.identityProtector.hashStudentId(studentId),
    );
    const studentsByHash = await this.repository.findStudentsByIdHashes({
      groupId: input.groupId,
      studentIdHashes: [...new Set(hashes)],
    });
    return hashes.map((hash, position): StudentIdResolution => {
      const student = studentsByHash.get(hash);
      if (student === undefined) return { outcome: 'not_found', position };
      return {
        outcome: student.status === 'no_access' ? 'no_access' : 'matched',
        position,
        student,
      };
    });
  }

  async createGroupWithMembers(input: {
    actorAccountId: string;
    idempotencyKey: string;
    memberAccountIds: string[];
    name: string;
    roundId: string;
  }): Promise<CollectionGroup> {
    const name = this.requireName(input.name, 'GROUP_NAME_INVALID');
    this.requireMemberList(input.memberAccountIds);
    const result = await this.repository.createGroupWithMembers({
      createdByAccountId: input.actorAccountId,
      idempotencyKey: input.idempotencyKey,
      memberAccountIds: input.memberAccountIds,
      name,
      now: this.clock.now(),
      roundId: input.roundId,
    });
    switch (result.outcome) {
      case 'created':
      case 'replayed':
        this.logMembersWritten('collection_group_created_with_members', {
          actorAccountId: input.actorAccountId,
          added: input.memberAccountIds.length,
          groupId: result.group.id,
          isReplay: result.outcome === 'replayed',
        });
        return result.group;
      case 'round_not_found':
        throw new CollectionGroupsError('ROUND_NOT_FOUND', 404);
      case 'round_closed':
        throw this.rejectMembers('collection_group_created_with_members', input, 'ROUND_CLOSED');
      case 'idempotency_conflict':
        throw this.rejectMembers(
          'collection_group_created_with_members',
          input,
          'IDEMPOTENCY_KEY_CONFLICT',
        );
      case 'members_not_selectable':
        throw this.rejectMembers(
          'collection_group_created_with_members',
          input,
          'MEMBER_NOT_SELECTABLE',
          result.accountIds,
        );
    }
  }

  async createRoundWithGroupAndMembers(input: {
    actorAccountId: string;
    groupName: string;
    idempotencyKey: string;
    memberAccountIds: string[];
    roundName: string;
  }): Promise<{ group: CollectionGroup; round: CollectionRound }> {
    const roundName = this.requireName(input.roundName, 'ROUND_NAME_INVALID');
    const groupName = this.requireName(input.groupName, 'GROUP_NAME_INVALID');
    this.requireMemberList(input.memberAccountIds);
    const result = await this.repository.createRoundWithGroupAndMembers({
      createdByAccountId: input.actorAccountId,
      groupName,
      idempotencyKey: input.idempotencyKey,
      memberAccountIds: input.memberAccountIds,
      now: this.clock.now(),
      roundName,
    });
    switch (result.outcome) {
      case 'created':
      case 'replayed':
        this.logMembersWritten('collection_round_created_with_group_members', {
          actorAccountId: input.actorAccountId,
          added: input.memberAccountIds.length,
          groupId: result.group.id,
          isReplay: result.outcome === 'replayed',
        });
        return { group: result.group, round: result.round };
      case 'idempotency_conflict':
        throw this.rejectMembers(
          'collection_round_created_with_group_members',
          input,
          'IDEMPOTENCY_KEY_CONFLICT',
        );
      case 'members_not_selectable':
        throw this.rejectMembers(
          'collection_round_created_with_group_members',
          input,
          'MEMBER_NOT_SELECTABLE',
          result.accountIds,
        );
    }
  }

  async addMembers(input: {
    actorAccountId: string;
    groupId: string;
    memberAccountIds: string[];
  }): Promise<{ added: number; alreadyMember: number }> {
    this.requireMemberList(input.memberAccountIds);
    await this.requireGroup(input.groupId);
    const result = await this.repository.addMembers({
      actorAccountId: input.actorAccountId,
      groupId: input.groupId,
      memberAccountIds: input.memberAccountIds,
      now: this.clock.now(),
    });
    switch (result.outcome) {
      case 'added':
        this.logMembersWritten('collection_group_members_added', {
          actorAccountId: input.actorAccountId,
          added: result.added,
          alreadyMember: result.alreadyMember,
          groupId: input.groupId,
        });
        return { added: result.added, alreadyMember: result.alreadyMember };
      case 'group_not_found':
        throw new CollectionGroupsError('GROUP_NOT_FOUND', 404);
      case 'round_closed':
        throw this.rejectMembers('collection_group_members_added', input, 'ROUND_CLOSED');
      case 'members_not_selectable':
        throw this.rejectMembers(
          'collection_group_members_added',
          input,
          'MEMBER_NOT_SELECTABLE',
          result.accountIds,
        );
    }
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
    if (result.outcome === 'group_not_found') {
      throw new CollectionGroupsError('GROUP_NOT_FOUND', 404);
    }
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
    if (result.outcome === 'group_not_found') {
      throw new CollectionGroupsError('GROUP_NOT_FOUND', 404);
    }
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

  private async resolveFilter(input: StudentSelectionQuery): Promise<StudentSelectionFilter> {
    if (input.groupId !== null) {
      await this.requireGroup(input.groupId);
    }
    const query = input.query?.trim().replace(/\s+/gu, ' ') ?? '';
    return {
      entryYear: input.entryYear,
      groupId: input.groupId,
      search: this.toSearch(query),
    };
  }

  /* One to eight digits search by Student ID prefix; anything else by Roster name. */
  private toSearch(query: string): StudentSearch | null {
    if (query.length === 0) return null;
    if (!STUDENT_ID_PREFIX_PATTERN.test(query)) return { kind: 'name', name: query };
    return {
      kind: 'student_id_prefix',
      prefixHash: this.identityProtector.hashStudentId(query),
      prefixLength: query.length,
    };
  }

  /* The cursor carries only the last Account ID, never a name or Student ID. */
  private encodeCursor(accountId: string): string {
    return Buffer.from(accountId, 'utf8').toString('base64url');
  }

  private decodeCursor(cursor: string): string {
    const accountId = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!UUID_PATTERN.test(accountId)) {
      throw new CollectionGroupsError('STUDENT_CURSOR_INVALID', 422);
    }
    return accountId;
  }

  private requireMemberList(memberAccountIds: string[]): void {
    if (
      memberAccountIds.length === 0 ||
      memberAccountIds.length > MAX_MEMBERS_PER_REQUEST ||
      new Set(memberAccountIds).size !== memberAccountIds.length
    ) {
      throw new CollectionGroupsError('MEMBER_LIST_INVALID', 422);
    }
  }

  private logMembersWritten(
    operation: string,
    fields: {
      actorAccountId: string;
      added: number;
      alreadyMember?: number;
      groupId: string;
      isReplay?: boolean;
    },
  ): void {
    this.logger.log({ ...fields, operation });
  }

  private rejectMembers(
    operation: string,
    input: { actorAccountId: string; groupId?: string; memberAccountIds: string[] },
    errorCode: string,
    ineligibleAccountIds?: string[],
  ): CollectionGroupsError {
    this.logger.warn({
      actorAccountId: input.actorAccountId,
      errorCode,
      groupId: input.groupId ?? null,
      ineligibleCount: ineligibleAccountIds?.length ?? 0,
      operation,
      requestedCount: input.memberAccountIds.length,
    });
    // Every rejection here is a conflict with current state, never bad input.
    return ineligibleAccountIds === undefined
      ? new CollectionGroupsError(errorCode, 409)
      : new CollectionGroupsError(errorCode, 409, { accountIds: ineligibleAccountIds });
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
