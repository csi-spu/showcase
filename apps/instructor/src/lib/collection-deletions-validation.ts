import { z } from 'zod';
import {
  COLLECTION_DELETION_KINDS,
  CONFIRMATION_NAME_MAX_LENGTH,
  RESTORE_REASON_MAX_LENGTH,
  type CollectionDeletionKind,
} from './instructor-collection-deletions-contract';

const targetSchema = z.object({ id: z.uuid(), kind: z.enum(COLLECTION_DELETION_KINDS) });
const deleteSchema = z.object({
  confirmationName: z.string().trim().min(1).max(CONFIRMATION_NAME_MAX_LENGTH),
});
const restoreSchema = z.object({
  deletionId: z.uuid(),
  reason: z.string().trim().min(1).max(RESTORE_REASON_MAX_LENGTH),
});
/* Core issues base64url cursors; anything else never leaves the browser. */
const cursorSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/)
  .nullable();

/** The target of a delete, as the browser named it; Core rechecks it exists. */
export function validateDeletionTarget(
  kind: unknown,
  id: unknown,
): { id: string; kind: CollectionDeletionKind } | null {
  const result = targetSchema.safeParse({ id, kind });
  return result.success ? result.data : null;
}

export function validateDeleteItem(formData: FormData): { confirmationName: string } | null {
  const result = deleteSchema.safeParse({ confirmationName: formData.get('confirmationName') });
  return result.success ? result.data : null;
}

export function validateRestore(
  deletionId: unknown,
  formData: FormData,
): { deletionId: string; reason: string } | null {
  const result = restoreSchema.safeParse({ deletionId, reason: formData.get('reason') });
  return result.success ? result.data : null;
}

export function validateDeletionLogCursor(cursor: unknown): { cursor: string | null } | null {
  const result = cursorSchema.safeParse(cursor);
  return result.success ? { cursor: result.data } : null;
}
