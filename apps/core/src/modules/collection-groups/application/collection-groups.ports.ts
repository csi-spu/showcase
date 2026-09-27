import type { SelectionStatus } from '../domain/member-selection-policy';

export const COLLECTION_GROUPS_REPOSITORY = Symbol('COLLECTION_GROUPS_REPOSITORY');

/*
 * 'instructor_selection' is the only value new rows receive; the others remain
 * on historical rows written before the selection table and CSV import.
 */
export type MembershipSource =
  'entry_year' | 'individual' | 'instructor_selection' | 'student_id_list';
export type MembershipStatus = 'current' | 'withdrawn';

export interface CollectionRound {
  createdAt: Date;
  id: string;
  name: string;
  status: 'active' | 'closed';
}

export interface CollectionGroup {
  createdAt: Date;
  id: string;
  name: string;
  roundId: string;
}

export interface GroupMember {
  addedAt: Date;
  entryYear: number;
  firstNameTh: string;
  lastNameTh: string;
  membershipSource: MembershipSource;
  status: MembershipStatus;
  studentAccountId: string;
  /** Null until a Roster import has recorded the raw value (ADR 0020). */
  studentId: string | null;
  withdrawalReason: string | null;
  withdrawnAt: Date | null;
}

/*
 * A candidate for group membership, identified to Instructors by Roster name
 * and Student ID (ADR 0019, ADR 0020).
 */
export interface SelectableStudent {
  accountId: string;
  entryYear: number;
  firstNameTh: string;
  lastNameTh: string;
  status: SelectionStatus;
  /** Null until a Roster import has recorded the raw value (ADR 0020). */
  studentId: string | null;
}

/*
 * A search term: a partial Roster name, or a Student ID prefix matched through
 * its keyed hash so Accounts without a recorded raw value are still found.
 */
export type StudentSearch =
  | { kind: 'name'; name: string }
  | { kind: 'student_id_prefix'; prefixHash: string; prefixLength: number };

export interface StudentSelectionFilter {
  entryYear: number | null;
  /** Add flow only: statuses then reflect membership in this group. */
  groupId: string | null;
  search: StudentSearch | null;
}

/*
 * One resolved CSV position. An unmatched Student ID is reported by position
 * only; the browser shows the value from its own parsed input.
 */
export type StudentIdResolution =
  | { outcome: 'matched' | 'no_access'; position: number; student: SelectableStudent }
  | { outcome: 'not_found'; position: number };

export type CreateGroupWithMembersResult =
  | { group: CollectionGroup; outcome: 'created' | 'replayed' }
  | { outcome: 'idempotency_conflict' }
  | { outcome: 'round_closed' }
  | { outcome: 'round_not_found' }
  | { accountIds: string[]; outcome: 'members_not_selectable' };

export type CreateRoundWithGroupAndMembersResult =
  | { group: CollectionGroup; outcome: 'created' | 'replayed'; round: CollectionRound }
  | { outcome: 'idempotency_conflict' }
  | { accountIds: string[]; outcome: 'members_not_selectable' };

export type AddMembersResult =
  | { added: number; alreadyMember: number; outcome: 'added' }
  | { outcome: 'round_closed' }
  | { accountIds: string[]; outcome: 'members_not_selectable' };

export type WithdrawMemberResult =
  | { outcome: 'not_found' }
  | { outcome: 'round_closed' }
  | { member: GroupMember; outcome: 'already_withdrawn' }
  | { member: GroupMember; outcome: 'withdrawn' };

export type ReinstateMemberResult =
  | { outcome: 'not_found' }
  | { outcome: 'round_closed' }
  | { outcome: 'student_inactive' }
  | { member: GroupMember; outcome: 'already_current' }
  | { member: GroupMember; outcome: 'reinstated' };

export class CollectionGroupsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    /** Returned to the Instructor BFF; never carries a Student ID. */
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(code);
    this.name = 'CollectionGroupsError';
  }
}

export interface CollectionGroupsRepository {
  addMembers(input: {
    actorAccountId: string;
    groupId: string;
    memberAccountIds: string[];
    now: Date;
  }): Promise<AddMembersResult>;
  countSelectableStudents(filter: StudentSelectionFilter): Promise<number>;
  createGroupWithMembers(input: {
    createdByAccountId: string;
    idempotencyKey: string;
    memberAccountIds: string[];
    name: string;
    now: Date;
    roundId: string;
  }): Promise<CreateGroupWithMembersResult>;
  createRound(input: {
    createdByAccountId: string;
    name: string;
    now: Date;
  }): Promise<CollectionRound>;
  createRoundWithGroupAndMembers(input: {
    createdByAccountId: string;
    groupName: string;
    idempotencyKey: string;
    memberAccountIds: string[];
    now: Date;
    roundName: string;
  }): Promise<CreateRoundWithGroupAndMembersResult>;
  findCurrentAcademicYear(): Promise<number | null>;
  findGroup(groupId: string): Promise<CollectionGroup | null>;
  findRound(roundId: string): Promise<CollectionRound | null>;
  /** Every active Student Account whose Student ID hash is listed, keyed by that hash. */
  findStudentsByIdHashes(input: {
    groupId: string | null;
    studentIdHashes: string[];
  }): Promise<Map<string, SelectableStudent>>;
  listEntryYears(): Promise<number[]>;
  listGroupMembers(groupId: string): Promise<GroupMember[]>;
  listGroups(roundId: string): Promise<CollectionGroup[]>;
  listRounds(): Promise<CollectionRound[]>;
  /** Selectable Students only, in list order, at most `limit` rows. */
  listSelectableStudentSnapshot(
    input: StudentSelectionFilter & { limit: number },
  ): Promise<SelectableStudent[]>;
  /**
   * One page of active Student Accounts after the given Account, in (Entry
   * Year, Roster name, Account ID) order; returns up to `limit + 1` rows so the
   * caller can tell whether another page exists.
   */
  listStudents(
    input: StudentSelectionFilter & { afterAccountId: string | null; limit: number },
  ): Promise<SelectableStudent[]>;
  reinstateMember(input: {
    actorAccountId: string;
    groupId: string;
    now: Date;
    reason: string;
    studentAccountId: string;
  }): Promise<ReinstateMemberResult>;
  withdrawMember(input: {
    actorAccountId: string;
    groupId: string;
    now: Date;
    reason: string;
    studentAccountId: string;
  }): Promise<WithdrawMemberResult>;
}
