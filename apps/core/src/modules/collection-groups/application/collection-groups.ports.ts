export const COLLECTION_GROUPS_REPOSITORY = Symbol('COLLECTION_GROUPS_REPOSITORY');

export type MembershipSource = 'entry_year' | 'individual' | 'student_id_list';
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
  withdrawalReason: string | null;
  withdrawnAt: Date | null;
}

export interface AddMembersResult {
  accepted: GroupMember[];
  alreadyWithdrawnStudentIds: string[];
  unknownStudentIds: string[];
}

export interface AddMembersByEntryYearResult {
  accepted: GroupMember[];
  alreadyWithdrawnCount: number;
}

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
  ) {
    super(code);
    this.name = 'CollectionGroupsError';
  }
}

export interface CollectionGroupsRepository {
  addMembersByEntryYear(input: {
    actorAccountId: string;
    entryYear: number;
    groupId: string;
    now: Date;
  }): Promise<AddMembersByEntryYearResult>;
  addMembersByStudentIdHashes(input: {
    actorAccountId: string;
    groupId: string;
    now: Date;
    source: 'individual' | 'student_id_list';
    studentIdHashToOriginal: Map<string, string>;
  }): Promise<AddMembersResult>;
  createGroup(input: {
    createdByAccountId: string;
    name: string;
    now: Date;
    roundId: string;
  }): Promise<CollectionGroup>;
  createRound(input: {
    createdByAccountId: string;
    name: string;
    now: Date;
  }): Promise<CollectionRound>;
  createRoundWithGroup(input: {
    createdByAccountId: string;
    groupName: string;
    now: Date;
    roundName: string;
  }): Promise<{ group: CollectionGroup; round: CollectionRound }>;
  findGroup(groupId: string): Promise<CollectionGroup | null>;
  findRound(roundId: string): Promise<CollectionRound | null>;
  listGroupMembers(groupId: string): Promise<GroupMember[]>;
  listGroups(roundId: string): Promise<CollectionGroup[]>;
  listRounds(): Promise<CollectionRound[]>;
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
