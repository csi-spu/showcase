'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AuthActionState, AuthErrorMessage } from './student-auth-action-state';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentAuthCoreClient, StudentAuthCoreError } from '@/lib/student-auth-core';
import {
  clearStudentSessionToken,
  readStudentSessionToken,
  setStudentSessionToken,
} from '@/lib/student-auth-session';
import { validateLogin, validatePasswordChange } from '@/lib/student-auth-validation';

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
    result = await coreClient().login({
      ...input,
      sourceAddress: sourceAddress(await headers()),
    });
  } catch (error: unknown) {
    return { error: mapCoreError(error) };
  }
  await setStudentSessionToken(result.sessionToken);
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
  const sessionToken = await readStudentSessionToken();
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
    await clearStudentSessionToken();
    redirect('/?expired=1');
  }
  if (failure !== undefined) {
    return { error: mapCoreError(failure) };
  }
  if (result === undefined) {
    return { error: 'unavailable' };
  }
  await setStudentSessionToken(result.sessionToken);
  redirect('/');
}

export async function logoutAction(): Promise<AuthActionState> {
  const sessionToken = await readStudentSessionToken();
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
  await clearStudentSessionToken();
  redirect('/');
}

export async function clearExpiredSessionAction(): Promise<void> {
  await clearStudentSessionToken();
  redirect('/');
}

function coreClient(): StudentAuthCoreClient {
  return new StudentAuthCoreClient(getStudentServerEnvironment());
}

function sourceAddress(requestHeaders: Pick<Headers, 'get'>): string {
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
  const value = requestHeaders.get('x-real-ip')?.trim() || forwarded || 'unknown';
  return value.length <= 128 ? value : 'unknown';
}

function isExpired(error: unknown): boolean {
  return (
    error instanceof StudentAuthCoreError &&
    ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  );
}

function mapCoreError(error: unknown): AuthErrorMessage {
  if (!(error instanceof StudentAuthCoreError)) {
    return 'network';
  }
  if (error.code === 'INVALID_CREDENTIALS') {
    return 'credentials';
  }
  if (error.code === 'RATE_LIMITED') {
    return 'rateLimited';
  }
  if (error.code === 'INVALID_PASSWORD') {
    return 'passwordPolicy';
  }
  if (isExpired(error)) {
    return 'sessionExpired';
  }
  return error.code === 'AUTH_SERVICE_UNAVAILABLE' ? 'network' : 'unavailable';
}
