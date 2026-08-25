'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { clearAdminSessionToken, readAdminSessionToken } from '@/lib/admin-auth-session';
import { validateChangeRequest } from '@/lib/admin-review-validation';
import { AdminReviewsCoreClient, AdminReviewsCoreError } from '@/lib/admin-reviews-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import type { ChangeRequestActionState } from './change-request-form';

export async function requestChangesAction(
  revisionPublicId: string,
  previousState: ChangeRequestActionState,
  formData: FormData,
): Promise<ChangeRequestActionState> {
  const parsedRevisionPublicId = z.uuid().safeParse(revisionPublicId);
  const input = validateChangeRequest(formData);
  if (!parsedRevisionPublicId.success || input === null) {
    return { ...previousState, error: 'invalid', isComplete: false };
  }
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  try {
    await new AdminReviewsCoreClient(getAdminServerEnvironment()).requestChanges(
      sessionToken,
      parsedRevisionPublicId.data,
      input,
    );
    return { error: null, idempotencyKey: input.idempotencyKey, isComplete: true };
  } catch (error: unknown) {
    if (
      error instanceof AdminReviewsCoreError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      await clearAdminSessionToken();
      redirect('/?expired=1');
    }
    return {
      error: mapReviewError(error),
      idempotencyKey: input.idempotencyKey,
      isComplete: false,
    };
  }
}

function mapReviewError(error: unknown): ChangeRequestActionState['error'] {
  if (!(error instanceof AdminReviewsCoreError)) return 'network';
  if (
    [
      'WORK_IDEMPOTENCY_CONFLICT',
      'WORK_REVISION_NOT_FOUND',
      'WORK_REVISION_STATE_CONFLICT',
      'WORK_REVISION_VERSION_CONFLICT',
    ].includes(error.code)
  ) {
    return 'stale';
  }
  if (['INVALID_REQUEST', 'WORK_CHANGE_REQUEST_INVALID'].includes(error.code)) return 'invalid';
  return error.code === 'AUTH_SERVICE_UNAVAILABLE' ? 'network' : 'unavailable';
}
