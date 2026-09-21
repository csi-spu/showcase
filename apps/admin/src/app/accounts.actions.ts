'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import {
  isAccountControlSessionExpired,
  mapAccountControlError,
} from './account-controls-action-policy';
import type {
  CreateAdminActionState,
  CreateInstructorActionState,
  InstructorRoleActionState,
  SetAdminStatusActionState,
} from './accounts-state';
import { AdminAccountControlsCoreClient } from '@/lib/admin-account-controls-core';
import { clearAdminSessionToken, readAdminSessionToken } from '@/lib/admin-auth-session';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import {
  validateCreateAdmin,
  validateCreateInstructor,
  validateInstructorRoleAction,
  validateSetAdminStatus,
} from '@/lib/accounts-validation';

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

export async function createInstructorAction(
  previousState: CreateInstructorActionState,
  formData: FormData,
): Promise<CreateInstructorActionState> {
  const input = validateCreateInstructor(formData);
  if (input === null) {
    return {
      error: 'invalid',
      idempotencyKey: previousState.idempotencyKey,
      instructor: null,
      temporaryPassword: null,
    };
  }
  const sessionToken = await requireSessionToken();
  try {
    const result = await coreClient().createInstructor(sessionToken, input);
    return {
      error: null,
      idempotencyKey: randomUUID(),
      instructor: result.instructor,
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      error: mapAccountControlError(error),
      idempotencyKey: previousState.idempotencyKey,
      instructor: null,
      temporaryPassword: null,
    };
  }
}

export async function grantInstructorRoleAction(
  previousState: InstructorRoleActionState,
  formData: FormData,
): Promise<InstructorRoleActionState> {
  return applyInstructorRoleAction(
    previousState,
    formData,
    (client, sessionToken, accountId, input) =>
      client.grantInstructorRole(sessionToken, accountId, { idempotencyKey: input.idempotencyKey }),
  );
}

export async function revokeInstructorRoleAction(
  previousState: InstructorRoleActionState,
  formData: FormData,
): Promise<InstructorRoleActionState> {
  return applyInstructorRoleAction(
    previousState,
    formData,
    (client, sessionToken, accountId, input) =>
      client.revokeInstructorRole(sessionToken, accountId, {
        idempotencyKey: input.idempotencyKey,
      }),
  );
}

async function applyInstructorRoleAction(
  previousState: InstructorRoleActionState,
  formData: FormData,
  apply: (
    client: AdminAccountControlsCoreClient,
    sessionToken: string,
    accountId: string,
    input: { accountId: string; idempotencyKey: string },
  ) => ReturnType<AdminAccountControlsCoreClient['grantInstructorRole']>,
): Promise<InstructorRoleActionState> {
  const input = validateInstructorRoleAction(formData);
  if (input === null) {
    return {
      error: 'invalid',
      idempotencyKey: previousState.idempotencyKey,
      instructor: previousState.instructor,
    };
  }
  const sessionToken = await requireSessionToken();
  try {
    const instructor = await apply(coreClient(), sessionToken, input.accountId, input);
    return { error: null, idempotencyKey: randomUUID(), instructor };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      error: mapAccountControlError(error),
      idempotencyKey: input.idempotencyKey,
      instructor: previousState.instructor,
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
