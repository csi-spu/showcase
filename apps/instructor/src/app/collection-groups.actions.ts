'use server';

import { redirect } from 'next/navigation';
import {
  ineligibleAccountIds,
  isExpired,
  mapCollectionGroupsError,
  selectionLimitMatchingCount,
} from './collection-groups-action-policy';
import { INITIAL_ADD_MEMBERS_STATE } from './collection-groups-state';
import type {
  AddMembersActionState,
  CreateGroupActionState,
  CreateFormGroupActionState,
  CreateRoundActionState,
  WithdrawMemberActionState,
  ReinstateMemberActionState,
} from './collection-groups-state';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import type {
  MemberSelectionReadError,
  MemberSelectionReads,
} from '@/lib/member-selection-contract';
import {
  clearInstructorSessionToken,
  readInstructorSessionToken,
} from '@/lib/instructor-auth-session';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import {
  validateAddMembers,
  validateCreateGroup,
  validateCreateFormGroup,
  validateCreateRound,
  validateResolveStudentIds,
  validateSelectAllQuery,
  validateStudentListQuery,
  validateWithdraw,
  validateReinstate,
} from '@/lib/collection-groups-validation';

export async function createRoundAction(
  _previousState: CreateRoundActionState,
  formData: FormData,
): Promise<CreateRoundActionState> {
  const input = validateCreateRound(formData);
  if (input === null) {
    return { error: 'invalid' };
  }
  const sessionToken = await requireSessionToken();
  let round;
  try {
    round = await coreClient().createRound(sessionToken, input);
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return { error: mapCollectionGroupsError(error) };
  }
  redirect(`/rounds/${round.id}`);
}

export async function createGroupAction(
  roundId: string,
  _previousState: CreateGroupActionState,
  formData: FormData,
): Promise<CreateGroupActionState> {
  const input = validateCreateGroup(formData);
  if (input === null) {
    return { error: 'invalid', ineligibleAccountIds: [] };
  }
  const sessionToken = await requireSessionToken();
  let group;
  try {
    group = await coreClient().createGroupWithMembers(sessionToken, roundId, input);
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      error: mapCollectionGroupsError(error),
      ineligibleAccountIds: ineligibleAccountIds(error),
    };
  }
  redirect(`/groups/${group.id}`);
}

export async function createFormGroupAction(
  _previousState: CreateFormGroupActionState,
  formData: FormData,
): Promise<CreateFormGroupActionState> {
  const input = validateCreateFormGroup(formData);
  if (input === null)
    return { error: 'invalid', group: null, ineligibleAccountIds: [], round: null };

  const sessionToken = await requireSessionToken();
  try {
    if (input.mode === 'new-round') {
      const result = await coreClient().createRoundWithGroupAndMembers(sessionToken, {
        groupName: input.groupName,
        idempotencyKey: input.idempotencyKey,
        memberAccountIds: input.memberAccountIds,
        roundName: input.roundName,
      });
      return {
        error: null,
        group: { id: result.group.id, name: result.group.name, roundId: result.group.roundId },
        ineligibleAccountIds: [],
        round: { id: result.round.id, name: result.round.name },
      };
    }

    const group = await coreClient().createGroupWithMembers(sessionToken, input.roundId, {
      idempotencyKey: input.idempotencyKey,
      memberAccountIds: input.memberAccountIds,
      name: input.groupName,
    });
    return {
      error: null,
      group: { id: group.id, name: group.name, roundId: group.roundId },
      ineligibleAccountIds: [],
      round: null,
    };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      error: mapCollectionGroupsError(error),
      group: null,
      ineligibleAccountIds: ineligibleAccountIds(error),
      round: null,
    };
  }
}

export async function addMembersAction(
  groupId: string,
  _previousState: AddMembersActionState,
  formData: FormData,
): Promise<AddMembersActionState> {
  const input = validateAddMembers(formData);
  if (input === null) {
    return { ...INITIAL_ADD_MEMBERS_STATE, error: 'invalid', submitted: true };
  }
  const sessionToken = await requireSessionToken();
  try {
    const result = await coreClient().addMembers(sessionToken, groupId, input);
    return { ...INITIAL_ADD_MEMBERS_STATE, ...result, submitted: true };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      ...INITIAL_ADD_MEMBERS_STATE,
      error: mapCollectionGroupsError(error),
      ineligibleAccountIds: ineligibleAccountIds(error),
      submitted: true,
    };
  }
}

/*
 * Read-only server functions behind the member picker. Their arguments come
 * from the browser, so each one is parsed before it reaches Core.
 */
export const listStudentEntryYearsAction: MemberSelectionReads['listEntryYears'] = async () => {
  const sessionToken = await requireSessionToken();
  try {
    return { entryYears: await coreClient().listEntryYears(sessionToken), ok: true };
  } catch (error: unknown) {
    return readFailure(error);
  }
};

export const listSelectableStudentsAction: MemberSelectionReads['listStudents'] = async (query) => {
  const input = validateStudentListQuery(query);
  if (input === null) return { error: 'invalid', ok: false };
  const sessionToken = await requireSessionToken();
  try {
    return { ...(await coreClient().listStudents(sessionToken, input)), ok: true };
  } catch (error: unknown) {
    return readFailure(error);
  }
};

export const selectAllStudentsAction: MemberSelectionReads['selectAll'] = async (query) => {
  const input = validateSelectAllQuery(query);
  if (input === null) return { error: 'invalid', ok: false };
  const sessionToken = await requireSessionToken();
  try {
    return { ok: true, students: await coreClient().selectAllStudents(sessionToken, input) };
  } catch (error: unknown) {
    return readFailure(error);
  }
};

export const resolveStudentIdsAction: MemberSelectionReads['resolveStudentIds'] = async (
  request,
) => {
  const input = validateResolveStudentIds(request);
  if (input === null) return { error: 'invalid', ok: false };
  const sessionToken = await requireSessionToken();
  try {
    return { ok: true, results: await coreClient().resolveStudentIds(sessionToken, input) };
  } catch (error: unknown) {
    return readFailure(error);
  }
};

export async function withdrawMemberAction(
  groupId: string,
  _previousState: WithdrawMemberActionState,
  formData: FormData,
): Promise<WithdrawMemberActionState> {
  const input = validateWithdraw(formData);
  if (input === null) {
    return { error: 'invalid' };
  }
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().withdrawMember(sessionToken, groupId, input.studentAccountId, {
      reason: input.reason,
    });
    return { error: null };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return { error: mapCollectionGroupsError(error) };
  }
}

export async function reinstateMemberAction(
  groupId: string,
  _previousState: ReinstateMemberActionState,
  formData: FormData,
): Promise<ReinstateMemberActionState> {
  const input = validateReinstate(formData);
  if (input === null) return { error: 'invalid' };
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().reinstateMember(sessionToken, groupId, input.studentAccountId, {
      reason: input.reason,
    });
    return { error: null };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return { error: mapCollectionGroupsError(error) };
  }
}

async function requireSessionToken(): Promise<string> {
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  return sessionToken;
}

async function expireSessionIfRequired(error: unknown): Promise<void> {
  if (!isExpired(error)) return;
  await clearInstructorSessionToken();
  redirect('/?expired=1');
}

async function readFailure(error: unknown): Promise<MemberSelectionReadError> {
  await expireSessionIfRequired(error);
  const matchingCount = selectionLimitMatchingCount(error);
  return matchingCount === null
    ? { error: 'unavailable', ok: false }
    : { error: 'selectionLimitExceeded', matchingCount, ok: false };
}

function coreClient(): InstructorCollectionGroupsCoreClient {
  return new InstructorCollectionGroupsCoreClient(getInstructorServerEnvironment());
}
