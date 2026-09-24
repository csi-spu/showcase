'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AuthActionState } from './student-collection-auth-action-state';
import { isExpired, mapCoreError, sourceAddress } from './student-collection-auth-action-policy';
import { getStudentCollectionServerEnvironment } from '@/lib/server-environment';
import { StudentCollectionAuthCoreClient } from '@/lib/student-collection-auth-core';
import {
  clearStudentCollectionSessionToken,
  readStudentCollectionSessionToken,
  setStudentCollectionSessionToken,
} from '@/lib/student-collection-auth-session';
import { validateLogin, validatePasswordChange } from '@/lib/student-collection-auth-validation';
import { parseStudentCollectionReturnTo } from '@/lib/student-collection-return-to';

export async function loginAction(
  returnTo: string | null,
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
  await setStudentCollectionSessionToken(result.sessionToken);
  /*
   * A deeplink brought the Student here to sign in, so login sends them
   * straight back to it rather than to the dashboard. Re-validated here too:
   * this value crosses the same trust boundary a second time.
   */
  redirect(parseStudentCollectionReturnTo(returnTo ?? undefined) ?? '/');
}

export async function changePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const input = validatePasswordChange(formData);
  if (typeof input === 'string') {
    return { error: input };
  }
  const sessionToken = await readStudentCollectionSessionToken();
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
    await clearStudentCollectionSessionToken();
    redirect('/?expired=1');
  }
  if (failure !== undefined) {
    return { error: mapCoreError(failure) };
  }
  if (result === undefined) {
    return { error: 'unavailable' };
  }
  await setStudentCollectionSessionToken(result.sessionToken);
  redirect('/?passwordSet=1');
}

export async function logoutAction(): Promise<AuthActionState> {
  const sessionToken = await readStudentCollectionSessionToken();
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
  await clearStudentCollectionSessionToken();
  redirect('/');
}

export async function clearExpiredSessionAction(): Promise<void> {
  await clearStudentCollectionSessionToken();
  redirect('/');
}

function coreClient(): StudentCollectionAuthCoreClient {
  return new StudentCollectionAuthCoreClient(getStudentCollectionServerEnvironment());
}
