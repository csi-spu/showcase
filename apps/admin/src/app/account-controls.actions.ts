'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import {
  isAccountControlSessionExpired,
  mapAccountControlError,
} from './account-controls-action-policy';
import type { AcademicYearActionState, StudentAccountActionState } from './account-controls-state';
import { AdminAccountControlsCoreClient } from '@/lib/admin-account-controls-core';
import { clearAdminSessionToken, readAdminSessionToken } from '@/lib/admin-auth-session';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import {
  validateAcademicYearUpdate,
  validateStudentAccountOperation,
} from '@/lib/account-controls-validation';

export async function updateAcademicYearAction(
  previousState: AcademicYearActionState,
  formData: FormData,
): Promise<AcademicYearActionState> {
  const input = validateAcademicYearUpdate(formData);
  if (input === null) return { ...previousState, error: 'invalid' };
  const sessionToken = await requireSessionToken();
  try {
    const settings = await coreClient().updateAcademicYear(sessionToken, input);
    return { error: null, idempotencyKey: randomUUID(), settings };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      error: mapAccountControlError(error),
      idempotencyKey: input.idempotencyKey,
      settings: previousState.settings,
    };
  }
}

export async function manageStudentAccountAction(
  previousState: StudentAccountActionState,
  formData: FormData,
): Promise<StudentAccountActionState> {
  const input = validateStudentAccountOperation(formData);
  if (input === null) return { ...previousState, error: 'invalid', temporaryPassword: null };
  const sessionToken = await requireSessionToken();
  try {
    if (input.operation === 'lookup') {
      const student = await coreClient().findStudent(sessionToken, input.studentId);
      return {
        error: null,
        idempotencyKey: randomUUID(),
        student,
        temporaryPassword: null,
      };
    }
    if (input.operation === 'extend') {
      const student = await coreClient().extendStudentAccess(sessionToken, input.studentAccountId, {
        accessEndsAcademicYear: input.accessEndsAcademicYear,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
      });
      return {
        error: null,
        idempotencyKey: randomUUID(),
        student,
        temporaryPassword: null,
      };
    }
    if (input.operation === 'correctName') {
      const student = await coreClient().correctStudentName(sessionToken, input.studentAccountId, {
        expectedVersion: input.expectedVersion,
        firstNameTh: input.firstNameTh,
        idempotencyKey: input.idempotencyKey,
        lastNameTh: input.lastNameTh,
        reason: input.reason,
      });
      return {
        error: null,
        idempotencyKey: randomUUID(),
        student,
        temporaryPassword: null,
      };
    }
    const result = await coreClient().resetStudentPassword(sessionToken, input.studentAccountId, {
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      error: null,
      idempotencyKey: randomUUID(),
      student: result.student,
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      error: mapAccountControlError(error),
      idempotencyKey:
        input.operation === 'lookup' ? previousState.idempotencyKey : input.idempotencyKey,
      student: input.operation === 'lookup' ? null : previousState.student,
      temporaryPassword: null,
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
