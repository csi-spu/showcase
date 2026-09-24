export type CollectionGroupsErrorMessage =
  | 'groupMemberAlreadyWithdrawn'
  | 'groupMemberAlreadyCurrent'
  | 'groupNameInvalid'
  | 'groupNotFound'
  | 'groupMemberNotFound'
  | 'invalid'
  | 'roundNameInvalid'
  | 'roundNotFound'
  | 'roundClosed'
  | 'sessionExpired'
  | 'studentIdListInvalid'
  | 'studentAccountInactive'
  | 'unavailable'
  | 'withdrawalReasonInvalid'
  | 'reinstatementReasonInvalid';

export interface CreateRoundActionState {
  error: CollectionGroupsErrorMessage | null;
}

export interface CreateGroupActionState {
  error: CollectionGroupsErrorMessage | null;
}

export interface CreateFormGroupActionState {
  error: CollectionGroupsErrorMessage | null;
  group: { id: string; name: string; roundId: string } | null;
  round: { id: string; name: string } | null;
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

export type ReinstateMemberActionState = WithdrawMemberActionState;

export const INITIAL_CREATE_ROUND_STATE: CreateRoundActionState = { error: null };
export const INITIAL_CREATE_GROUP_STATE: CreateGroupActionState = { error: null };
export const INITIAL_CREATE_FORM_GROUP_STATE: CreateFormGroupActionState = {
  error: null,
  group: null,
  round: null,
};
export const INITIAL_ADD_MEMBERS_STATE: AddMembersActionState = {
  acceptedCount: 0,
  alreadyWithdrawnCount: 0,
  alreadyWithdrawnStudentIds: [],
  error: null,
  submitted: false,
  unknownStudentIds: [],
};
export const INITIAL_WITHDRAW_STATE: WithdrawMemberActionState = { error: null };
export const INITIAL_REINSTATE_STATE: ReinstateMemberActionState = { error: null };

export type CreateRoundAction = (
  state: CreateRoundActionState,
  formData: FormData,
) => Promise<CreateRoundActionState>;

export type CreateGroupAction = (
  state: CreateGroupActionState,
  formData: FormData,
) => Promise<CreateGroupActionState>;

export type CreateFormGroupAction = (
  state: CreateFormGroupActionState,
  formData: FormData,
) => Promise<CreateFormGroupActionState>;

export type AddMembersAction = (
  state: AddMembersActionState,
  formData: FormData,
) => Promise<AddMembersActionState>;

export type WithdrawMemberAction = (
  state: WithdrawMemberActionState,
  formData: FormData,
) => Promise<WithdrawMemberActionState>;

export type ReinstateMemberAction = (
  state: ReinstateMemberActionState,
  formData: FormData,
) => Promise<ReinstateMemberActionState>;
