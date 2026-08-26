'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { clearAdminSessionToken, readAdminSessionToken } from '@/lib/admin-auth-session';
import { AdminReviewsCoreClient, AdminReviewsCoreError } from '@/lib/admin-reviews-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import type { RecoveryActionError, RecoveryActionState } from './recovery-action-state';

export async function transitionWorkRecoveryAction(
  workPublicId: string,
  previousState: RecoveryActionState,
  formData: FormData,
): Promise<RecoveryActionState> {
  const parsed = z
    .object({
      expectedVersion: z.coerce.number().int().positive(),
      idempotencyKey: z.uuid(),
      operation: z.enum(['archive', 'restore_active', 'restore_publication', 'unpublish']),
      reason: z.string().trim().min(10).max(1_000),
      workPublicId: z.uuid(),
    })
    .safeParse({
      expectedVersion: formData.get('expectedVersion'),
      idempotencyKey: formData.get('idempotencyKey'),
      operation: formData.get('operation'),
      reason: formData.get('reason'),
      workPublicId,
    });
  if (!parsed.success) return failed(previousState, 'invalid');
  try {
    await client().transitionWork(await sessionToken(), parsed.data.workPublicId, {
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
      operation: parsed.data.operation,
      reason: parsed.data.reason,
    });
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return failed(previousState, mapError(error));
  }
  revalidatePath('/recovery');
  revalidatePath(`/recovery/${parsed.data.workPublicId}`);
  return { error: null, idempotencyKey: randomUUID(), success: true };
}

export async function decideRemovalRequestAction(
  requestPublicId: string,
  workPublicId: string,
  previousState: RecoveryActionState,
  formData: FormData,
): Promise<RecoveryActionState> {
  const parsed = z
    .object({
      decision: z.enum(['approve', 'decline']),
      decisionReason: z.string().trim().max(1_000).optional(),
      expectedVersion: z.coerce.number().int().positive(),
      expectedWorkVersion: z.coerce.number().int().positive(),
      idempotencyKey: z.uuid(),
      requestPublicId: z.uuid(),
      workPublicId: z.uuid(),
    })
    .refine((input) => input.decision === 'approve' || (input.decisionReason?.length ?? 0) >= 10, {
      path: ['decisionReason'],
    })
    .safeParse({
      decision: formData.get('decision'),
      decisionReason: formData.get('decisionReason') || undefined,
      expectedVersion: formData.get('expectedVersion'),
      expectedWorkVersion: formData.get('expectedWorkVersion'),
      idempotencyKey: formData.get('idempotencyKey'),
      requestPublicId,
      workPublicId,
    });
  if (!parsed.success) return failed(previousState, 'invalid');
  try {
    await client().decideRemovalRequest(await sessionToken(), parsed.data.requestPublicId, {
      decision: parsed.data.decision,
      ...(parsed.data.decisionReason === undefined
        ? {}
        : { decisionReason: parsed.data.decisionReason }),
      expectedVersion: parsed.data.expectedVersion,
      expectedWorkVersion: parsed.data.expectedWorkVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return failed(previousState, mapError(error));
  }
  revalidatePath('/recovery');
  revalidatePath(`/recovery/${parsed.data.workPublicId}`);
  return { error: null, idempotencyKey: randomUUID(), success: true };
}

export async function decideAttributionRemovalRequestAction(
  requestPublicId: string,
  previousState: RecoveryActionState,
  formData: FormData,
): Promise<RecoveryActionState> {
  const parsed = z
    .object({
      decision: z.enum(['accept', 'decline']),
      decisionReason: z.string().trim().max(1_000).optional(),
      expectedVersion: z.coerce.number().int().positive(),
      idempotencyKey: z.uuid(),
      requestPublicId: z.uuid(),
    })
    .refine((input) => input.decision === 'accept' || (input.decisionReason?.length ?? 0) >= 10, {
      path: ['decisionReason'],
    })
    .safeParse({
      decision: formData.get('decision'),
      decisionReason: formData.get('decisionReason') || undefined,
      expectedVersion: formData.get('expectedVersion'),
      idempotencyKey: formData.get('idempotencyKey'),
      requestPublicId,
    });
  if (!parsed.success) return failed(previousState, 'invalid');
  try {
    await client().decideAttributionRemovalRequest(
      await sessionToken(),
      parsed.data.requestPublicId,
      {
        decision: parsed.data.decision,
        ...(parsed.data.decisionReason === undefined
          ? {}
          : { decisionReason: parsed.data.decisionReason }),
        expectedVersion: parsed.data.expectedVersion,
        idempotencyKey: parsed.data.idempotencyKey,
      },
    );
  } catch (error: unknown) {
    await redirectExpiredSession(error);
    return failed(previousState, mapError(error));
  }
  revalidatePath('/recovery');
  return { error: null, idempotencyKey: randomUUID(), success: true };
}

function client() {
  return new AdminReviewsCoreClient(getAdminServerEnvironment());
}

async function sessionToken(): Promise<string> {
  const token = await readAdminSessionToken();
  if (token === null) redirect('/?expired=1');
  return token;
}

function failed(state: RecoveryActionState, error: RecoveryActionError): RecoveryActionState {
  return { ...state, error, success: false };
}

function mapError(error: unknown): RecoveryActionError {
  if (!(error instanceof AdminReviewsCoreError)) return 'network';
  if (
    [
      'REMOVAL_REQUEST_STATE_CONFLICT',
      'WORK_IDEMPOTENCY_CONFLICT',
      'WORK_RECOVERY_STATE_CONFLICT',
      'WORK_RECOVERY_VERSION_CONFLICT',
    ].includes(error.code)
  ) {
    return 'conflict';
  }
  if (['INVALID_REQUEST', 'WORK_RECOVERY_REASON_INVALID'].includes(error.code)) return 'invalid';
  if (['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)) return 'unavailable';
  return error.code === 'WORKS_SERVICE_UNAVAILABLE' ? 'network' : 'unavailable';
}

async function redirectExpiredSession(error: unknown): Promise<void> {
  if (
    error instanceof AdminReviewsCoreError &&
    ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
  ) {
    await clearAdminSessionToken();
    redirect('/?expired=1');
  }
}
