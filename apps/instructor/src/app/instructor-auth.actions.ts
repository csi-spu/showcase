'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AuthActionState } from './instructor-auth-action-state';
import { isExpired, mapCoreError, sourceAddress } from './instructor-auth-action-policy';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { InstructorAuthCoreClient } from '@/lib/instructor-auth-core';
import {
  clearInstructorSessionToken,
  readInstructorSessionToken,
  setInstructorSessionToken,
} from '@/lib/instructor-auth-session';
import { validateLogin, validatePasswordChange } from '@/lib/instructor-auth-validation';

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const input = validateLogin(formData);
  if (typeof input === 'string') {
    return { error: input };
  }
  let result;
  try {
    result = await coreClient().login({ ...input, sourceAddress: sourceAddress(await headers()) });
  } catch (error: unknown) {
    return { error: mapCoreError(error) };
  }
  await setInstructorSessionToken(result.sessionToken);
  redirect(result.sessionState === 'active' ? '/dashboard' : '/');
}

export async function changePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const input = validatePasswordChange(formData);
  if (typeof input === 'string') {
    return { error: input };
  }
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) {
    redirect('/?expired=1');
  }
  let result;
  let failure: unknown;
  try {
    result = await coreClient().changePassword(sessionToken, input);
  } catch (error: unknown) {
    failure = error;
  }
  if (isExpired(failure)) {
    await clearInstructorSessionToken();
    redirect('/?expired=1');
  }
  if (failure !== undefined) {
    return { error: mapCoreError(failure) };
  }
  if (result === undefined) {
    return { error: 'unavailable' };
  }
  await setInstructorSessionToken(result.sessionToken);
  redirect('/?passwordSet=1');
}

export async function logoutAction(): Promise<AuthActionState> {
  const sessionToken = await readInstructorSessionToken();
  let failure: unknown;
  if (sessionToken !== null) {
    try {
      await coreClient().logout(sessionToken);
    } catch (error: unknown) {
      failure = error;
    }
  }
  if (failure !== undefined && !isExpired(failure)) {
    return { error: mapCoreError(failure) };
  }
  await clearInstructorSessionToken();
  redirect('/');
}

export async function clearExpiredSessionAction(): Promise<void> {
  await clearInstructorSessionToken();
  redirect('/');
}

function coreClient(): InstructorAuthCoreClient {
  return new InstructorAuthCoreClient(getInstructorServerEnvironment());
}
