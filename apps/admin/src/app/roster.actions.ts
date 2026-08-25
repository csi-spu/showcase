'use server';

import { redirect } from 'next/navigation';
import { isExpired } from './admin-auth-action-policy';
import type { RosterUploadActionState, RosterUploadErrorMessage } from './roster-upload-state';
import type { RosterConflictActionState } from './roster-conflict-state';
import { AdminRosterCoreClient, AdminRosterCoreError } from '@/lib/admin-roster-core';
import { clearAdminSessionToken, readAdminSessionToken } from '@/lib/admin-auth-session';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { validateRosterUpload } from '@/lib/roster-upload-validation';
import { validateRosterConflictResolution } from '@/lib/roster-conflict-validation';

export async function uploadRosterAction(
  _state: RosterUploadActionState,
  formData: FormData,
): Promise<RosterUploadActionState> {
  const input = validateRosterUpload(formData);
  if (typeof input === 'string') return { error: input };
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  let batch;
  try {
    batch = await coreClient().createBatch(
      sessionToken,
      new Uint8Array(await input.file.arrayBuffer()),
    );
  } catch (error: unknown) {
    if (isExpired(error)) {
      await clearAdminSessionToken();
      redirect('/?expired=1');
    }
    return { error: mapRosterError(error) };
  }
  redirect(`/?batchId=${batch.batchId}`);
}

export async function resolveRosterConflictAction(
  _state: RosterConflictActionState,
  formData: FormData,
): Promise<RosterConflictActionState> {
  const input = validateRosterConflictResolution(formData);
  if (typeof input === 'string') return { error: input };
  const sessionToken = await readAdminSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  try {
    await coreClient().resolveConflict(sessionToken, input.conflictId, {
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      resolution: input.resolution,
    });
  } catch (error: unknown) {
    if (isExpired(error)) {
      await clearAdminSessionToken();
      redirect('/?expired=1');
    }
    if (
      error instanceof AdminRosterCoreError &&
      [
        'ROSTER_CONFLICT_IDEMPOTENCY_CONFLICT',
        'ROSTER_CONFLICT_NOT_FOUND',
        'ROSTER_CONFLICT_VERSION_CONFLICT',
      ].includes(error.code)
    ) {
      return { error: 'stale' };
    }
    if (
      error instanceof AdminRosterCoreError &&
      ['ROSTER_CONFLICT_REASON_INVALID', 'ROSTER_CONFLICT_REASON_REQUIRED'].includes(error.code)
    ) {
      return { error: 'reasonRequired' };
    }
    return { error: 'unavailable' };
  }
  redirect(`/?batchId=${input.batchId}&resolved=1`);
}

function mapRosterError(error: unknown): RosterUploadErrorMessage {
  if (!(error instanceof AdminRosterCoreError)) return 'unavailable';
  if (error.code === 'ROSTER_FILE_TOO_LARGE') return 'fileTooLarge';
  if (
    [
      'DUPLICATE_STUDENT_ID',
      'INVALID_FIRST_NAME',
      'INVALID_LAST_NAME',
      'INVALID_ROSTER_CSV',
      'INVALID_ROSTER_HEADER',
      'INVALID_STUDENT_ID',
      'INVALID_UTF8',
      'ROSTER_ROW_LIMIT_EXCEEDED',
    ].includes(error.code)
  ) {
    return 'fileInvalid';
  }
  return 'unavailable';
}

function coreClient(): AdminRosterCoreClient {
  return new AdminRosterCoreClient(getAdminServerEnvironment());
}
