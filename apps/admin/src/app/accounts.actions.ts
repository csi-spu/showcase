'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import {
  isAccountControlSessionExpired,
  mapAccountControlError,
} from './account-controls-action-policy';
import type { CreateAdminActionState, SetAdminStatusActionState } from './accounts-state';
import { AdminAccountControlsCoreClient } from '@/lib/admin-account-controls-core';
import { clearAdminSessionToken, readAdminSessionToken } from '@/lib/admin-auth-session';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { validateCreateAdmin, validateSetAdminStatus } from '@/lib/accounts-validation';

export async function createAdminAction(
  previousState: CreateAdminActionState,
  formData: FormData,
): Promise<CreateAdminActionState> {
  const input = validateCreateAdmin(formData);
  if (input === null) {
    return {
      admin: null,
      error: 'invalid',
      idempotencyKey: previousState.idempotencyKey,
      temporaryPassword: null,
    };
  }
  const sessionToken = await requireSessionToken();
  try {
    const result = await coreClient().createAdmin(sessionToken, input);
    return {
      admin: result.admin,
      error: null,
      idempotencyKey: randomUUID(),
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      admin: null,
      error: mapAccountControlError(error),
      idempotencyKey: previousState.idempotencyKey,
      temporaryPassword: null,
    };
  }
}

export async function setAdminStatusAction(
  previousState: SetAdminStatusActionState,
  formData: FormData,
): Promise<SetAdminStatusActionState> {
  const input = validateSetAdminStatus(formData);
  if (input === null) {
    return {
      admin: previousState.admin,
      error: 'invalid',
      idempotencyKey: previousState.idempotencyKey,
    };
  }
  const sessionToken = await requireSessionToken();
  try {
    const admin = await coreClient().setAdminStatus(sessionToken, input.accountId, {
      action: input.action,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
    });
    return {
      admin: { ...admin, createdAt: admin.createdAt },
      error: null,
      idempotencyKey: randomUUID(),
    };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      admin: previousState.admin,
      error: mapAccountControlError(error),
      idempotencyKey: input.idempotencyKey,
    };
  }
}

async function requireSessionToken(): Promise<string> {
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  return sessionToken;
}

async function expireSessionIfRequired(error: unknown): Promise<void> {
  if (!isAccountControlSessionExpired(error)) return;
  await clearAdminSessionToken();
  redirect('/?expired=1');
}

function coreClient(): AdminAccountControlsCoreClient {
  return new AdminAccountControlsCoreClient(getAdminServerEnvironment());
}
