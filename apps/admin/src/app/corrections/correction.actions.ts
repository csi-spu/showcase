'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { clearAdminSessionToken, readAdminSessionToken } from '@/lib/admin-auth-session';
import { validateAdminCorrection } from '@/lib/admin-correction-validation';
import { AdminReviewsCoreClient, AdminReviewsCoreError } from '@/lib/admin-reviews-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import type { AdminCorrectionActionState } from './admin-correction-form';

export async function createAdminCorrectionAction(
  workPublicId: string,
  previousState: AdminCorrectionActionState,
  formData: FormData,
): Promise<AdminCorrectionActionState> {
  const parsedWorkPublicId = z.uuid().safeParse(workPublicId);
  const input = validateAdminCorrection(formData);
  if (!parsedWorkPublicId.success || input === null) {
    return { ...previousState, error: 'invalid', revisionPublicId: null };
  }
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  try {
    const result = await new AdminReviewsCoreClient(getAdminServerEnvironment()).createCorrection(
      sessionToken,
      parsedWorkPublicId.data,
      input,
    );
    return {
      error: null,
      idempotencyKey: input.idempotencyKey,
      revisionPublicId: result.revision.publicId,
    };
  } catch (error: unknown) {
    if (
      error instanceof AdminReviewsCoreError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      await clearAdminSessionToken();
      redirect('/?expired=1');
    }
    return {
      error: mapCorrectionError(error),
      idempotencyKey: input.idempotencyKey,
      revisionPublicId: null,
    };
  }
}

function mapCorrectionError(error: unknown): AdminCorrectionActionState['error'] {
  if (!(error instanceof AdminReviewsCoreError)) return 'network';
  if (
    [
      'WORK_ADMIN_CORRECTION_STATE_CONFLICT',
      'WORK_BASE_REVISION_CONFLICT',
      'WORK_IDEMPOTENCY_CONFLICT',
      'WORK_NOT_FOUND',
      'WORK_PENDING_REVISION_EXISTS',
      'WORK_REVISION_VERSION_CONFLICT',
    ].includes(error.code)
  ) {
    return 'stale';
  }
  if (['INVALID_REQUEST', 'WORK_ADMIN_CORRECTION_INVALID'].includes(error.code)) return 'invalid';
  return error.code === 'AUTH_SERVICE_UNAVAILABLE' ? 'network' : 'unavailable';
}
