'use server';

import { redirect } from 'next/navigation';
import {
  deletedAncestor,
  isExpired,
  mapCollectionDeletionsError,
} from './collection-deletions-action-policy';
import type {
  DeleteCollectionItemActionState,
  RestoreCollectionDeletionActionState,
} from './collection-deletions-state';
import {
  validateDeleteItem,
  validateDeletionLogCursor,
  validateDeletionTarget,
  validateRestore,
} from '@/lib/collection-deletions-validation';
import { InstructorCollectionDeletionsCoreClient } from '@/lib/instructor-collection-deletions-core';
import type {
  CollectionDeletionKind,
  DeletionLogReadResult,
  DeletionPreviewReadResult,
} from '@/lib/instructor-collection-deletions-contract';
import {
  clearInstructorSessionToken,
  readInstructorSessionToken,
} from '@/lib/instructor-auth-session';
import { getInstructorServerEnvironment } from '@/lib/server-environment';

export async function previewCollectionDeletionAction(
  kind: CollectionDeletionKind,
  id: string,
): Promise<DeletionPreviewReadResult> {
  const target = validateDeletionTarget(kind, id);
  if (target === null) return { error: 'notFound', ok: false };
  const sessionToken = await requireSessionToken();
  try {
    return {
      ok: true,
      preview: await coreClient().previewDeletion(sessionToken, target.kind, target.id),
    };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      error: mapCollectionDeletionsError(error) === 'notFound' ? 'notFound' : 'unavailable',
      ok: false,
    };
  }
}

export async function deleteCollectionItemAction(
  kind: CollectionDeletionKind,
  id: string,
  _previousState: DeleteCollectionItemActionState,
  formData: FormData,
): Promise<DeleteCollectionItemActionState> {
  const target = validateDeletionTarget(kind, id);
  const input = validateDeleteItem(formData);
  if (target === null || input === null) return { deletionId: null, error: 'invalid' };
  const sessionToken = await requireSessionToken();
  try {
    const result = await coreClient().deleteItem(sessionToken, target.kind, target.id, input);
    return { deletionId: result.deletionId, error: null };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return { deletionId: null, error: mapCollectionDeletionsError(error) };
  }
}

export async function readCollectionDeletionsAction(
  cursor: string | null,
): Promise<DeletionLogReadResult> {
  const input = validateDeletionLogCursor(cursor);
  if (input === null) return { ok: false };
  const sessionToken = await requireSessionToken();
  try {
    return { ok: true, page: await coreClient().listDeletions(sessionToken, input.cursor) };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return { ok: false };
  }
}

export async function restoreCollectionDeletionAction(
  deletionId: string,
  _previousState: RestoreCollectionDeletionActionState,
  formData: FormData,
): Promise<RestoreCollectionDeletionActionState> {
  const input = validateRestore(deletionId, formData);
  if (input === null) return { ancestor: null, error: 'invalid', isRestored: false };
  const sessionToken = await requireSessionToken();
  try {
    await coreClient().restoreDeletion(sessionToken, input.deletionId, { reason: input.reason });
    return { ancestor: null, error: null, isRestored: true };
  } catch (error: unknown) {
    await expireSessionIfRequired(error);
    return {
      ancestor: deletedAncestor(error),
      error: mapCollectionDeletionsError(error),
      isRestored: false,
    };
  }
}

async function requireSessionToken(): Promise<string> {
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');
  return sessionToken;
}

async function expireSessionIfRequired(error: unknown): Promise<void> {
  if (!isExpired(error)) return;
  await clearInstructorSessionToken();
  redirect('/?expired=1');
}

function coreClient(): InstructorCollectionDeletionsCoreClient {
  return new InstructorCollectionDeletionsCoreClient(getInstructorServerEnvironment());
}
