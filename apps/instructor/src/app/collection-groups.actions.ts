'use server';

import { redirect } from 'next/navigation';
import { isExpired, mapCollectionGroupsError } from './collection-groups-action-policy';
import { INITIAL_ADD_MEMBERS_STATE } from './collection-groups-state';
import type {
  AddMembersActionState,
  CreateGroupActionState,
  CreateRoundActionState,
  WithdrawMemberActionState,
} from './collection-groups-state';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import {
  clearInstructorSessionToken,
  readInstructorSessionToken,
} from '@/lib/instructor-auth-session';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import {
  validateAddByEntryYear,
  validateAddByStudentIds,
  validateCreateGroup,
  validateCreateRound,
  validateWithdraw,
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
    return { error: 'invalid' };
  }
  const sessionToken = await requireSessionToken();
  let group;
  try {
    group = await coreClient().createGroup(sessionToken, roundId, input);
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return { error: mapCollectionGroupsError(error) };
  }
  redirect(`/groups/${group.id}`);
}

export async function addMembersByStudentIdsAction(
  groupId: string,
  _previousState: AddMembersActionState,
  formData: FormData,
): Promise<AddMembersActionState> {
  const input = validateAddByStudentIds(formData);
  if (input === null) {
    return { ...INITIAL_ADD_MEMBERS_STATE, error: 'invalid', submitted: true };
  }
  const sessionToken = await requireSessionToken();
  try {
    const result = await coreClient().addMembersByStudentIds(sessionToken, groupId, input);
    return {
      acceptedCount: result.accepted.length,
      alreadyWithdrawnCount: result.alreadyWithdrawnStudentIds.length,
      alreadyWithdrawnStudentIds: result.alreadyWithdrawnStudentIds,
      error: null,
      submitted: true,
      unknownStudentIds: result.unknownStudentIds,
    };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      ...INITIAL_ADD_MEMBERS_STATE,
      error: mapCollectionGroupsError(error),
      submitted: true,
    };
  }
}

export async function addMembersByEntryYearAction(
  groupId: string,
  _previousState: AddMembersActionState,
  formData: FormData,
): Promise<AddMembersActionState> {
  const input = validateAddByEntryYear(formData);
  if (input === null) {
    return { ...INITIAL_ADD_MEMBERS_STATE, error: 'invalid', submitted: true };
  }
  const sessionToken = await requireSessionToken();
  try {
    const result = await coreClient().addMembersByEntryYear(sessionToken, groupId, input);
    return {
      ...INITIAL_ADD_MEMBERS_STATE,
      acceptedCount: result.accepted.length,
      alreadyWithdrawnCount: result.alreadyWithdrawnCount,
      submitted: true,
    };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      ...INITIAL_ADD_MEMBERS_STATE,
      error: mapCollectionGroupsError(error),
      submitted: true,
    };
  }
}

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

function coreClient(): InstructorCollectionGroupsCoreClient {
  return new InstructorCollectionGroupsCoreClient(getInstructorServerEnvironment());
}
