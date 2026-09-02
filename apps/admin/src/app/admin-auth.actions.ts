'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AuthActionState } from './admin-auth-action-state';
import { isExpired, mapCoreError, sourceAddress } from './admin-auth-action-policy';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { AdminAuthCoreClient } from '@/lib/admin-auth-core';
import {
  clearAdminSessionToken,
  readAdminSessionToken,
  setAdminSessionToken,
} from '@/lib/admin-auth-session';
import { validateLogin, validatePasswordChange } from '@/lib/admin-auth-validation';

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
  await setAdminSessionToken(result.sessionToken);
  redirect('/');
}

export async function changePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const input = validatePasswordChange(formData);
  if (typeof input === 'string') {
    return { error: input };
  }
  const sessionToken = await readAdminSessionToken();
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
    await clearAdminSessionToken();
    redirect('/?expired=1');
  }
  if (failure !== undefined) {
    return { error: mapCoreError(failure) };
  }
  if (result === undefined) {
    return { error: 'unavailable' };
  }
  await setAdminSessionToken(result.sessionToken);
  redirect('/?passwordSet=1');
}

export async function logoutAction(): Promise<AuthActionState> {
  const sessionToken = await readAdminSessionToken();
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
  await clearAdminSessionToken();
  redirect('/');
}

export async function clearExpiredSessionAction(): Promise<void> {
  await clearAdminSessionToken();
  redirect('/');
}

function coreClient(): AdminAuthCoreClient {
  return new AdminAuthCoreClient(getAdminServerEnvironment());
}
