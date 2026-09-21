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
  { outcome: 'not_found' } | { member: GroupMember; outcome: 'already_withdrawn' | 'withdrawn' };

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
  findGroup(groupId: string): Promise<CollectionGroup | null>;
  findRound(roundId: string): Promise<CollectionRound | null>;
  listGroupMembers(groupId: string): Promise<GroupMember[]>;
  listGroups(roundId: string): Promise<CollectionGroup[]>;
  listRounds(): Promise<CollectionRound[]>;
  withdrawMember(input: {
    actorAccountId: string;
    groupId: string;
    now: Date;
    reason: string;
    studentAccountId: string;
  }): Promise<WithdrawMemberResult>;
}
