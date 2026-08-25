'use server';

import { redirect } from 'next/navigation';
import { isExpired } from './admin-auth-action-policy';
import type { RosterUploadActionState, RosterUploadErrorMessage } from './roster-upload-state';
import { AdminRosterCoreClient, AdminRosterCoreError } from '@/lib/admin-roster-core';
import { clearAdminSessionToken, readAdminSessionToken } from '@/lib/admin-auth-session';
import { getAdminServerEnvironment } from '@/lib/server-environment';
import { validateRosterUpload } from '@/lib/roster-upload-validation';

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
      input.entryYear,
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

function mapRosterError(error: unknown): RosterUploadErrorMessage {
  if (!(error instanceof AdminRosterCoreError)) return 'unavailable';
  if (error.code === 'ROSTER_FILE_TOO_LARGE') return 'fileTooLarge';
  if (
    [
      'DUPLICATE_STUDENT_ID',
      'ENTRY_YEAR_MISMATCH',
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
  if (error.code === 'INVALID_ENTRY_YEAR') return 'entryYear';
  return 'unavailable';
}

function coreClient(): AdminRosterCoreClient {
  return new AdminRosterCoreClient(getAdminServerEnvironment());
}
