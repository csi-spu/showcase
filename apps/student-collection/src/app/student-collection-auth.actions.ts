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
  returnTo: string | null,
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const input = validatePasswordChange(formData);
  if (typeof input === 'string') {
    return { error: input };
  }
  /*
   * A first-login Student may be on their way to a deeplink, so the return
   * path rides through this step exactly as it does through login -- and
   * through an expired session too, so signing in again still reaches it.
   */
  const destination = parseStudentCollectionReturnTo(returnTo ?? undefined);
  const sessionToken = await readStudentCollectionSessionToken();
  if (sessionToken === null) {
    redirect(entryPath({ isSessionExpired: true, returnTo: destination }));
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
    redirect(entryPath({ isSessionExpired: true, returnTo: destination }));
  }
  if (failure !== undefined) {
    return { error: mapCoreError(failure) };
  }
  if (result === undefined) {
    return { error: 'unavailable' };
  }
  await setStudentCollectionSessionToken(result.sessionToken);
  redirect(withPasswordSetFlag(destination ?? '/'));
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

export async function clearExpiredSessionAction(returnTo: string | null): Promise<void> {
  await clearStudentCollectionSessionToken();
  redirect(
    entryPath({
      isSessionExpired: false,
      returnTo: parseStudentCollectionReturnTo(returnTo ?? undefined),
    }),
  );
}

/** "/" carrying the sign-in state flags; `returnTo` must already be validated. */
function entryPath({
  isSessionExpired,
  returnTo,
}: {
  isSessionExpired: boolean;
  returnTo: string | null;
}): string {
  const query = new URLSearchParams();
  if (isSessionExpired) query.set('expired', '1');
  if (returnTo !== null) query.set('returnTo', returnTo);
  const search = query.toString();
  return search === '' ? '/' : `/?${search}`;
}

/*
 * The destination confirms the new password once (see PasswordSetToast), then
 * drops this flag from the URL so a reload or a shared link never repeats it.
 */
function withPasswordSetFlag(path: string): string {
  const url = new URL(path, 'https://student-collection.invalid');
  url.searchParams.set('passwordSet', '1');
  return `${url.pathname}${url.search}${url.hash}`;
}

function coreClient(): StudentCollectionAuthCoreClient {
  return new StudentCollectionAuthCoreClient(getStudentCollectionServerEnvironment());
}
