export type CollectionGroupsErrorMessage =
  | 'groupMemberAlreadyWithdrawn'
  | 'groupMemberAlreadyCurrent'
  | 'groupNameInvalid'
  | 'groupNotFound'
  | 'groupMemberNotFound'
  | 'idempotencyKeyConflict'
  | 'invalid'
  | 'memberListInvalid'
  | 'memberNotSelectable'
  | 'roundNameInvalid'
  | 'roundNotFound'
  | 'roundClosed'
  | 'selectionLimitExceeded'
  | 'sessionExpired'
  | 'studentIdListInvalid'
  | 'studentAccountInactive'
  | 'unavailable'
  | 'withdrawalReasonInvalid'
  | 'reinstatementReasonInvalid';

export interface CreateRoundActionState {
  error: CollectionGroupsErrorMessage | null;
}

/*
 * `ineligibleAccountIds` lists selected Students who became ineligible before
 * confirmation (MEMBER_NOT_SELECTABLE); the picker already holds their names.
 */
export interface CreateGroupActionState {
  error: CollectionGroupsErrorMessage | null;
  ineligibleAccountIds: string[];
}

export interface CreateFormGroupActionState {
  error: CollectionGroupsErrorMessage | null;
  group: { id: string; name: string; roundId: string } | null;
  ineligibleAccountIds: string[];
  round: { id: string; name: string } | null;
}

export interface AddMembersActionState {
  added: number;
  alreadyMember: number;
  error: CollectionGroupsErrorMessage | null;
  ineligibleAccountIds: string[];
  submitted: boolean;
}

export interface WithdrawMemberActionState {
  error: CollectionGroupsErrorMessage | null;
}

export type ReinstateMemberActionState = WithdrawMemberActionState;

export const INITIAL_CREATE_ROUND_STATE: CreateRoundActionState = { error: null };
export const INITIAL_CREATE_GROUP_STATE: CreateGroupActionState = {
  error: null,
  ineligibleAccountIds: [],
};
export const INITIAL_CREATE_FORM_GROUP_STATE: CreateFormGroupActionState = {
  error: null,
  group: null,
  ineligibleAccountIds: [],
  round: null,
};
export const INITIAL_ADD_MEMBERS_STATE: AddMembersActionState = {
  added: 0,
  alreadyMember: 0,
  error: null,
  ineligibleAccountIds: [],
  submitted: false,
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
