export type CollectionGroupsErrorMessage =
  | 'groupMemberAlreadyWithdrawn'
  | 'groupNameInvalid'
  | 'groupNotFound'
  | 'groupMemberNotFound'
  | 'invalid'
  | 'roundNameInvalid'
  | 'roundNotFound'
  | 'sessionExpired'
  | 'studentIdListInvalid'
  | 'unavailable'
  | 'withdrawalReasonInvalid';

export interface CreateRoundActionState {
  error: CollectionGroupsErrorMessage | null;
}

export interface CreateGroupActionState {
  error: CollectionGroupsErrorMessage | null;
}

export interface AddMembersActionState {
  acceptedCount: number;
  alreadyWithdrawnCount: number;
  alreadyWithdrawnStudentIds: string[];
  error: CollectionGroupsErrorMessage | null;
  submitted: boolean;
  unknownStudentIds: string[];
}

export interface WithdrawMemberActionState {
  error: CollectionGroupsErrorMessage | null;
}

export const INITIAL_CREATE_ROUND_STATE: CreateRoundActionState = { error: null };
export const INITIAL_CREATE_GROUP_STATE: CreateGroupActionState = { error: null };
export const INITIAL_ADD_MEMBERS_STATE: AddMembersActionState = {
  acceptedCount: 0,
  alreadyWithdrawnCount: 0,
  alreadyWithdrawnStudentIds: [],
  error: null,
  submitted: false,
  unknownStudentIds: [],
};
export const INITIAL_WITHDRAW_STATE: WithdrawMemberActionState = { error: null };

export type CreateRoundAction = (
  state: CreateRoundActionState,
  formData: FormData,
) => Promise<CreateRoundActionState>;

export type CreateGroupAction = (
  state: CreateGroupActionState,
  formData: FormData,
) => Promise<CreateGroupActionState>;

export type AddMembersAction = (
  state: AddMembersActionState,
  formData: FormData,
) => Promise<AddMembersActionState>;

export type WithdrawMemberAction = (
  state: WithdrawMemberActionState,
  formData: FormData,
) => Promise<WithdrawMemberActionState>;
